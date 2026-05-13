const { getQuizDbConnection } = require('../controllers/databaseController');
const mongoose = require('mongoose');

const QUESTION_SORT = { $natural: 1 };

function getQuestionModelName(bank) {
    return `Question_${String(bank).replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

async function getQuestionModel(bank) {
    const conn = await getQuizDbConnection();
    const questionSchema = require('../models/questionSchema2');
    const modelName = getQuestionModelName(bank);

    if (!conn.models[modelName]) {
        conn.model(modelName, questionSchema, bank);
    }

    return conn.models[modelName];
}

async function getQuestionRefs(bank) {
    const Question = await getQuestionModel(bank);

    const refs = await Question.find({}, { _id: 1 }).sort(QUESTION_SORT);
    const list = refs.map(doc => doc._id.toString());
//    console.log(list);
    return list;
}

async function getAllQuestions(bank) {
    const Question = await getQuestionModel(bank);
    return Question.find({}, { correctAnswerIndexes: 0 }).sort(QUESTION_SORT).lean();
}

async function getQuestion(bank, qId = false, excludeIds = [], includeAnswer = false) {
    const Question = await getQuestionModel(bank);
    console.log(`getQuestion`, bank, qId);

    const objectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    let question;

    if (qId !== false) {
        // console.log('indexed question return', qId, excludeIds);
        // Deterministic fetch by index
        const query = { _id: { $nin: objectIds } };
        const projection = includeAnswer ? {} : { correctAnswerIndex: 0 };
        console.log(query);
        console.log(projection);
        question = await Question.find(query, projection)
            .sort(QUESTION_SORT)
            .skip(qId)
            .limit(1);
        console.log(question);
    } else {

//        console.log('random question return');
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
    const Question = await getQuestionModel(bank);
    // console.log(`getQuestion`, bank);

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
    // console.log(question)
    return question[0] || null;
}

async function checkAnswer(bank, questionId, selectedIndexes) {
//    console.log(`checkAnswer`, questionId, selectedIndexes);
    const Question = await getQuestionModel(bank);

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
        throw new Error('Invalid question ID');
    }

//    const question = await Question.findById(questionId).select('correctAnswerIndex');
    const question = await Question.findById(questionId);

    if (!question) {
        throw new Error('Question not found');
    }
    // console.log(question);
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
    checkAnswer,
    getAllQuestions
};
