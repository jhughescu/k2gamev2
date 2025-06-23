const { getQuizDbConnection } = require('../controllers/databaseController');
const mongoose = require('mongoose');

let Question = null;
async function getQuestionRefs(bank) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema2');

    if (!conn.models['Question']) {
        Question = conn.model('Question', questionSchema, bank);
    } else {
        Question = conn.models['Question'];
    }

    const refs = await Question.find({}, { _id: 1 });
    const list = refs.map(doc => doc._id.toString());
//    console.log(list);
    return list;
}

async function getQuestion(bank, qId = false, excludeIds = [], includeAnswer = false) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema2');
    console.log(`getQuestion`, bank, qId);

    if (!conn.models['Question']) {
        Question = conn.model('Question', questionSchema, bank);
    } else {
        Question = conn.models['Question'];
    }

    const objectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    let question;

    if (qId !== false) {
        console.log('indexed question return', qId, excludeIds);
        // Deterministic fetch by index
        const query = { _id: { $nin: objectIds } };
        const projection = includeAnswer ? {} : { correctAnswerIndex: 0 };

        question = await Question.find(query, projection)
            .sort({ _id: 1 }) // or any other consistent order
            .skip(qId)
            .limit(1);
        console.log(question);
    } else {

        console.log('random question return');
        // Random fetch
        const pipeline = [
            { $match: { _id: { $nin: objectIds } } },
            { $sample: { size: 1 } }
        ];

        if (!includeAnswer) {
            pipeline.push({ $project: { correctAnswerIndex: 0 } });
        }

        question = await Question.aggregate(pipeline);
    }

    return question[0] || null;
}


async function getQuestionV1(bank, qId = false, excludeIds = [], includeAnswer = false) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema2');
    console.log(`getQuestion`, bank);
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
    console.log(question)
    return question[0] || null;
}

async function checkAnswer(bank, questionId, selectedIndexes) {
//    console.log(`checkAnswer`, questionId, selectedIndexes);
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema2');

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
    console.log(question);
//    console.log(selectedIndexes.toString());
    const ci = question.correctAnswerIndexes;
    const ui = selectedIndexes;
    return {
        correct: ci.toString() === ui.toString(),
        correctAnswerIndexes: ci
    };
}

module.exports = {
    getQuestion,
    getQuestionRefs,
    checkAnswer
};
