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
    correctAnswerIndex: {
        type: Number,
        required: true,
        validate: {
            validator: function (i) {
                return i >= 0 && this.options && i < this.options.length;
            },
            message: 'correctAnswerIndex must point to a valid option'
        }
    },
    difficulty: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
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
