require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filteredArgs = args.filter(arg => arg !== '--dry-run');

if (filteredArgs.length < 2) {
    console.error('Usage: node quizUploader.js <bankName> <jsonFileName> [--dry-run]');
    process.exit(1);
}

const [bankName, jsonFileBase] = filteredArgs;
const filePath = path.join(__dirname, '../data', `${jsonFileBase}.json`);

// Validate file existence
if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at path "${filePath}"`);
    process.exit(1);
}

async function run() {
    const uri = process.env.QUIZ_MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('k2questionbanks');
        const collection = db.collection(bankName);

        const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (dryRun) {
            console.log(`🧪 DRY RUN: Would insert ${questions.length} questions into "${bankName}"`);
            console.log('Preview (first 3 questions):', questions.slice(0, 3));
            return;
        }

        const result = await collection.insertMany(questions);
        console.log(`✅ ${result.insertedCount} questions inserted into "${bankName}".`);
    } catch (err) {
        console.error('❌ Error inserting questions:', err);
    } finally {
        await client.close();
    }
}

run();
