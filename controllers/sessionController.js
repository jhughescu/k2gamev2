const fs = require('fs');
const Session = require('../models/session');
const tools = require('./tools');
const { getEventEmitter } = require('./../controllers/eventController');
//const gameController = require('./controllers/gameController');
//const dateController = require('./controllers/dateController');
const eventEmitter = getEventEmitter();

let persistentData = null;
const developData = (d) => {
    // runs processes on the persistentData
    d.activeTeams = d.teams.filter(t => Boolean(t.active));
//    d.activeTeams = d.teams.slice(0);
//    console.log(d.activeTeams);
    return d;
};
const developSession = (s) => {
    // converts & expands the raw session model
    if (s) {
        const sn = s.toObject();
        const act = persistentData.activeTeams;
        sn.team = act[sn.teamRef];
        sn.supportTeam = act[sn.supportTeamRef];
        return sn;
    } else {
        console.log(`ERROR: no session provided`);
    }
};
const processData = async () => {
    const type = 1;
    const filePath = `data/gamedata_${type}.json`;
    if (persistentData === null) {
        console.log('must prep data');
        try {
            let data = await fs.promises.readFile(filePath, 'utf8');
    //        console.log(typeof(data))
            if (typeof(data) === 'string') {
                data = JSON.parse(data);
            }
            persistentData = developData(data);
            persistentData.isDev = tools.procVal(process.env.ISDEV);
            return persistentData;
        } catch (error) {
            console.error('Error reading or parsing JSON file:', error);
            throw error;
        }
    } else {
        console.log('use prepped data');
//        console.log(persistentData);
        persistentData.isDev = tools.procVal(process.env.ISDEV);
        return persistentData;
    }
};

const newSession = async (cb) => {
    const sessions = await Session.find();
    const data = await processData();
    const sN = sessions.length + 1;
    const sID = `k2session_${sN}`;
    const at = persistentData.activeTeams;
    const cc = Math.floor(at.length * Math.random());
    let st;
    do {
        st = Math.floor(at.length * Math.random());
    } while (st === cc);
//    console.log(`newSession, cc: ${cc}, st: ${st}`);
//    console.log(tools.getTimeNumber());
    const s = new Session({
        uniqueID: `1${tools.padNum(sN, 100000)}${1000 + Math.round(Math.random() * 1000)}`,
        name: sID,
        dateID: tools.getTimeNumber(),
        type: 1,
        teamRef: cc,
        supportTeamRef: st,
        state: 'new',
        time: 0,
        profile0: {blank: true},
        profile1: {blank: true},
        profile2: {blank: true}
    });

    s.save();
//    console.log('NEW SESSION');
//    console.log(developSession(s));
//    eventEmitter.emit();
    cb(developSession(s));
};
const restoreSession = async (sOb, cb) => {
//    console.log(`restoreSession:`);
//    console.log(sOb);
    const session = await Session.findOne(sOb);
    const data = await processData();
    if (session) {
        cb(developSession(session));
    } else {
        cb(`session not found`);
    }
};
const updateSession = async (sOb, cb) => {
//    console.log('updateSession called:');
//    console.log(sOb);
    try {
        const filter = { uniqueID: sOb.uniqueID };
        const update = { $set: {}, $push: {} };

        for (const [key, value] of Object.entries(sOb)) {
            if (key === 'quiz') {
                update.$push.quiz = value;
            } else {
                update.$set[key] = value;
            }
        }

        // Clean up empty operators if not used
        if (Object.keys(update.$push).length === 0) delete update.$push;
        if (Object.keys(update.$set).length === 0) delete update.$set;

        const result = await Session.updateOne(filter, update);

        if (result.matchedCount === 0) {
            throw new Error(`No document found for uniqueID ${sOb.uniqueID}`);
        }

        if (cb) {
            const updatedSession = await Session.findOne(filter);
            cb(updatedSession);
        }
    } catch (err) {
        console.error(`Error in updateSession: ${err.message}`);
        console.log(sOb);
        if (cb) cb(null, err);
    }
};

const updateSessionV4 = async (sOb, cb) => {
    try {
        const filter = { uniqueID: sOb.uniqueID };
        const update = {};

        for (const [key, value] of Object.entries(sOb)) {
            update[key] = value;
        }

        const result = await Session.updateOne(filter, { $set: update });

        if (result.matchedCount === 0) {
            throw new Error(`No document found for uniqueID ${sOb.uniqueID}`);
        }

        // Log or comment if nothing changed, but don't throw
        if (result.modifiedCount === 0) {
//            console.log(`No update needed for uniqueID ${sOb.uniqueID} (data was identical).`);
        }

        if (cb) {
            const updatedSession = await Session.findOne(filter);
            cb(updatedSession);
        }
    } catch (err) {
        console.error(`Error in updateSession: ${err.message}`);
        console.log(sOb);
        if (cb) cb(null, err);
    }
};

const updateSessionv1 = async (sOb, cb) => {
    console.log(`updateSession:`);
    console.log(sOb);
    const s = await Session.findOne({uniqueID: sOb.uniqueID});
    if (s) {
        Object.entries(sOb).forEach((p, v) => {
            s[p[0]] = p[1];
        })
        s.save();
        if (cb) {
            cb(s);
        } else {
    //        console.log('no no no');
        }
    }
};
const updateSessionV2 = async (sOb, cb) => {
    try {
        console.log(`updateSession:`);
        console.log(sOb);
        // Fetch the session by uniqueID
        const s = await Session.findOne({ uniqueID: sOb.uniqueID });
        if (!s) {
            throw new Error(`Session with uniqueID ${sOb.uniqueID} not found.`);
        }
        // Update fields dynamically
        for (const [key, value] of Object.entries(sOb)) {
            // Handle arrays like `events` carefully
            if (key === 'events' && Array.isArray(value)) {
                s[key] = value; // Replace the array completely
            } else {
                s[key] = value; // Standard assignment for other fields
            }
        }
        // Save the session and handle errors
        await s.save();
        // Callback if provided
        if (cb) {
            cb(s);
        }
    } catch (err) {
        console.error(`Error in updateSession: ${err.message}`);
        if (cb) cb(null, err);
    }
};
const updateSessionV3 = async (sOb, cb) => {
    try {
        /*console.log(`updateSession:`);
        console.log(sOb);*/
        const filter = { uniqueID: sOb.uniqueID };
        const update = {};
        for (const [key, value] of Object.entries(sOb)) {
            if (key === 'events' && Array.isArray(value)) {
                // Replace the array completely
                update[key] = value;
            } else {
                // Standard assignment for other fields
                update[key] = value;
            }
        }
        // Use direct MongoDB update to avoid triggering __v increment
        const result = await Session.updateOne(filter, { $set: update });
        if (result.modifiedCount === 0) {
            throw new Error(`No document was updated for uniqueID ${sOb.uniqueID}`);
        }
//        console.log(`Document with uniqueID ${sOb.uniqueID} successfully updated.`);
        if (cb) {
            // Fetch the updated document and pass it to the callback
            const updatedSession = await Session.findOne(filter);
            cb(updatedSession);
        }
    } catch (err) {
        console.error(`Error in updateSession: ${err.message}`);
        console.log(sOb);
        if (cb) cb(null, err);
    }
};

const getTeamNotMe = (id) => {

    const T = persistentData.activeTeams.filter(t => t.id !== id);
    const ref = T.map(t => t = t.id);
    const t = T[Math.floor(Math.random() * T.length)];
//    console.log(t.id, t.country);

//    console.log(`ID: ${id}, array: ${ref.toString()}, is in? ${ref.includes(id)}, old: ${id} new: ${t.id}`);
    return t.id;
};
const changeSupportTeam = async (id, cb) => {
    if (persistentData) {
        const s = await Session.findOne({uniqueID: id});
        if (s) {
            const newT = getTeamNotMe(s.supportTeamRef);
            const ob = {uniqueID: id, supportTeamRef: newT};
            updateSession(ob, (rs) => {
//                console.log(`rs null?`, rs === null);
                const rsc = rs === null ? s : rs;
                if (cb) {
                    cb(developSession(rsc));
                }
            });
        }
    }
};
const changeSupportTeamV1 = async (id, cb) => {
//    console.log('change support team', id);
    const s = await Session.findOne({uniqueID: id});
    if (s) {
//        console.log(s);
        const newT = getTeamNotMe(s.teamRef);
        const ob = {uniqueID: id, supportTeamRef: newT};
        updateSession(ob, (rs) => {
            console.log(rs === null)
            if (cb && rs !== null) {
                cb(developSession(rs));
            }
        });
    } else {
        console.log(`no session found with ID ${id}`);
    }

};


const getSession = async (sOb, cb) => {
    const s = await Session.findOne({uniqueID: sOb.uniqueID});
//    console.log(`getSession`);
//    console.log(sOb);
//    console.log(s);
    if (s) {
//        s[sOb]
        if (cb) {
            cb(s);
        } else {
    //        console.log('no no no');
        }
    }
};
const deleteSession = async (sOb, cb) => {
//    console.log('trying');
//    console.log(sOb);
    const res = await Session.deleteOne(sOb);
    let del = false;
    if (res.deletedCount === 1) {
        del = true;
//        console.log('deletion successful')
    }
    if (cb) {
        cb(del);
    }
};
const getGameData = (cb) => {
    // run interval in case persistentData not yet ready (crap approach, yes, but it works)
    const i = setInterval(() => {
        if (persistentData !== null) {
            cb(persistentData);
            clearInterval(i);
        }
    }, 100);
};

const getSessions = async (sOb, cb) => {
    const s = await Session.find();
    if (cb) {
        cb(s);
    }
};
const deleteSessions = async (sOb, cb) => {
//    console.log('deleting');
    Session.deleteMany({})
    .then(result => {
        console.log(`Deleted ${result.deletedCount} sessions.`);
    })
    .catch(error => {
        console.error("Error deleting sessions:", error);
    });
    if (cb) {
        cb();
    }
};

module.exports = {
    newSession,
    restoreSession,
    updateSession,
    getSession,
    deleteSession,
    deleteSessions,
    getSessions,
    getGameData,
    changeSupportTeam
};
