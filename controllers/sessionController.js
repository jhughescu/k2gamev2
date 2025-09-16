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
//    console.log('processData');
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

const newSession = async (ob, cb) => {
//    console.log(`newSession; let's call getSessions to see how many sessions there are`);
//    console.log(ob);
    getSessions({}, async () => {
        const sessions = await Session.find();
        const data = await processData();
        const list = [];
        sessions.forEach(s => {
            list.push(parseInt(s.name.split('_')[1]));
        });
        list.sort((a, b) => a - b);
        const sN = tools.getTimeNumber().toString();
        const sID = `k2session_${tools.findSmallestMissingNumber(list)}`;
        const at = persistentData.activeTeams;
        let cc = parseInt(ob.forceTeam) || Math.floor(at.length * Math.random());
//        cc = 1;
//        console.log(`OK, let's create a session. There are ${sessions.length} sessions already in the system, the new ID will be ${sID}`);
        console.log(`new session with cc ${cc}`);
        let st;
        do {
            st = Math.floor(at.length * Math.random());
        } while (st === cc);
        try {
//            const fakeDate = 20250707112532;
            const s = await Session.create({
                uniqueID: sN,
                name: sID,
                dateID: tools.getTimeNumber(),
                dateAccessed: tools.getTimeNumber(),
//                dateID: fakeDate,
//                dateAccessed: fakeDate,
                type: 1,
                teamRef: cc,
                supportTeamRef: st,
                state: 'new',
                time: 0,
                profile0: {blank: true},
                profile1: {blank: true},
                profile2: {blank: true}
            });
            console.log(s)
            cb(developSession(s));
        } catch (err) {
            console.error(`error creating session`, err);
        }
    });
};
const newSessionV1 = async (cb) => {
    const sessions = await Session.find();
    const data = await processData();
    const list = [];
    sessions.forEach(s => {
        list.push(parseInt(s.name.split('_')[1]));
    });
    list.sort((a, b) => a - b);
//    const sN = sessions.length + 1;
//    const sN = tools.findSmallestMissingNumber(list) || tools.roundNumber(Math.random(), 3) * 1000;
    const sN = tools.roundNumber(Math.random(), 3) * 1000;
    const sID = `k2session_${sN}`;
    const at = persistentData.activeTeams;
    const cc = Math.floor(at.length * Math.random());
    console.log(`OK, let's create a session. There are ${sessions.length} sessions already in the system, the next unused value is ${sN}, the new ID will be ${sID}`);
    let st;
    do {
        st = Math.floor(at.length * Math.random());
    } while (st === cc);
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
    await s.save();
//    console.log('NEW SESSION', s._id, s.uniqueID);
    cb(developSession(s));
};
const restoreSession = async (sOb, cb) => {
    console.log(`restoreSession:`);
    console.log(sOb);
    const session = await Session.findOne(sOb);
    const data = await processData();
    if (session) {
        updateSession({uniqueID: sOb.uniqueID, dateAccessed: tools.getTimeNumber()})
        cb(developSession(session));
    } else {
        cb(`session not found`);
    }
};
const updateSession = async (sOb, cb) => {
//    console.log(`updateSession called for uniqueID: ${sOb.uniqueID} (${typeof(sOb.uniqueID)})`);
//    console.log(sOb);
    try {
        const filter = { uniqueID: String(sOb.uniqueID) };
//        console.log(filter)
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
//            throw new Error(sOb);
//            throw new Error(`No document found for uniqueID ${filter.uniqueID} ${JSON.stringify(sOb)}`);
            throw new Error(`No document found for uniqueID ${filter.uniqueID} ${typeof(filter.uniqueID)}`);
        }

        if (cb) {
            const updatedSession = await Session.findOne(filter);
//            console.log(`session ${updatedSession.name} updated successfully`);
            cb(updatedSession);
        }
    } catch (err) {
        console.error(`Error in updateSession: ${err.message}`);
//        console.log(sOb);
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
    const s = await Session.findOne({uniqueID: String(sOb.uniqueID)});
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
//    console.log(`deleteSession`);
//    console.log(sOb);
    const res = await Session.deleteOne(sOb);
    let del = false;
    if (res.deletedCount === 1) {
        del = true;
        console.log('deletion successful')
    }
    if (cb) {
        cb(del ? null : 'deletion failed', del);
    }
};
const getGameData = (cb) => {
    // run interval in case persistentData not yet ready (crap approach, yes, but it works)
//    console.log(`getGameData`);
    const i = setInterval(() => {
        if (persistentData !== null) {
            cb(persistentData);
//            console.log('returning PD')
            clearInterval(i);
        } else {
//            console.log('no PD (so LOAD some)');
            processData();
        }
    }, 500);
};

const getSessions = async (sOb = {}, cb) => {
    try {
        const s = await Session.find(sOb);
        if (cb) cb(null, s);
    } catch (err) {
        console.error('Error retrieving sessions:', err);
        if (cb) cb(err, null); // error: pass the error
    }
};

const getSessionsV1 = async (sOb, cb) => {
    console.log('mmm, get sessions');
    const s = await Session.find();
    if (cb) {
        cb(s);
    }
};
const deleteSessions = async (dArr, cb) => {
    if (!dArr || (typeof dArr === 'object' && Object.keys(dArr).length === 0)) {
        console.warn('deleteSessions: No filter provided. Refusing to delete all sessions by default.');
        if (cb) cb();
        return;
    }

    try {
        const result = await Session.deleteMany({ _id: { $in: dArr }});
        console.log(`Deleted ${result.deletedCount} sessions.`);
    } catch (error) {
        console.error("Error deleting sessions:", error);
    }

    if (cb) cb();
};

const deleteSessionsV1 = async (sOb = {}, cb) => {
//    console.log('deleting');
    Session.deleteMany(sOb)
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
