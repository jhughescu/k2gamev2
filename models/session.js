const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    uniqueID: {
        type: String,
        unique: true
    },
    name: {
        type: String,
        unique: true
    },
    dateID: Number,
    dateAccessed: Number,
    playTime: Number,
    type: Number,
    teamRef: Number,
    state: String,
    time: Number,
    supportTeamRef: Number,
    events: Array,
    profile0: Object,
    profile1: Object,
    profile2: Object,
    quiz: Array
});

// Debug hook: log whenever a document is about to be saved
sessionSchema.pre('save', function (next) {
    console.log('>>> PRE-SAVE triggered for:', this.name, '| _id:', this._id);
    next();
});

module.exports = mongoose.model('Session', sessionSchema);
