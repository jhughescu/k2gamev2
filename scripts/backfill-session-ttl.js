/**
 * Backfill TTL fields for existing Session documents.
 *
 * Dry run (default):
 *   node scripts/backfill-session-ttl.js
 *
 * Apply changes:
 *   node scripts/backfill-session-ttl.js --apply
 *
 * Optional overrides:
 *   SESSION_RETENTION_DAYS=90 node scripts/backfill-session-ttl.js --apply
 *   BACKFILL_BATCH_SIZE=500 node scripts/backfill-session-ttl.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('../models/session');

const DEFAULT_SESSION_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 500;

const getRetentionDays = () => {
    const raw = Number(process.env.SESSION_RETENTION_DAYS);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_SESSION_RETENTION_DAYS;
};

const getBatchSize = () => {
    const raw = Number(process.env.BACKFILL_BATCH_SIZE);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_BATCH_SIZE;
};

const isValidDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

const addDays = (baseDate, days) => new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

const parseLegacyDateNumber = (value) => {
    const digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (digits.length < 8) return null;

    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const hour = Number(digits.slice(8, 10) || '0');
    const minute = Number(digits.slice(10, 12) || '0');
    const second = Number(digits.slice(12, 14) || '0');

    if (!Number.isInteger(year) || year < 1970 || year > 9999) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isInteger(second) || second < 0 || second > 59) return null;

    const dt = new Date(year, month - 1, day, hour, minute, second);
    if (!isValidDate(dt)) return null;
    return dt;
};

const chooseLastAccessedAt = (doc) => {
    if (isValidDate(doc.lastAccessedAt)) return doc.lastAccessedAt;

    const fromDateAccessed = parseLegacyDateNumber(doc.dateAccessed);
    if (isValidDate(fromDateAccessed)) return fromDateAccessed;

    const fromDateId = parseLegacyDateNumber(doc.dateID);
    if (isValidDate(fromDateId)) return fromDateId;

    return new Date();
};

async function run() {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI;
    const retentionDays = getRetentionDays();
    const batchSize = getBatchSize();

    if (!uri) {
        console.error('MONGODB_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(uri);

    try {
        const total = await Session.countDocuments({});
        console.log(`[ttl-backfill] mode=${apply ? 'APPLY' : 'DRY-RUN'} totalSessions=${total} retentionDays=${retentionDays} batchSize=${batchSize}`);

        const cursor = Session.find(
            {},
            { _id: 1, uniqueID: 1, dateID: 1, dateAccessed: 1, lastAccessedAt: 1, expiresAt: 1 }
        ).lean().cursor();

        let scanned = 0;
        let needsUpdate = 0;
        let noOp = 0;
        let updatesApplied = 0;
        const sample = [];
        let ops = [];

        for await (const doc of cursor) {
            scanned += 1;

            const hasLastAccessedAt = isValidDate(doc.lastAccessedAt);
            const hasExpiresAt = isValidDate(doc.expiresAt);

            if (hasLastAccessedAt && hasExpiresAt) {
                noOp += 1;
                continue;
            }

            const chosenLastAccessedAt = chooseLastAccessedAt(doc);
            const updateSet = {};

            if (!hasLastAccessedAt) {
                updateSet.lastAccessedAt = chosenLastAccessedAt;
            }

            if (!hasExpiresAt) {
                updateSet.expiresAt = addDays(chosenLastAccessedAt, retentionDays);
            }

            if (Object.keys(updateSet).length > 0) {
                needsUpdate += 1;

                if (sample.length < 10) {
                    sample.push({
                        _id: String(doc._id),
                        uniqueID: doc.uniqueID,
                        set: {
                            lastAccessedAt: updateSet.lastAccessedAt ? updateSet.lastAccessedAt.toISOString() : undefined,
                            expiresAt: updateSet.expiresAt ? updateSet.expiresAt.toISOString() : undefined
                        }
                    });
                }

                if (apply) {
                    ops.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: { $set: updateSet }
                        }
                    });

                    if (ops.length >= batchSize) {
                        const result = await Session.bulkWrite(ops, { ordered: false });
                        updatesApplied += (result.modifiedCount || 0);
                        ops = [];
                    }
                }
            }
        }

        if (apply && ops.length > 0) {
            const result = await Session.bulkWrite(ops, { ordered: false });
            updatesApplied += (result.modifiedCount || 0);
        }

        console.log(`[ttl-backfill] scanned=${scanned} noOp=${noOp} needsUpdate=${needsUpdate}`);
        if (apply) {
            console.log(`[ttl-backfill] updatesApplied=${updatesApplied}`);
        }

        if (sample.length > 0) {
            console.log('[ttl-backfill] sample updates (first 10):');
            sample.forEach((item) => {
                console.log(JSON.stringify(item));
            });
        } else {
            console.log('[ttl-backfill] no documents require backfill.');
        }
    } finally {
        await mongoose.connection.close();
    }
}

run().catch(async (err) => {
    console.error('[ttl-backfill] failed:', err && err.stack ? err.stack : err);
    try {
        await mongoose.connection.close();
    } catch (_) {
        // ignore close errors in failure path
    }
    process.exit(1);
});
