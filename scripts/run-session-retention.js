require('dotenv').config();
const mongoose = require('mongoose');
const { runRetentionCycle } = require('../controllers/sessionRetentionController');

const parseArg = (name) => process.argv.find((arg) => arg.startsWith(`${name}=`));

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set in .env');
        process.exit(1);
    }

    const apply = process.argv.includes('--apply');
    const batchArg = parseArg('--batch');
    const batchSize = batchArg ? Number(batchArg.split('=')[1]) : undefined;

    await mongoose.connect(uri);
    try {
        const result = await runRetentionCycle({ apply, batchSize });
        console.log('[retention-run]', JSON.stringify(result, null, 2));
        if (result.errors && result.errors.length > 0) {
            process.exitCode = 1;
        }
    } finally {
        await mongoose.connection.close();
    }
}

main().catch(async (err) => {
    console.error('[retention-run] failed:', err && err.stack ? err.stack : err);
    try {
        await mongoose.connection.close();
    } catch (_) {
        // ignore close errors
    }
    process.exit(1);
});
