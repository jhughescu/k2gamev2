const socketIo = require('socket.io');
const { getEventEmitter } = require('./../controllers/eventController');
const routeController = require('./../controllers/routeController');
const sessionController = require('./../controllers/sessionController');
//const downloadController = require('./../controllers/downloadController');
const { saveCSVLocally, convertToCSV } = require('./../controllers/downloadController');
const logController = require('./../controllers/logController');
const databaseController = require('./../controllers/databaseController');
const gfxController = require('./../controllers/gfxController');
const quizController = require('./../controllers/quizController');

const tools = require('./../controllers/tools');

const eventEmitter = getEventEmitter();

let io = null;

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
    // Handle client events
    io.on('connection', async (socket) => {
        let ref = socket.request.headers.referer;
        let src = ref.split('?')[0]
        src = src.split('/').reverse()[0];
        src = `/${src}`;
        const Q = socket.handshake.query;
        let sType = false;
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
                sessionController.getSessions(sOb, cb);
            });
            // end common
            // game clients
            if (sType === 'player') {
                console.log('player enters');
//                console.log('handshakeCheck', getPlayerHandshake());
//                console.log(Q);
                socket.join('players');
                socket.emit('handshakeCheck', getPlayerHandshake());
                socket.on('joinRoom', (r) => {
                    const rid = `s-${r}`;
                    socket.join(rid);
                    console.log(`join room ${rid} ${showRoomSize(rid)}`);
                });
                socket.on('disconnect', () => {
//                    console.log('gone');
                });
                socket.on('newSession', (ob = {}, cb) => {
//                    console.log('new session');
                    sessionController.newSession(ob, cb);
                });
                socket.on('restoreSession', (sOb, cb) => {
//                    console.log('restored session');
                    sessionController.restoreSession(sOb, cb);
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

                        callback(result); // returns { correct: true/false }
                    } catch (err) {
                        callback({ error: err.message });
                    }
                });


            }
            // end game clients
            // admin clients
            if (sType.includes('admin')) {
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
