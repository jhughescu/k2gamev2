const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const courseSchema = new Schema({
    slug: { type: String, required: true }, // short ID used in URLs
    name: { type: String, required: true },   // display name
    launchToken: { type: String, unique: true, sparse: true }, // opaque course launch token
    active: { type: Boolean, default: true } // course is playable if true, else locked for admin/restore only
}, {_id: false});

const institutionSchema = new Schema({
    slug: { type: String, unique: true, required: true }, // short code, e.g., "cu"
    title: { type: String, required: true },              // display title
    courses: { type: [courseSchema], default: [] }
});

module.exports = mongoose.model('Institution', institutionSchema);
