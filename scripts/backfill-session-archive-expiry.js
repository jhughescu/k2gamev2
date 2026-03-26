/**
 * Backfill archive TTL fields for existing SessionArchive documents.
 *
 * Dry run (default):
 *   node scripts/backfill-session-archive-expiry.js
 *
 * Apply changes:
 *   node scripts/backfill-session-archive-expiry.js --apply
 *
 * Optional overrides:
 *   ARCHIVE_RETENTION_DAYS=90 node scripts/backfill-session-archive-expiry.js --apply
 *   BACKFILL_BATCH_SIZE=500 node scripts/backfill-session-archive-expiry.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SessionArchive = require('../models/sessionArchive');

const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;
const MAX_ARCHIVE_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 500;

const getArchiveRetentionDays = () => {
    const raw = Number(process.env.ARCHIVE_RETENTION_DAYS);
    if (!Number.isInteger(raw) || raw <= 0) {
        return DEFAULT_ARCHIVE_RETENTION_DAYS;
    }
    return Math.min(raw, MAX_ARCHIVE_RETENTION_DAYS);
};

const getBatchSize = () => {
    const raw = Number(process.env.BACKFILL_BATCH_SIZE);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_BATCH_SIZE;
};

const isValidDate = (value) => value instanceof Date && Number.isFinite(value.getTime());

const addDays = (baseDate, days) => new Date(baseDate.getTime() + (days * 24 * 60 * 60 * 1000));

const chooseArchivedAt = (doc) => {
    if (isValidDate(doc.archivedAt)) return doc.archivedAt;
    if (isValidDate(doc.createdAt)) return doc.createdAt;
    return new Date();
};

async function run() {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI;
    const archiveRetentionDays = getArchiveRetentionDays();
    const batchSize = getBatchSize();

    if (!uri) {
        console.error('MONGODB_URI not set in .env');
        process.exit(1);
    }

    await mongoose.connect(uri);

    try {
        const total = await SessionArchive.countDocuments({});
        console.log(`[archive-backfill] mode=${apply ? 'APPLY' : 'DRY-RUN'} totalArchives=${total} archiveRetentionDays=${archiveRetentionDays} batchSize=${batchSize}`);

        const cursor = SessionArchive.find(
            {},
            { _id: 1, sourceSessionId: 1, archivedAt: 1, createdAt: 1, archiveExpiresAt: 1 }
        ).lean().cursor();

        let scanned = 0;
        let needsUpdate = 0;
        let noOp = 0;
        let updatesApplied = 0;
        const sample = [];
        let ops = [];

        for await (const doc of cursor) {
            scanned += 1;

            const hasArchiveExpiresAt = isValidDate(doc.archiveExpiresAt);
            if (hasArchiveExpiresAt) {
                noOp += 1;
                continue;
            }

            const archivedAt = chooseArchivedAt(doc);
            const archiveExpiresAt = addDays(archivedAt, archiveRetentionDays);
            const updateSet = {
                archivedAt,
                archiveExpiresAt
            };

            needsUpdate += 1;

            if (sample.length < 10) {
                sample.push({
                    _id: String(doc._id),
                    sourceSessionId: doc.sourceSessionId || null,
                    set: {
                        archivedAt: archivedAt.toISOString(),
                        archiveExpiresAt: archiveExpiresAt.toISOString()
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
                    const result = await SessionArchive.bulkWrite(ops, { ordered: false });
                    updatesApplied += Number(result.modifiedCount || 0);
                    ops = [];
                }
            }
        }

        if (apply && ops.length > 0) {
            const result = await SessionArchive.bulkWrite(ops, { ordered: false });
            updatesApplied += Number(result.modifiedCount || 0);
        }

        console.log(`[archive-backfill] scanned=${scanned} noOp=${noOp} needsUpdate=${needsUpdate}`);
        if (apply) {
            console.log(`[archive-backfill] updatesApplied=${updatesApplied}`);
        }

        if (sample.length > 0) {
            console.log('[archive-backfill] sample updates (first 10):');
            sample.forEach((item) => {
                console.log(JSON.stringify(item));
            });
        } else {
            console.log('[archive-backfill] no documents require backfill.');
        }
    } finally {
        await mongoose.connection.close();
    }
}

run().catch(async (err) => {
    console.error('[archive-backfill] failed:', err && err.stack ? err.stack : err);
    try {
        await mongoose.connection.close();
    } catch (_) {
        // ignore close errors in failure path
    }
    process.exit(1);
});
