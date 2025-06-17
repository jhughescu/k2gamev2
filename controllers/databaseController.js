const mongoose = require('mongoose');
const {
    MongoClient,
    ObjectId
} = require('mongodb');
const EventEmitter = require('events');
const dbEvents = new EventEmitter();
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const QUIZ_URI = process.env.QUIZ_MONGODB_URI;
const dbName = "k2gamedevv2local";
const collectionName = "sessions";
const documentId = new ObjectId('6763417558a5471d1c0f12ea');

let quizMongoose = null;

// Connect to MongoDB and start change stream with resilience
async function dbConnect() {
    try {
        if (!uri) {
            console.warn('MongoDB URI not provided. Database functionality will not work.');
            return;
        }

        const isOnline = await checkInternetConnectivity();
        if (!isOnline) {
            console.warn('No internet connection. Database functionality will not work.');
            return;
        }

        await mongoose.connect(uri);
        console.log('DB connected');

        const db = mongoose.connection;
        const collection = db.collection(collectionName);

        startChangeStream(collection); // resilient listener

    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}

function startChangeStream(collection) {
    let changeStream;

    const createStream = () => {
        console.log('Starting Change Stream...');
        changeStream = collection.watch();

        changeStream.on('change', (change) => {
            dbEvents.emit('databaseChange', change);
        });

        changeStream.on('error', (err) => {
            console.error('Change Stream error:', err.code || err.message);

            if (err.code === 'ECONNRESET' || err.message.includes('topology was destroyed')) {
                console.log('Attempting to restart Change Stream in 5s...');
                setTimeout(createStream, 5000);
            }
        });

        changeStream.on('close', () => {
            console.warn('Change Stream closed. Restarting in 5s...');
            setTimeout(createStream, 5000);
        });
    };

    createStream();
}

// Check internet before DB operations
async function checkInternetConnectivity() {
    try {
        await require('dns').promises.resolve('www.google.com');
        return true;
    } catch {
        return false;
    }
}

// Optional: validate mongoose connection state
function dbConnected() {
    return mongoose.connection.readyState === 1;
}

// Get all sessions
async function getAllSessions(dbName, collectionName, cb) {
    const client = new MongoClient(uri);
    console.log(`Looking for documents in ${dbName} / ${collectionName}`);

    try {
        await client.connect();
        const db = client.db(dbName);

        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);

        if (!collectionNames.includes(collectionName)) {
            throw new Error(`Collection "${collectionName}" does not exist in database "${dbName}".`);
        }

        const documents = await db.collection(collectionName).find({}).toArray();
        if (cb) cb(null, documents);
        return documents;
    } catch (err) {
        console.error("Error fetching documents:", err.message);
        if (cb) cb(err, null);
        throw err;
    } finally {
        await client.close();
    }
}

// Delete a session by ID
async function deleteSession(dbName, collectionName, id, cb) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        const result = await collection.deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 1) {
            console.log(`Deleted document with _id: ${id}`);
            if (cb) cb(null, `Document with _id ${id} was successfully deleted.`);
        } else {
            if (cb) cb(`No document found with _id: ${id}`, null);
        }
    } catch (err) {
        console.error("Error deleting document:", err.message);
        if (cb) cb(err, null);
    } finally {
        await client.close();
    }
}

// Monitor a specific document (for testing or diagnostics)
async function monitorDocument(uri, dbName, collectionName, documentId) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const collection = client.db(dbName).collection(collectionName);
        const changeStream = collection.watch([
            {
                $match: {
                    'documentKey._id': documentId
                }
            }
        ]);

        console.log(`Monitoring document with _id: ${documentId}`);
        changeStream.on('change', (change) => {
            console.log('Document Change:', change);
        });

        changeStream.on('error', (err) => {
            console.error('Document monitor error:', err);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

monitorDocument(uri, dbName, collectionName, documentId);

// Optional: validate collections
async function validateConnection() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const names = collections.map(c => c.name);
        console.log(`Collections in "${dbName}":`, names);
    } catch (err) {
        console.error("Validation failed:", err.message);
    } finally {
        await client.close();
    }
}

async function getQuizDbConnection() {
    if (quizMongoose && quizMongoose.readyState === 1) {
        return quizMongoose;
    }

    const mongooseAlt = require('mongoose'); // new mongoose instance (can be the same package)
    try {
        quizMongoose = await mongooseAlt.createConnection(QUIZ_URI);
        console.log('✅ Quiz DB connected');
        return quizMongoose;
    } catch (err) {
        console.error('❌ Quiz DB connection failed:', err.message);
        throw err;
    }
}

module.exports = {
    dbConnect,
    dbEvents,
    getAllSessions,
    deleteSession,
    getQuizDbConnection,
};
