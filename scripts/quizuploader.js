require('dotenv').config();

const { MongoClient } = require('mongodb');
const fs = require('fs');

async function run() {
    const uri = process.env.QUIZ_MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('k2questionbanks');
        const collection = db.collection('k2questionbank1');

        const questions = JSON.parse(fs.readFileSync('./data/quiz1.json', 'utf8'));
        const result = await collection.insertMany(questions);
        console.log(`${result.insertedCount} questions inserted.`);
    } catch (err) {
        console.error('Error inserting questions:', err);
    } finally {
        await client.close();
    }
}

run();
