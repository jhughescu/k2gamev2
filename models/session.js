const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    uniqueID: Number,
    name: String,
    dateID: Number,
    type: Number,
    password: String,
    address: String,
    players: Array,
    teams: Array,
    mainTeamSize: Number,
    state: String,
    round: String,
    slide: Number,
    scores: Array,
    values: Array,
    idColour: String,
    localIP: String
});

module.exports = mongoose.model('Session', sessionSchema);
