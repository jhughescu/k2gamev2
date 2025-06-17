const { getQuizDbConnection } = require('../controllers/databaseController');
const mongoose = require('mongoose');

let Question = null;
async function getQuestion(bank, excludeIds = [], includeAnswer = false) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema');

    if (!conn.models['Question']) {
        Question = conn.model('Question', questionSchema, bank);
    } else {
        Question = conn.models['Question'];
    }

    const objectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    // Base aggregation pipeline
    const pipeline = [
        { $match: { _id: { $nin: objectIds } } },
        { $sample: { size: 1 } }
    ];

    // Only hide correctAnswerIndex for non-admin mode
    if (!includeAnswer) {
        pipeline.push({ $project: { correctAnswerIndex: 0 } });
    }

    const question = await Question.aggregate(pipeline);
    return question[0] || null;
}

async function checkAnswer(bank, questionId, selectedIndex) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema');

    if (!conn.models['Question']) {
        Question = conn.model('Question', questionSchema, bank);
    } else {
        Question = conn.models['Question'];
    }

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
        throw new Error('Invalid question ID');
    }

//    const question = await Question.findById(questionId).select('correctAnswerIndex');
    const question = await Question.findById(questionId);

    if (!question) {
        throw new Error('Question not found');
    }

    return {
        correct: question.correctAnswerIndex === selectedIndex,
        correctAnswerText: question.options[question.correctAnswerIndex]
    };
}

module.exports = {
    getQuestion,
    checkAnswer
};
