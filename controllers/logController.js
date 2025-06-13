const fs = require('fs').promises;
const path = require('path');
const beautify = require('json-beautify');
const tools = require('./tools.js');
const { getEventEmitter } = require('./../controllers/eventController');
const eventEmitter = getEventEmitter();


const LOG_UPDATE = 'logs/updates.json';
const LOGF_UPDATE = 'updates';
const LOGF_ROUNDS = 'rounds';
const LOG_FILE = 'all_logs';
const LOG_CLIMBERS = 'logs/climbers';
const updateList = [];
const logList = [];
let updateTime = null;
let logTime = null;

const isLocal = () => {
    return Boolean(tools.procVal(process.env.ISLOCAL));
}
const isDev = () => {
//    return true;
    return Boolean(tools.procVal(process.env.ISDEV));
};
const emptyFolder = async (directoryPath) => {
    console.log(`emptyFolder: ${isDev()}`);
    if (isLocal()) {
        try {
            const filesIn = await fs.readdir(directoryPath);
            const terms = [LOGF_UPDATE, LOGF_ROUNDS];
            const files = filesIn.filter(f => {
                return !terms.some(t => f.includes(t));
            })
            for (const file of files) {
                const filePath = path.join(directoryPath, file);
                const stat = await fs.stat(filePath);

                if (stat.isDirectory()) {
                    await fs.rmdir(filePath, {
                        recursive: true
                    });
                } else {
//                    if (filePath.replace(/[\/\\]/g, '') !== LOG_UPDATE.replace(/[\/\\]/g, '')) {
                    if (filePath.replace(/[\/\\]/g, '') !== LOG_UPDATE.replace(/[\/\\]/g, '')) {
                        await fs.unlink(filePath);
                    }
                }
            }
            console.log(`All contents deleted from ${directoryPath}`);
//            fs.writeFile('logs/updates.json', JSON.stringify({piss: 'boil'}));
        } catch (err) {
            console.error(`Error clearing directory: ${err.message}`);
        }
    }
};
const getFormattedTimestamp = () => {
    const now = new Date();
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Europe/London'
    };

    const formatter = new Intl.DateTimeFormat('en-GB', options);
    const parts = formatter.formatToParts(now);

    const datePart = parts.find(p => p.type === 'year').value +
        parts.find(p => p.type === 'month').value +
        parts.find(p => p.type === 'day').value;

    const timePart = parts.find(p => p.type === 'hour').value +
        parts.find(p => p.type === 'minute').value +
        parts.find(p => p.type === 'second').value;

    return `${datePart}-${timePart}`;
};
const writeBeautifiedJson = async (directoryPath, fileName, data) => {
    try {
        const timestamp = getFormattedTimestamp();
        const newFileName = `${fileName}_${timestamp}.json`;
        const newFilePath = path.join(directoryPath, newFileName);
        // Beautify JSON
        const beautifiedJson = beautify(data, null, 2, 100);
        if (isDev()) {
            await fs.writeFile(newFilePath, beautifiedJson);
        }
    } catch (err) {
        console.error(`Error creating file: ${err.message}`);
    }
};
const updateUpdates = async () => {
//    console.log(`updateUpdates: ${isDev()}`);
    if (isLocal()) {
        let uf = await fs.readFile(LOG_UPDATE);
        uf = JSON.parse(uf);
        let index = Object.keys(uf).length;
        while (updateList.length > 0) {
            const uo = updateList.shift();
//            console.log(uo)
//            console.log(JSON.stringify(uo))
//            console.log(uo.update)
            const u = JSON.parse(uo.update);
            u.game = uo.game;
            u.timestamp = uo.timestamp;
            const newI = `update_${index}`;
            uf[newI] = u;
            index++;
        }
        const writer = beautify(uf, null, 2, 100);
        await fs.writeFile(LOG_UPDATE, writer);
        eventEmitter.emit('updateLogUpdated', writer);
    }
};
const resetUpdatelog = () => {
    if (isDev()) {
        fs.writeFile(LOG_UPDATE, '{}');
    }
};
const resetUpdates = () => {
    updateList.length = 0;
    resetUpdatelog();
};
const archiveUpdates = async (cb) => {
    console.log(`ts: ${getFormattedTimestamp()}`);
    try {
        const ul = await fs.readFile(LOG_UPDATE, 'utf-8');
        const parsedData = JSON.parse(ul);
        if (Object.keys(parsedData).length === 0) {
            console.log('ERROR: update file is empty, cannot duplicate');
            if (cb) {
                cb('ERROR: update file is empty, cannot duplicate');
            }
        } else {
            const newFileName = LOG_UPDATE.replace('.json', `-${getFormattedTimestamp()}.json`);
            await fs.copyFile(LOG_UPDATE, newFileName);
            console.log(`File archived as ${newFileName}`);
            if (cb) {
                cb(`File archived as ${newFileName}`);
            }
        }
    } catch (err) {
        console.error('Error reading or copying file:', err);
        if (cb) {
            cb('Error reading or copying file:', err);
        }
    }
};
const getFilePath = (f) => {
    return `logs/${f}.json`;
};
const writeLogsV1 = async () => {
    try {
        let uf = await fs.readFile(getFilePath(LOG_FILE));
        uf = JSON.parse(uf);
        let index = Object.keys(uf).length;
        while (updateList.length > 0) {
            const uo = updateList.shift();
            const u = JSON.parse(uo.update);
            u.game = uo.game;
            u.timestamp = uo.timestamp;
            u.logType = uo.logType;
            const newI = `update_${index}`;
            uf[newI] = u;
            index++;
        }
        const writer = beautify(uf, null, 2, 100);
        await fs.writeFile(getFilePath(LOG_FILE), writer);
        eventEmitter.emit('logsUpdated', writer);
    } catch (err) {

    }
};

const writeMapFile = (o) => {
    if (isLocal()) {
        console.log('write it');
        fs.writeFile('data/routemap.json', beautify(o, null, 2, 100));
    //    writeBeautifiedJson('data', 'routemap.json', o);
    }
};
const writeProfileFile = (o) => {
    if (isLocal()) {
        const n = o.name.replace(' ', '').toLowerCase();
        const c = o.country.replace(' ', '').toLowerCase();
        fs.writeFile(`data/profiles/profile_${c}_${n}.json`, beautify(o, null, 2, 100));
    }
};
const writeFinalReport = (ob) => {
    if (isLocal()) {
        const o = {sessionID: ob.sessionID, climbers: []};
        ob.climbers.forEach(c => {
            o.climbers.push({
                name: c.name,
                finishTime: c.finishTime,
                lbFirst: c.lbFirst,
                lbPlace: c.lbPlace,
                lbTime: c.lbTime,
                allDelays: c.allDelays
            });
        });
        fs.writeFile(`logs/reports/game_${ob.sessionID}.json`, beautify(o, null, 2, 100));
    }
};
const writeClimberLog = async (o) => {
    if (isLocal()) {
        try {
            await fs.mkdir(LOG_CLIMBERS, {recursive: true});
            const logPath = `${LOG_CLIMBERS}/${o.sessionID}-${o.climberID}.json`;
            await fs.writeFile(logPath, beautify(o, null, 2, 100));
//            console.log(`log written for ${logPath}`);
        } catch (err) {
            console.log('Error writing climber log', err);
        }
    }
};
const deleteSessionLogs = async (id) => {
//    console.log(`################################## delete logs: ${id}`);
    try {
        const files = await fs.readdir(LOG_CLIMBERS);
        const matchingFiles = files.filter(file => file.includes(id));
        await Promise.all(matchingFiles.map(file => fs.unlink(path.join(LOG_CLIMBERS, file))));
        console.log(`✅ Deleted ${matchingFiles.length} file(s) matching sID: ${id}`);
    } catch (err) {
        console.error(`❌ Error deleting files for sID "${id}":`, err);
    }
};
const getProfileFiles = async (dir, cb) => {
    if (isLocal()) {
        try {
            const files = await fs.readdir(dir);
            const out = {};
            for (const file of files) {
                const filePath = path.join(dir, file);
                if (file.endsWith('.json')) {
                    try {
                        const data = await fs.readFile(filePath, 'utf8');
                        const i = file.split('_');
                        if (!out.hasOwnProperty(i[1])) {
                            out[i[1]] = {};
                        }
                        const od = JSON.parse(data);
                        out[i[1]][od.name.replace(' ', '_').toLowerCase()] = od;
                    } catch (err) {
                        console.error(`Error reading file ${file}: ${err.message}`);
                    }
                } else {
                    console.log(`Skipping non-JSON file: ${file}`);
                }
            }
            cb(out)
        } catch (err) {
            console.error(`Error reading directory: ${err.message}`);
        }
    }
};
const writeLogs = async () => {
    console.log(`writeLogs`);
    if (isLocal()) {
        try {
            let uf;
            // Check if the log file exists
            try {
                const logData = await fs.readFile(getFilePath(LOG_FILE), 'utf-8');
                uf = JSON.parse(logData); // Parse existing log data
            } catch (err) {
                // If the file doesn't exist, initialize an empty object
                if (err.code === 'ENOENT') {
                    uf = {};
                } else {
                    throw err; // Rethrow any other errors
                }
            }

            let index = Object.keys(uf).length;
    //        console.log(logList)
            while (logList.length > 0) {
                const u = logList.shift();
                const newI = `update_${index}`;
                uf[newI] = u;
                index++;
            }

            const writer = beautify(uf, null, 2, 100);
            await fs.writeFile(getFilePath(LOG_FILE), writer);
            eventEmitter.emit('logsUpdated', writer);
        } catch (err) {
            console.error("Error writing logs:", err);
        }
    }
};
const getUpdateLog = async (cb) => {
    console.log(`getUpdateLog: ${isDev()}`);
    if (isLocal()) {
        const ul = await fs.readFile(LOG_UPDATE, 'utf-8');
        if (cb) {
            cb(ul);
        }
    }
};
const addUpdate = async (ob) => {
    ob.timestamp = getFormattedTimestamp();
    updateList.push(ob);
//    console.log(`addUpdate`);
//    console.log(ob);
    clearTimeout(updateTime);
    updateTime = setTimeout(updateUpdates, 500);
};
const addLog = async (id, ob) => {
    ob.timestamp = getFormattedTimestamp();
    ob.logType = id;
    logList.push(ob);
    clearTimeout(logTime);
    logTime = setTimeout(writeLogs, 500);
};
const init = () => {
    console.log(`init: ${isDev()}`);
    resetUpdatelog();
};

init();
module.exports = {
    emptyFolder,
    writeBeautifiedJson,
    addUpdate,
    resetUpdates,
    archiveUpdates,
    getUpdateLog,
    addLog,
    writeMapFile,
    writeProfileFile,
    writeClimberLog,
    writeFinalReport,
    deleteSessionLogs,
    getProfileFiles
};
