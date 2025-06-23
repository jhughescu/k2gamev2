const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    uniqueID: Number,
    name: String,
    dateID: Number,
    type: Number,
    teamRef: Number,
    state: String,
    time: Number,
//    team: Array,
    supportTeamRef: Number,
//    supportTeam: Array,
    events: Array,
    profile0: Object,
    profile1: Object,
    profile2: Object,
    quiz: Array
});

module.exports = mongoose.model('Session', sessionSchema);
