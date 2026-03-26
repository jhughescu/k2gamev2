const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const isFiniteNumber = (value) => Number.isFinite(value);
const DEFAULT_SESSION_RETENTION_DAYS = 90;

const parseBool = (value, fallback = true) => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return fallback;
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
    return fallback;
};

const isSessionTtlIndexEnabled = () => parseBool(process.env.SESSION_TTL_INDEX_ENABLED, true);

const getSessionRetentionDays = () => {
    const raw = Number(process.env.SESSION_RETENTION_DAYS);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_SESSION_RETENTION_DAYS;
};

const getSessionExpiryFrom = (baseDate = new Date()) => {
    const retentionDays = getSessionRetentionDays();
    return new Date(baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
};

const sessionSchema = new Schema({
    uniqueID: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    dateID: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator: isFiniteNumber,
            message: 'dateID must be a valid number'
        }
    },
    dateAccessed: {
        type: Number,
        required: true,
        min: 0,
        validate: {
            validator: isFiniteNumber,
            message: 'dateAccessed must be a valid number'
        }
    },
    lastAccessedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => getSessionExpiryFrom(new Date())
    },
    playTime: {
        type: Number,
        min: 0,
        default: 0,
        validate: {
            validator: isFiniteNumber,
            message: 'playTime must be a valid number'
        }
    },
    type: {
        type: Number,
        required: true,
        validate: {
            validator: isFiniteNumber,
            message: 'type must be a valid number'
        }
    },
    teamRef: {
        type: Number,
        required: true,
        validate: {
            validator: isFiniteNumber,
            message: 'teamRef must be a valid number'
        }
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    time: {
        type: Number,
        min: 0,
        default: 0,
        validate: {
            validator: isFiniteNumber,
            message: 'time must be a valid number'
        }
    },
    supportTeamRef: {
        type: Number,
        validate: {
            validator: isFiniteNumber,
            message: 'supportTeamRef must be a valid number'
        }
    },
    events: {
        type: [Schema.Types.Mixed],
        default: []
    },
    profile0: {
        type: Schema.Types.Mixed,
        default: () => ({})
    },
    profile1: {
        type: Schema.Types.Mixed,
        default: () => ({})
    },
    profile2: {
        type: Schema.Types.Mixed,
        default: () => ({})
    },
    quiz: {
        type: [Schema.Types.Mixed],
        default: []
    },
    institution: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    course: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    accessKeyId: {
        type: String,
        trim: true
    }
}, {
    strict: true
});

sessionSchema.index({ uniqueID: 1 }, { unique: true });
sessionSchema.index({ name: 1 }, { unique: true });
if (isSessionTtlIndexEnabled()) {
    sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

// Debug hook: log whenever a document is about to be saved
sessionSchema.pre('save', function (next) {
    if (!this.lastAccessedAt) {
        this.lastAccessedAt = new Date();
    }
    if (!this.expiresAt || this.isModified('lastAccessedAt')) {
        this.expiresAt = getSessionExpiryFrom(this.lastAccessedAt);
    }
    console.log('>>> PRE-SAVE triggered for:', this.name, '| _id:', this._id);
    next();
});

module.exports = mongoose.model('Session', sessionSchema);
