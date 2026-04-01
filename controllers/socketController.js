const socketIo = require('socket.io');
const { getEventEmitter } = require('./../controllers/eventController');
const sessionController = require('./../controllers/sessionController');
const Session = require('./../models/session');
//const downloadController = require('./../controllers/downloadController');
const { saveCSVLocally, convertToCSV } = require('./../controllers/downloadController');
const logController = require('./../controllers/logController');
const databaseController = require('./../controllers/databaseController');
const gfxController = require('./../controllers/gfxController');
const quizController = require('./../controllers/quizController');

const tools = require('./../controllers/tools');
const { sessionMiddleware, buildAccessFilter } = require('./../controllers/authController');

const eventEmitter = getEventEmitter();

let io = null;

const normalizeSlug = (value) => (value || '').toLowerCase().trim();

const getCourseScopeFromSession = (session = {}) => {
    const access = session.access || {};
    const institutionSlug = normalizeSlug(access.institutionSlug);
    const courseSlug = normalizeSlug(access.courseSlug);
    if (!institutionSlug || !courseSlug) {
        return null;
    }
    return { institutionSlug, courseSlug };
};

const getFacilitatorCourseRoom = (institutionSlug, courseSlug) => {
    return `facilitator-course-${normalizeSlug(institutionSlug)}-${normalizeSlug(courseSlug)}`;
};

const countPlayersForCourse = (institutionSlug, courseSlug) => {
    if (!io) {
        return 0;
    }
    const inst = normalizeSlug(institutionSlug);
    const course = normalizeSlug(courseSlug);
    let count = 0;

    io.of('/').sockets.forEach((connectedSocket) => {
        const role = (connectedSocket.handshake && connectedSocket.handshake.query && connectedSocket.handshake.query.role) || '';
        if (role !== 'player') {
            return;
        }
        const scope = getCourseScopeFromSession(connectedSocket.request && connectedSocket.request.session ? connectedSocket.request.session : {});
        if (!scope) {
            return;
        }
        if (scope.institutionSlug === inst && scope.courseSlug === course) {
            count += 1;
        }
    });

    return count;
};

const emitFacilitatorPlayerCount = (institutionSlug, courseSlug) => {
    if (!io) {
        return;
    }
    const inst = normalizeSlug(institutionSlug);
    const course = normalizeSlug(courseSlug);
    if (!inst || !course) {
        return;
    }
    const playerCount = countPlayersForCourse(inst, course);
    io.to(getFacilitatorCourseRoom(inst, course)).emit('facilitatorPlayerCount', {
        institutionSlug: inst,
        courseSlug: course,
        playerCount,
        timestamp: Date.now()
    });
};

const showRoomSize = (id) => {
    const roomName = id;
    const room = io.sockets.adapter.rooms.get(roomName);
    if (room) {
        const numSockets = room.size;
//        console.log(room);
        console.log(`Number of sockets in room ${roomName}: ${numSockets}`);
        return room.size;
    } else {
        console.log(`Room ${roomName} does not exist or has no sockets.`);
        return null;
    }
};
const getRoomSockets = (id) => {
    const roomName = id;
    const room = io.sockets.adapter.rooms.get(roomName);
    if (room) {
//        console.log(room)
        return room;
    } else {
        return new Set([]);
    }
};

const getPlayerHandshake = () => {
    const ph = process.env.CLIENT_HANDSHAKE;
//    console.log(ph);
    return ph;
};
// Function to initialize socket.io
function initSocket(server) {
    io = socketIo(server);
    
    // Share express session with socket.io
    io.engine.use(sessionMiddleware);
    
    // Handle client events
    io.on('connection', async (socket) => {
        let ref = socket.request.headers.referer || '';
        let src = ref.split('?')[0]
        src = src.split('/').reverse()[0];
        src = `/${src}`;
        const Q = socket.handshake.query;
        let sType = false;
        
        // Get session from socket request
        const session = socket.request.session || {};
        const getAccessFilter = () => buildAccessFilter(session || {});
        socket.on('checkSocket', (o, cb) => {
            const sock = `${o.address}-${o.sock}`;
            const ro = {total: showRoomSize(sock)};
            if (cb) {
                cb(ro);
//                console.log(`there is one`);
            } else {
                console.log(`no callback provided`);
            }
        });
//        console.log('emitting socketConnect');
        socket.emit('socketConnect', {
            port: process.env.PORT,
            testID: process.env.TEST_ID
        });
        if (Q) {
            if (Boolean(Q.role)) {
                sType = Q.role;
            }
        }

        if (Boolean(sType)) {
            // common methods
            socket.on('getSessions', (sOb, cb) => {
                const filter = getAccessFilter();
                if (filter === null) {
                    return cb ? cb({ error: 'unauthorized' }, null) : null;
                }
                const query = { ...(sOb || {}) };
                Object.assign(query, filter);
                sessionController.getSessions(query, cb);
            });
            // end common
            // game clients
            if (sType === 'player') {
                console.log('player enters');
                const playerScope = getCourseScopeFromSession(session);
//                console.log('handshakeCheck', getPlayerHandshake());
//                console.log(Q);
                const persistPlayerSessionBinding = (uniqueID, payload = {}) => {
                    return new Promise((resolve) => {
                        const requestSession = socket.request && socket.request.session ? socket.request.session : null;
                        if (!requestSession || !uniqueID) {
                            return resolve();
                        }

                        requestSession.playerSession = {
                            uniqueID,
                            institutionSlug: normalizeSlug((payload && payload.institution) || (requestSession.access && requestSession.access.institutionSlug)),
                            courseSlug: normalizeSlug((payload && payload.course) || (requestSession.access && requestSession.access.courseSlug)),
                            accessKeyId: ((payload && payload.accessKeyId) || (requestSession.access && requestSession.access.accessKeyId) || '').toString().trim(),
                            updatedAt: Date.now()
                        };

                        requestSession.save((err) => {
                            if (err) {
                                console.warn('Failed to persist player session binding:', err && err.message ? err.message : err);
                            }
                            resolve();
                        });
                    });
                };

                socket.join('players');
                socket.emit('handshakeCheck', getPlayerHandshake());
                if (playerScope) {
                    emitFacilitatorPlayerCount(playerScope.institutionSlug, playerScope.courseSlug);
                }
                socket.on('joinRoom', (r) => {
                    const rid = `s-${r}`;
                    socket.join(rid);
                    console.log(`join room ${rid} ${showRoomSize(rid)}`);
                });
                socket.on('disconnect', () => {
                    if (playerScope) {
                        emitFacilitatorPlayerCount(playerScope.institutionSlug, playerScope.courseSlug);
                    }
//                    console.log('gone');
                });
                socket.on('newSession', (ob = {}, cb) => {
//                    console.log('new session');
                    const payload = { ...(ob || {}) };
                    const accessScope = getCourseScopeFromSession(session);
                    if (accessScope) {
                        payload.institution = accessScope.institutionSlug;
                        payload.course = accessScope.courseSlug;
                    }
                    (async () => {
                        const access = session && session.access ? session.access : null;
                        const sessionLimit = access && Number.isInteger(access.sessionLimit) ? access.sessionLimit : null;
                        const accessKeyId = access && access.accessKeyId ? String(access.accessKeyId).trim() : '';
                        if (accessKeyId) {
                            payload.accessKeyId = accessKeyId;
                        }

                        if (sessionLimit) {
                            const institutionFilter = normalizeSlug((payload && payload.institution) || (access && access.institutionSlug));
                            const courseFilter = normalizeSlug((payload && payload.course) || (access && access.courseSlug));
                            const countFilter = {};
                            if (accessKeyId) {
                                countFilter.accessKeyId = accessKeyId;
                            } else {
                                if (institutionFilter) {
                                    countFilter.institution = institutionFilter;
                                }
                                if (courseFilter) {
                                    countFilter.course = courseFilter;
                                }
                            }

                            const existingCount = await Session.countDocuments(countFilter);
                            if (existingCount >= sessionLimit) {
                                if (cb) {
                                    cb({
                                        error: 'session_limit_reached',
                                        message: `Session limit reached (${sessionLimit})`
                                    });
                                }
                                return;
                            }
                        }

                        sessionController.newSession(payload, (createdSession) => {
                            if (io) {
                                io.to('facilitators').emit('facilitatorSessionCreated', {
                                    uniqueID: createdSession && createdSession.uniqueID ? createdSession.uniqueID : null,
                                    timestamp: Date.now()
                                });
                            }
                            if (createdSession && createdSession.uniqueID) {
                                persistPlayerSessionBinding(createdSession.uniqueID, payload).finally(() => {
                                    if (cb) {
                                        cb(createdSession);
                                    }
                                });
                                return;
                            }
                            if (cb) {
                                cb(createdSession);
                            }
                        });
                    })().catch((err) => {
                        console.error('Failed to enforce session limit:', err);
                        if (cb) {
                            cb({ error: 'session_limit_check_failed' });
                        }
                    });
                });
                socket.on('restoreSession', (sOb, cb) => {
//                    console.log('restored session');
                    sessionController.restoreSession(sOb, (restoredSession) => {
                        if (restoredSession && restoredSession.uniqueID) {
                            const payload = {
                                institution: restoredSession.institution,
                                course: restoredSession.course
                            };
                            persistPlayerSessionBinding(restoredSession.uniqueID, payload).finally(() => {
                                if (cb) {
                                    cb(restoredSession);
                                }
                            });
                            return;
                        }
                        if (cb) {
                            cb(restoredSession);
                        }
                    });
                });
                socket.on('getSession', (sOb, cb) => {
                    sessionController.getSession(sOb, cb);
                });
                socket.on('updateSession', (sOb, cb) => {
                    sessionController.updateSession(sOb, cb);
                });
                socket.on('deleteSession', (sOb, cb) => {
                    console.log(`try to delete`);
                    sessionController.deleteSession(sOb, cb);

                });
                socket.on('getGameData', cb => {
                    sessionController.getGameData(cb);
                });
                socket.on('test', o => {
                    console.log('the test:');
                    console.log(o);
                });
                socket.on('writeJsonFile', (dir, f, o) => {
                    logController.writeBeautifiedJson(dir, f, o);
                });
                socket.on('createQR', (loc, cb) => {
//                    console.log('create a QR');
                    gfxController.generateLocationQR(loc, cb);
//                    gfxController.generateLocalQR();
                });
                socket.on('logUpdate', o => {
                    logController.addUpdate({update: JSON.stringify(o)});
                });
                socket.on('logUpdateNO', msg => {
                    logController.addUpdate({update: JSON.stringify({msg: msg})});
                });
                socket.on('resetUpdates', msg => {
                    logController.resetUpdates();
                });
                socket.on('toggleAutoResourceResult', (data) => {
                    io.to(data.to).emit('toggleAutoResourceResponse', data.result);
                });
                socket.on('toggleCheatingResult', (data) => {
                    io.to(data.to).emit('toggleCheatingResponse', data.result);
                });
                socket.on('changeSupportTeam', (sid, cb) => {
                    sessionController.changeSupportTeam(sid, cb);
                });
                socket.on('finalReport', (ob) => {
                    logController.writeFinalReport(ob);
                });
                socket.on('writeClimberLog', (ob) => {
                    logController.writeClimberLog(ob);
                });
                socket.on('deleteSessionLogs', (id) => {
                    logController.deleteSessionLogs(id);
                });
                socket.on('getQuestionRefs', async ({ bank }, cb) => {
                    try {
                        const questionRefs = await quizController.getQuestionRefs(bank);
                        cb(questionRefs);
                    } catch (err) {
                        console.error('Error in getQuestionRefs:', err);
                        cb(null);
                    }
                });
                socket.on('getQuizQuestion', async ({ qId, bank, excludeIds }, cb) => {
                    try {
                        const question = await quizController.getQuestion(bank, qId, excludeIds);
                        cb(question);
                    } catch (err) {
                        console.error('Error in getQuizQuestion:', err);
                        cb(null);
                    }
                });
                socket.on('submitAnswer', async ({ sessionID, bank, questionId, selectedIndexes }, callback) => {
                    try {
//                        console.log('selectedIndexes:', selectedIndexes)
                        const result = await quizController.checkAnswer(bank, questionId, selectedIndexes);
//                        console.log(`submitAnswer result:`);
//                        console.log(result);
//                        console.log(`submitAnswer input:`);
//                        console.log(selectedIndexes);
//                        console.log(sessionID)

                        const ob = {
                            uniqueID: sessionID,
                            quiz: selectedIndexes
                        }
                        sessionController.updateSession(ob, () => {
//                            console.log('update sent, check DB')
                        });

                        if (io) {
                            io.to('facilitators').emit('facilitatorQuizAnswer', {
                                sessionID,
                                bank,
                                questionId,
                                selectedIndexes,
                                timestamp: Date.now()
                            });
                        }

                        callback(result); // returns { correct: true/false }
                    } catch (err) {
                        callback({ error: err.message });
                    }
                });


            }
            // end game clients
            // admin clients
            if (sType.includes('admin')) {
                // Verify admin authentication
                if (!session.isAuthenticated || (session.role !== 'admin' && session.role !== 'superuser')) {
                    console.warn('Unauthorized admin socket connection attempt');
                    socket.emit('authError', { message: 'Admin authentication required' });
                    socket.disconnect(true);
                    return;
                }
                
                console.log('Authenticated admin socket connection established');
                
                socket.on('getSessions', (sOb, cb) => {
                    sessionController.getSessions(sOb, cb)
                });
                socket.on('getSession', (cb) => {
                    sessionController.getSession()
                });
                socket.on('deleteSession', (sOb, cb) => {
//                    console.log('this has been temporarily removed, see other surrounding methods in socketController for approach to take');
                    sessionController.deleteSession(sOb, cb);
                });
                socket.on('deleteSessions', (dOb, cb) => {
                    sessionController.deleteSessions(dOb, cb);
                });
                socket.on('createQR', (cb) => {
                    console.log('create a QR');
//                    gfxController.generateLocationQR(loc, cb);
                    gfxController.generateLocalQR(cb);
                });
//                socket.on('deleteSessions', (sOb, cb) => {
//                    sessionController.deleteSessions(sOb, cb);
//                });
                socket.on('getData', (cb) => {
                    console.log('data request admin')
                    sessionController.getGameData(cb);
                });
                socket.on('getQuizQuestion', async ({ qId, bank, excludeIds }, cb) => {
                    try {
                        const question = await quizController.getQuestion(bank, qId, excludeIds);
                        cb(question);
                    } catch (err) {
                        console.error('Error in getQuizQuestion:', err);
                        cb(null);
                    }
                });
                socket.on('createCsv', (data, filename = 'session_data', cb) => {
                    try {
                        const savedPath = saveCSVLocally(data, `${filename}.csv`);

                        if (savedPath) {
                            console.log('CSV saved to:', savedPath);
                            socket.emit('csvSaved', { path: savedPath });
                            if (cb) {
                                cb(null, `CSV saved to ${savedPath}`);
                            }
                        } else {
                            // saving skipped (e.g. running in production)
                            const msg = 'CSV saving skipped (not running locally)';
                            console.log(msg);
                            if (cb) {
                                cb(null, msg); // null error, but msg explains
                            }
                        }
                    } catch (error) {
                        console.error('Error saving CSV:', error);
                        socket.emit('csvSaveError', { message: error.message });
                        if (cb) {
                            cb(error, null);
                        }
                    }
                });

            }
            // end admin clients
            // facilitator dashboard clients
            if (sType === 'facilitator') {
                const filter = getAccessFilter();
                if (filter === null) {
                    socket.emit('authError', { message: 'Facilitator authentication required' });
                    socket.disconnect(true);
                    return;
                }

                socket.join('facilitators');
                const facilitatorScope = getCourseScopeFromSession(session);
                if (facilitatorScope) {
                    const room = getFacilitatorCourseRoom(facilitatorScope.institutionSlug, facilitatorScope.courseSlug);
                    socket.join(room);
                    socket.emit('facilitatorPlayerCount', {
                        institutionSlug: facilitatorScope.institutionSlug,
                        courseSlug: facilitatorScope.courseSlug,
                        playerCount: countPlayersForCourse(facilitatorScope.institutionSlug, facilitatorScope.courseSlug),
                        timestamp: Date.now()
                    });
                }
                socket.on('disconnect', () => {
//                    console.log('facilitator disconnected');
                });
            }
            // end facilitator dashboard clients
            // mapper clients
            if (sType === 'mapper') {
                console.log('mapper client')
                socket.on('writeMapFile', (o) => {
                    console.log('ok to write');
                    logController.writeMapFile(o);
                });
            }
            // end mapper clients
            // profile builder clients
            if (sType === 'profilebuilder') {
//                console.log('profilebuilder client');
                socket.on('writeProfile', (o) => {
//                    console.log('ok to write');
                    logController.writeProfileFile(o);
                });
                socket.on('getData', (cb) => {
                    sessionController.getGameData(cb);
                });
                socket.on('getProfileFiles', (path, cb) => {
                    logController.getProfileFiles(path, cb);
                });
                socket.on('writeJsonFile', (dir, f, o) => {
                    logController.writeBeautifiedJson(dir, f, o);
                });
            }
            // end profile builder clients
            // log display client
            if (sType === 'logdisplay') {
                socket.on('getUpdateLogs', (cb) => {
                    logController.getUpdateLog(cb);
                });
                socket.on('resetUpdates', (cb) => {
                    logController.resetUpdates(cb);
                });
                socket.on('archiveUpdates', (cb) => {
                    logController.archiveUpdates(cb);
                });
            }
            // end log display client
            // toolkit client
            if (sType === 'toolkit') {
                io.to('players').emit('requestGame', Q.gameID);
                socket.on('gameFound', (g) => {
                    socket.emit('returnGame', g);
                });
                socket.on('toolkitClosed', (data) => {
//                    console.log('toolkitClosed');
                    io.to(`s-${data.gameID}`).emit('toolkitClosed');
                });
                socket.on('startNew', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`startNew to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('toolkitStartNew');
                });
                socket.on('idGame', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`idGame to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('idGame');
                });
                socket.on('toggleAutoResource', (data) => {
                    // Include the originator's socket ID so client 2 can reply
                    const targetSocketId = socket.id;
                    const payload = {
                        Q: { gameID: data.gameID },
                        from: targetSocketId,
                    };
                    const room = `s-${data.gameID}`;
                    io.to(room).emit('toggleAutoResource', payload);
                });
                socket.on('toggleCheating', (data) => {
                    // Include the originator's socket ID so client 2 can reply
                    const targetSocketId = socket.id;
                    const payload = {
                        Q: { gameID: data.gameID },
                        from: targetSocketId,
                    };
                    const room = `s-${data.gameID}`;
//                    console.log(`emit toggleCheating to ${room} (${showRoomSize(room)})`);
                    io.to(room).emit('toggleCheating', payload);
                });
                socket.on('playPause', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`playPause to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('playPause');
                });
                socket.on('resetTime', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`resetTime to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('resetTime');
                });
                socket.on('interruptGame', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`interruptGame to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('interruptGame', { hours: data.hours, minutes: data.minutes });
                });

                socket.on('startStorm', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`startStorm to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('startStorm');
                });
                socket.on('resetStorm', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`resetStorm to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('resetStorm');
                });
                socket.on('toggleDebug', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`toggleDebug to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('toggleDebug');
                });
                socket.on('clearConsole', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`clearConsole to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('clearConsole');
                });
                socket.on('refreshWin', (data) => {
                    const r = `s-${data.gameID}`;
//                    console.log(`clearConsole to ${r} which has ${showRoomSize(r)} room`);
                    io.to(r).emit('refreshWin');
                });
            }
            // end toolkit client
        }
    });

//    eventEmitter.on();


};

//const emitAll = (ev, o) => {
//    io.emit(ev, o);
//};
//const emitSystem = (ev, o) => {
//    if (io) {
//        adminDashboardNamespace.emit(ev, o)
//    }
//};
//const getSockets = (id) => {
//    return getRoomSockets(id);
//};
module.exports = {
    initSocket,
    eventEmitter
};
