const mongoose = require('mongoose');

const accessKeySchema = new mongoose.Schema({
    type: { type: String, enum: ['institution', 'course'], required: true },
    institutionSlug: { type: String, required: true, lowercase: true, trim: true },
    courseSlug: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    label: { type: String, default: '' },
    active: { type: Boolean, default: true },
    createdBy: { type: String },
    lastUsedAt: { type: Date }
}, { timestamps: true });

// Ensure courseSlug is present for course type
accessKeySchema.pre('save', function(next) {
    if (this.type === 'course' && !this.courseSlug) {
        return next(new Error('courseSlug is required for course access keys'));
    }
    if (this.type === 'institution') {
        this.courseSlug = undefined;
    }
    next();
});

module.exports = mongoose.model('AccessKey', accessKeySchema);
