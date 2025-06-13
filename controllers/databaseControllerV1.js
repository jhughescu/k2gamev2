const mongoose = require('mongoose');
const EventEmitter = require('events');
const dbEvents = new EventEmitter();
const { MongoClient, ObjectId } = require('mongodb');
//const { ObjectId } = require('mongodb');

const documentId = new ObjectId('6763417558a5471d1c0f12ea');

require('dotenv').config();


const uri = process.env.MONGODB_URI;
const dbName = "k2gamedevv2local";
const collectionName = "sessions";

// Connect to MongoDBasync function dbConnect() {
async function dbConnect() {
    try {
        // Check if MongoDB URI is provided
        if (!uri) {
            console.warn('MongoDB URI not provided. Database functionality will not work.');
            return;
        }
        const isOnline = await checkInternetConnectivity();
        if (!isOnline) {
            console.warn('No internet connection. Database functionality will not work.');
        }
        await mongoose.connect(uri);
        console.log('DB connected');
        const db = mongoose.connection;
        const collection = db.collection('sessions');
        const changeStream = collection.watch();
        changeStream.on('change', (change) => {
            dbEvents.emit('databaseChange', change);
            // Handle the change as needed
        });

        // Handle errors
        changeStream.on('error', (err) => {
            console.error('Change stream error:', err);
        });
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}
// Function to check internet connectivity
async function checkInternetConnectivity() {
    try {
        await require('dns').promises.resolve('www.google.com');
        return true; // Internet connection is available
    } catch (error) {
        return false; // Internet connection is not available
    }
}

const dbConnected = () => {
    let dbc = false;
    if (dbInstance && dbInstance.readyState === 1) {
        console.log('Database connection is active');
        dbc = true;
    } else {
        console.log('Database connection is not active');
        //        return false;
    }
    return dbc;
};

const getAllSessionsV1 = async (dbName, collectionName, cb) => {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);
    console.log(`looking for ${dbName} / ${collectionName}`);
    try {
        await client.connect();
        console.log("Connected to MongoDB");

        // List all databases
        const databases = await client.db().admin().listDatabases();
        console.log("Databases:", databases.databases.map(db => db.name));

        // Check if the database exists
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);
        console.log(`Collections in database "${dbName}":`, collectionNames);

        // Validate collection existence
        if (collectionNames.includes(collectionName)) {
            console.log(`Collection "${collectionName}" exists in database "${dbName}".`);
        } else {
            console.error(`Collection "${collectionName}" does NOT exist in database "${dbName}".`);
        }

    } catch (err) {
        console.error("Error connecting to MongoDB:", err.message);
    } finally {
        await client.close();
        console.log("Connection closed");
        if (cb) {
            cb('wow');
        }
    }
};
const getAllSessions = async (dbName, collectionName, cb) => {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);
    console.log(`Looking for documents in ${dbName} / ${collectionName}`);
    try {
        await client.connect();
        console.log("Connected to MongoDB");

        // Get the database
        const db = client.db(dbName);

        // Check if the collection exists
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);

        if (!collectionNames.includes(collectionName)) {
            throw new Error(`Collection "${collectionName}" does not exist in database "${dbName}".`);
        }
        console.log(`Collection "${collectionName}" exists in database "${dbName}".`);

        // Fetch all documents from the collection
        const collection = db.collection(collectionName);
        const documents = await collection.find({}).toArray();
        console.log(`Found ${documents.length} documents in collection "${collectionName}".`);

        // Callback if provided
        if (cb) {
            cb(null, documents);
        }

        // Return documents
        return documents;
    } catch (err) {
        console.error("Error fetching documents:", err.message);

        // Callback with error if provided
        if (cb) {
            cb(err, null);
        }

        // Re-throw error for caller to handle
        throw err;
    } finally {
        await client.close();
        console.log("Connection closed");
    }
};

const deleteSession = async (dbName, collectionName, id, cb) => {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        // Get the collection
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Convert the id to ObjectId (if needed)
        const objectId = new ObjectId(id);

        // Delete the document with the matching _id
        const result = await collection.deleteOne({ _id: objectId });

        if (result.deletedCount === 1) {
            console.log(`Successfully deleted document with _id: ${id}`);
            if (cb) cb(null, `Document with _id ${id} was successfully deleted.`);
        } else {
            console.warn(`No document found with _id: ${id}`);
            if (cb) cb(`No document found with _id: ${id}`, null);
        }
    } catch (err) {
        console.error("Error deleting document:", err.message);
        if (cb) cb(err, null); // Pass error to the callback
    } finally {
        await client.close();
        console.log("Connection closed");
    }
};


// attempt to watch for document changes
async function monitorDocument(uri, dbName, collectionName, documentId) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const collection = client.db(dbName).collection(collectionName);
        const changeStream = collection.watch([
            {
                $match: {
                    'documentKey._id': documentId, // Filter for a specific document by _id
                },
            },
        ]);
        //*/
        console.log(`Monitoring changes to document with _id: ${documentId}`);
        changeStream.on('change', (change) => {
            console.log('Document Change:', change);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

monitorDocument(
    process.env.MONGODB_URI,
    dbName,
    collectionName,
    documentId // Replace with the _id of the document you want to monitor
);



async function validateConnection() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        // List all databases
        const databases = await client.db().admin().listDatabases();
        console.log("Databases:", databases.databases.map(db => db.name));

        // Check if the database exists
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);
        console.log(`Collections in database "${dbName}":`, collectionNames);

        // Validate collection existence
        if (collectionNames.includes(collectionName)) {
            console.log(`Collection "${collectionName}" exists in database "${dbName}".`);
        } else {
            console.error(`Collection "${collectionName}" does NOT exist in database "${dbName}".`);
        }

    } catch (err) {
        console.error("Error connecting to MongoDB:", err.message);
    } finally {
        await client.close();
        console.log("Connection closed");
    }
}
// \/ only needed for testing
//validateConnection();


module.exports = { dbConnect, dbEvents, getAllSessions, deleteSession };
