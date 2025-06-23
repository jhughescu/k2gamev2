// models/question.js
const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        trim: true
    },
    options: {
        type: [String],
        required: true,
        validate: [arrayLimit, 'Options must include at least two choices']
    },
    correctAnswerIndexes: {
        type: [Number],
        required: true,
        validate: {
            validator: function (arr) {
                return (
                    Array.isArray(arr) &&
                    arr.length > 0 &&
                    arr.every(i => Number.isInteger(i) && i >= 0 && i < this.options.length)
                );
            },
            message: 'Each index must be a valid option index'
        }
    },
    difficulty: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
    },
    optionsAllowed: {
        type: Number,
        default: 1,
        required: false
    },
    feedback: {
        type: String,
        required: false
    },
    tags: {
        type: [String],
        default: []
    }
});

function arrayLimit(val) {
    return val.length >= 2;
}

module.exports = QuestionSchema;
