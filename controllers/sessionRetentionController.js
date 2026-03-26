const fs = require('fs');
const path = require('path');
const Session = require('../models/session');
const SessionArchive = require('../models/sessionArchive');

const DEFAULT_RETENTION_BATCH_SIZE = 200;
const DEFAULT_RETENTION_INTERVAL_MIN = 60;
const DEFAULT_SESSION_RETENTION_DAYS = 90;
const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;
const MAX_ARCHIVE_RETENTION_DAYS = 90;

let retentionTimer = null;

const parsePositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const parseBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return fallback;
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    return fallback;
};

const getBatchSize = () => parsePositiveInt(process.env.RETENTION_BATCH_SIZE, DEFAULT_RETENTION_BATCH_SIZE);
const getIntervalMin = () => parsePositiveInt(process.env.RETENTION_JOB_INTERVAL_MIN, DEFAULT_RETENTION_INTERVAL_MIN);
const getRetentionDays = () => parsePositiveInt(process.env.SESSION_RETENTION_DAYS, DEFAULT_SESSION_RETENTION_DAYS);
const getArchiveRetentionDays = () => {
    const parsed = parsePositiveInt(process.env.ARCHIVE_RETENTION_DAYS, DEFAULT_ARCHIVE_RETENTION_DAYS);
    return Math.min(parsed, MAX_ARCHIVE_RETENTION_DAYS);
};

const addDays = (baseDate, days) => new Date(baseDate.getTime() + (days * 24 * 60 * 60 * 1000));

const buildBatchId = () => `ret_${new Date().toISOString().replace(/[.:]/g, '-')}_${Math.random().toString(36).slice(2, 8)}`;

const getAuditLogPath = () => path.join(process.cwd(), 'logs', 'reports', 'session-retention-runs.jsonl');

const appendAuditLog = async (entry) => {
    const logPath = getAuditLogPath();
    const dir = path.dirname(logPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
};

const sanitizeSessionForArchive = (session) => {
    const clone = { ...session };
    return clone;
};

const runRetentionCycle = async (options = {}) => {
    const startedAt = new Date();
    const now = options.now instanceof Date ? options.now : new Date();
    const apply = options.apply === true;
    const batchSize = parsePositiveInt(options.batchSize, getBatchSize());
    const retentionDays = getRetentionDays();
    const archiveRetentionDays = getArchiveRetentionDays();
    const batchId = options.batchId || buildBatchId();

    const expiredSessions = await Session.find(
        { expiresAt: { $lte: now } },
        {}
    )
        .sort({ expiresAt: 1 })
        .limit(batchSize)
        .lean();

    const candidateCount = expiredSessions.length;
    const sample = expiredSessions.slice(0, 10).map((s) => ({
        _id: String(s._id),
        uniqueID: s.uniqueID,
        expiresAt: s.expiresAt || null
    }));

    const result = {
        mode: apply ? 'APPLY' : 'DRY-RUN',
        startedAt: startedAt.toISOString(),
        endedAt: null,
        batchId,
        now: now.toISOString(),
        retentionDays,
        archiveRetentionDays,
        batchSize,
        candidates: candidateCount,
        archived: 0,
        deleted: 0,
        alreadyArchived: 0,
        skippedNotArchived: 0,
        sample,
        errors: []
    };

    if (!apply || candidateCount === 0) {
        result.endedAt = new Date().toISOString();
        await appendAuditLog(result);
        return result;
    }

    try {
        const archiveOps = expiredSessions.map((sessionDoc) => {
            const sourceSessionId = String(sessionDoc._id);
            return {
                updateOne: {
                    filter: { sourceSessionId },
                    update: {
                        $setOnInsert: {
                            sourceSessionId,
                            sourceUniqueID: sessionDoc.uniqueID || '',
                            sourceName: sessionDoc.name || '',
                            expiresAtAtArchive: sessionDoc.expiresAt || null,
                            archiveBatchId: batchId,
                            archivedAt: now,
                            archiveExpiresAt: addDays(now, archiveRetentionDays),
                            retentionPolicy: {
                                mode: 'sliding',
                                retentionDays,
                                archiveRetentionDays
                            },
                            session: sanitizeSessionForArchive(sessionDoc)
                        }
                    },
                    upsert: true
                }
            };
        });

        const archiveWriteResult = await SessionArchive.bulkWrite(archiveOps, { ordered: false });
        result.archived = Number(archiveWriteResult.upsertedCount || 0);

        const candidateSessionIds = expiredSessions.map((s) => String(s._id));
        const archivedDocs = await SessionArchive.find(
            { sourceSessionId: { $in: candidateSessionIds } },
            { sourceSessionId: 1 }
        ).lean();

        const archivedSet = new Set(archivedDocs.map((d) => String(d.sourceSessionId)));
        const deletableIds = expiredSessions
            .filter((s) => archivedSet.has(String(s._id)))
            .map((s) => s._id);

        result.alreadyArchived = Math.max(0, deletableIds.length - result.archived);
        result.skippedNotArchived = Math.max(0, candidateCount - deletableIds.length);

        if (deletableIds.length > 0) {
            const deleteResult = await Session.deleteMany({ _id: { $in: deletableIds } });
            result.deleted = Number(deleteResult.deletedCount || 0);

            await SessionArchive.updateMany(
                { sourceSessionId: { $in: deletableIds.map((id) => String(id)) } },
                { $set: { deletedFromLiveAt: now } }
            );
        }
    } catch (err) {
        result.errors.push(err && err.message ? err.message : String(err));
    }

    result.endedAt = new Date().toISOString();
    await appendAuditLog(result);
    return result;
};

const startSessionRetentionScheduler = () => {
    const enabled = parseBool(process.env.RETENTION_JOB_ENABLED, false);
    if (!enabled) {
        console.log('Session retention scheduler disabled (RETENTION_JOB_ENABLED=false).');
        return;
    }

    if (retentionTimer) {
        return;
    }

    const intervalMin = getIntervalMin();
    const intervalMs = intervalMin * 60 * 1000;
    const apply = parseBool(process.env.RETENTION_JOB_APPLY, false);

    console.log(`Session retention scheduler enabled: interval=${intervalMin}m mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

    retentionTimer = setInterval(async () => {
        try {
            const run = await runRetentionCycle({ apply });
            console.log('[retention] cycle complete', {
                mode: run.mode,
                candidates: run.candidates,
                archived: run.archived,
                deleted: run.deleted,
                errors: run.errors.length
            });
        } catch (err) {
            console.error('[retention] cycle failed:', err);
        }
    }, intervalMs);
};

const stopSessionRetentionScheduler = () => {
    if (!retentionTimer) return;
    clearInterval(retentionTimer);
    retentionTimer = null;
};

module.exports = {
    runRetentionCycle,
    startSessionRetentionScheduler,
    stopSessionRetentionScheduler
};
