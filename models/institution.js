const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseSchema = new Schema({
    slug: { type: String, required: true }, // short ID used in URLs
    name: { type: String, required: true }   // display name
}, {_id: false});

const institutionSchema = new Schema({
    slug: { type: String, unique: true, required: true }, // short code, e.g., "cu"
    title: { type: String, required: true },              // display title
    courses: { type: [courseSchema], default: [] }
});

module.exports = mongoose.model('Institution', institutionSchema);
