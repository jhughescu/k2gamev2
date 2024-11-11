const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sessionSchema = new Schema({
    uniqueID: Number,
    name: String,
    dateID: Number,
    type: Number,
    teamRef: Number,
    state: String
});

module.exports = mongoose.model('Session', sessionSchema);
