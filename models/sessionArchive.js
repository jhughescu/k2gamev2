const mongoose = require('mongoose');

const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;
const MAX_ARCHIVE_RETENTION_DAYS = 90;

const parseArchiveRetentionDays = () => {
    const value = Number(process.env.ARCHIVE_RETENTION_DAYS);
    if (!Number.isInteger(value) || value <= 0) {
        return DEFAULT_ARCHIVE_RETENTION_DAYS;
    }
    return Math.min(value, MAX_ARCHIVE_RETENTION_DAYS);
};

const computeArchiveExpiresAt = (archivedAt) => {
    const base = archivedAt instanceof Date ? archivedAt : new Date(archivedAt || Date.now());
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + parseArchiveRetentionDays());
    return expiresAt;
};

const sessionArchiveSchema = new mongoose.Schema({
    sourceSessionId: {
        type: String,
        required: true,
        trim: true
    },
    sourceUniqueID: {
        type: String,
        trim: true
    },
    sourceName: {
        type: String,
        trim: true
    },
    expiresAtAtArchive: {
        type: Date,
        default: null
    },
    archiveBatchId: {
        type: String,
        required: true,
        trim: true
    },
    archivedAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    archiveExpiresAt: {
        type: Date,
        required: true,
        default: function defaultArchiveExpiresAt() {
            return computeArchiveExpiresAt(this.archivedAt || new Date());
        }
    },
    deletedFromLiveAt: {
        type: Date,
        default: null
    },
    retentionPolicy: {
        mode: { type: String, default: 'sliding' },
        retentionDays: { type: Number, default: 90 },
        archiveRetentionDays: { type: Number, default: 90 }
    },
    session: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, {
    strict: true,
    timestamps: true
});

sessionArchiveSchema.index({ sourceSessionId: 1 }, { unique: true });
sessionArchiveSchema.index({ archivedAt: -1 });
sessionArchiveSchema.index({ archiveBatchId: 1 });
sessionArchiveSchema.index({ archiveExpiresAt: 1 }, { expireAfterSeconds: 0, name: 'archiveExpiresAt_1' });

module.exports = mongoose.model('SessionArchive', sessionArchiveSchema);
