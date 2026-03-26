const fs = require('fs');
const Session = require('../models/session');
const Institution = require('../models/institution');
const tools = require('./tools');
const { getEventEmitter } = require('./../controllers/eventController');
//const gameController = require('./controllers/gameController');
//const dateController = require('./controllers/dateController');
const eventEmitter = getEventEmitter();
const DEFAULT_SESSION_RETENTION_DAYS = 90;

const getSessionRetentionDays = () => {
    const raw = Number(process.env.SESSION_RETENTION_DAYS);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_SESSION_RETENTION_DAYS;
};

const buildSessionExpiryDate = (baseDate = new Date()) => {
    const retentionDays = getSessionRetentionDays();
    return new Date(baseDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
};

let persistentData = null;
const developData = (d) => {
    // runs processes on the persistentData
    d.activeTeams = d.teams.filter(t => Boolean(t.active));
//    d.activeTeams = d.teams.slice(0);
//    console.log(d.activeTeams);
    return d;
};
const validateInstitutionCourse = async (institutionSlug, courseSlug) => {
    const instSlug = (institutionSlug || '').toLowerCase();
    const course = (courseSlug || '').toLowerCase();
    if (!instSlug && !course) {
        return { inst: null, course: null };
    }
    if (!instSlug || !course) {
        return null;
    }
    const inst = await Institution.findOne({ slug: instSlug }).lean();
    if (!inst || !Array.isArray(inst.courses)) {
        return null;
    }
    const courseMatch = inst.courses.find(c => (c.slug || '').toLowerCase() === course);
    if (!courseMatch) {
        return null;
    }
    return { inst, course: courseMatch };
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

const getHighestSessionNumber = async () => {
    // Query database to find the session with the highest numeric name value
    // SessionNames follow pattern "k2session_N" where N is a number
    try {
        const sessions = await Session.find({}, { name: 1 }).lean();
        let highestNumber = 0;
        
        sessions.forEach(s => {
            if (s.name && s.name.includes('_')) {
                const num = parseInt(s.name.split('_')[1]);
                if (!isNaN(num) && num > highestNumber) {
                    highestNumber = num;
                }
            }
        });
        
        return highestNumber;
    } catch (err) {
        console.error('Error finding highest session number:', err);
        return 0;
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
            if (s.name && s.name.includes('_')) {
                const num = parseInt(s.name.split('_')[1]);
                if (!isNaN(num)) {
                    list.push(num);
                }
            }
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
        const institutionSlug = (ob.institution || '').toLowerCase();
        const courseSlug = (ob.course || '').toLowerCase();
        const accessKeyId = (ob.accessKeyId || '').toString().trim();
        const validation = await validateInstitutionCourse(institutionSlug, courseSlug);
        if (validation === null) {
            console.warn(`Invalid institution/course combination`, { institutionSlug, courseSlug });
            if (cb) {
                return cb({ error: 'invalid institution/course' });
            }
            return;
        }
        try {
//            const fakeDate = 20250707112532;
            const now = new Date();
            const s = await Session.create({
                uniqueID: sN,
                name: sID,
                dateID: tools.getTimeNumber(),
                dateAccessed: tools.getTimeNumber(),
                lastAccessedAt: now,
                expiresAt: buildSessionExpiryDate(now),
//                dateID: fakeDate,
//                dateAccessed: fakeDate,
                type: 1,
                teamRef: cc,
                supportTeamRef: st,
                state: 'new',
                time: 0,
                profile0: {blank: true},
                profile1: {blank: true},
                profile2: {blank: true},
                institution: institutionSlug,
                course: courseSlug,
                accessKeyId: accessKeyId || undefined
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
    const now = new Date();
    const s = new Session({
        uniqueID: `1${tools.padNum(sN, 100000)}${1000 + Math.round(Math.random() * 1000)}`,
        name: sID,
        dateID: tools.getTimeNumber(),
        dateAccessed: tools.getTimeNumber(),
        lastAccessedAt: now,
        expiresAt: buildSessionExpiryDate(now),
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
const ALLOWED_SET_FIELDS = new Set([
    'name',
    'dateID',
    'dateAccessed',
    'playTime',
    'type',
    'teamRef',
    'state',
    'time',
    'supportTeamRef',
    'events',
    'profile0',
    'profile1',
    'profile2'
]);

const ALLOWED_PUSH_FIELDS = new Set(['quiz']);
const DEFAULT_FACILITATOR_TTL_WARNING_DAYS = 14;

const getFacilitatorTtlWarningDays = () => {
    const raw = Number(process.env.FACILITATOR_TTL_WARNING_DAYS);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_FACILITATOR_TTL_WARNING_DAYS;
};

const updateSession = async (sOb, cb) => {
//    console.log(`updateSession called for uniqueID: ${sOb.uniqueID} (${typeof(sOb.uniqueID)})`);
//    console.log(sOb);
    try {
        const filter = { uniqueID: String(sOb.uniqueID) };

        if (!filter.uniqueID) {
            throw new Error('updateSession missing uniqueID');
        }

        const update = { $set: {}, $push: {} };
        const skippedFields = [];

        for (const [key, value] of Object.entries(sOb)) {
            if (key === 'uniqueID') continue; // uniqueID is only used for the filter

            if (ALLOWED_PUSH_FIELDS.has(key)) {
                update.$push[key] = value;
                continue;
            }

            if (ALLOWED_SET_FIELDS.has(key)) {
                update.$set[key] = value;
                continue;
            }

            skippedFields.push(key);
        }

        const now = new Date();
        update.$set.lastAccessedAt = now;
        update.$set.expiresAt = buildSessionExpiryDate(now);

        // Clean up empty operators if not used
        if (Object.keys(update.$push).length === 0) delete update.$push;
        if (Object.keys(update.$set).length === 0) delete update.$set;

        if (!update.$set && !update.$push) {
            throw new Error(`No permitted fields to update. Skipped: ${skippedFields.join(', ') || 'none'}`);
        }


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

// REST handler for access-filtered session listing
const listSessionsForAccess = async (req, res) => {
    try {
        const filter = { ...(req.accessFilter || {}) };
        const accessContext = req.accessContext || {};
        const accessKeyId = (accessContext.accessKeyId || '').toString().trim();
        const hasSessionLimit = Number.isInteger(accessContext.sessionLimit) && accessContext.sessionLimit > 0;
        const ttlWarningDays = getFacilitatorTtlWarningDays();
        const ttlWarningMs = ttlWarningDays * 24 * 60 * 60 * 1000;
        const nowMs = Date.now();

        // For limited keys, scope sessions to the specific access key so
        // "remaining" reflects this key's own allocation only.
        if (hasSessionLimit && accessKeyId) {
            filter.accessKeyId = accessKeyId;
        }

        const sessions = await Session.find(filter).lean();
        
        // Enrich sessions with team country data
        getGameData((gameData) => {
            let nearDeletionCount = 0;
            const enrichedSessions = sessions.map(s => {
                if (s.teamRef !== undefined && gameData.teams && gameData.teams[s.teamRef]) {
                    s.teamCountry = gameData.teams[s.teamRef].country;
                }

                let expiresAtIso = null;
                let msUntilDeletion = null;
                let daysUntilDeletion = null;
                let isNearDeletion = false;
                let isOverdueDeletion = false;

                if (s.expiresAt) {
                    const expiresAtDate = new Date(s.expiresAt);
                    const expiresAtMs = expiresAtDate.getTime();
                    if (Number.isFinite(expiresAtMs)) {
                        expiresAtIso = expiresAtDate.toISOString();
                        msUntilDeletion = expiresAtMs - nowMs;
                        daysUntilDeletion = Math.ceil(msUntilDeletion / (24 * 60 * 60 * 1000));
                        isOverdueDeletion = msUntilDeletion <= 0;
                        isNearDeletion = !isOverdueDeletion && msUntilDeletion <= ttlWarningMs;
                    }
                }

                if (isNearDeletion || isOverdueDeletion) {
                    nearDeletionCount += 1;
                }

                s.ttl = {
                    expiresAt: expiresAtIso,
                    msUntilDeletion,
                    daysUntilDeletion,
                    isNearDeletion,
                    isOverdueDeletion
                };
                return s;
            });

            res.json({
                sessions: enrichedSessions,
                ttlInfo: {
                    warningWindowDays: ttlWarningDays,
                    nearDeletionCount,
                    totalSessions: enrichedSessions.length
                }
            });
        });
    } catch (err) {
        console.error('Error listing sessions for access:', err);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
};

const exportSessionsForAccess = async (req, res) => {
    try {
        const accessContext = req.accessContext || {};
        const accessKeyId = (accessContext.accessKeyId || '').toString().trim();
        const baseFilter = req.accessFilter || {};
        const filter = accessKeyId ? { accessKeyId } : { ...baseFilter };

        const sessions = await Session.find(filter).lean();
        const exportedSessions = sessions.map((s) => {
            const clone = { ...s };
            const sourceMongoId = clone._id ? String(clone._id) : undefined;
            delete clone._id;
            delete clone.__v;
            return {
                ...clone,
                sourceMongoId
            };
        });

        const payload = {
            exportType: 'k2-session-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            scope: {
                accessKeyId: accessKeyId || null,
                type: accessContext.type || null,
                institutionSlug: accessContext.institutionSlug || null,
                courseSlug: accessContext.courseSlug || null,
                facilitator: {
                    firstName: accessContext.firstName || null,
                    surname: accessContext.surname || null,
                    label: accessContext.label || null
                }
            },
            sessions: exportedSessions
        };

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const inst = (accessContext.institutionSlug || 'inst').toLowerCase();
        const course = (accessContext.courseSlug || 'all').toLowerCase();
        const fileName = `k2_sessions_${inst}_${course}_${stamp}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Error exporting sessions for access:', err);
        res.status(500).json({ error: 'Failed to export sessions' });
    }
};

const getSessionStateStats = async () => {
    // Query all sessions and analyze state values
    try {
        const sessions = await Session.find(
            {},
            {
                state: 1,
                name: 1,
                playTime: 1,
                events: 1,
                profile0: 1,
                profile1: 1,
                profile2: 1,
                quiz: 1
            }
        ).lean();
        const stateValues = new Set();
        const stateCountMap = {};
        let minPlayTime = Number.POSITIVE_INFINITY;
        let maxPlayTime = Number.NEGATIVE_INFINITY;
        let hasPlayTimeValues = false;
        const randomPools = {
            events: [],
            profile0: [],
            profile1: [],
            profile2: [],
            quiz: []
        };

        const hasObjectKeys = (value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
            return Object.keys(value).length > 0;
        };
        
        sessions.forEach(s => {
            const state = String(s.state || '').toLowerCase().trim();
            stateValues.add(state);
            stateCountMap[state] = (stateCountMap[state] || 0) + 1;

            const playTime = Number(s.playTime);
            if (Number.isFinite(playTime)) {
                hasPlayTimeValues = true;
                if (playTime < minPlayTime) minPlayTime = playTime;
                if (playTime > maxPlayTime) maxPlayTime = playTime;
            }

            if (Array.isArray(s.events) && s.events.length > 0) {
                randomPools.events.push(s.events);
            }
            if (Array.isArray(s.quiz) && s.quiz.length > 0) {
                randomPools.quiz.push(s.quiz);
            }
            if (hasObjectKeys(s.profile0)) {
                randomPools.profile0.push(s.profile0);
            }
            if (hasObjectKeys(s.profile1)) {
                randomPools.profile1.push(s.profile1);
            }
            if (hasObjectKeys(s.profile2)) {
                randomPools.profile2.push(s.profile2);
            }
        });
        
        return {
            totalSessions: sessions.length,
            uniqueStates: Array.from(stateValues).sort(),
            stateDistribution: stateCountMap,
            playTimeRange: {
                min: hasPlayTimeValues ? minPlayTime : 0,
                max: hasPlayTimeValues ? maxPlayTime : 0
            },
            randomPools
        };
    } catch (err) {
        console.error('Error analyzing session states:', err);
        throw err;
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
    changeSupportTeam,
    listSessionsForAccess,
    exportSessionsForAccess,
    getHighestSessionNumber,
    getSessionStateStats
};
