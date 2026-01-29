const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['superuser', 'admin'], required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
