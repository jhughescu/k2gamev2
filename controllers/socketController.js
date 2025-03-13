const socketIo = require('socket.io');
const { getEventEmitter } = require('./../controllers/eventController');
const routeController = require('./../controllers/routeController');
const sessionController = require('./../controllers/sessionController');
const downloadController = require('./../controllers/downloadController');
const logController = require('./../controllers/logController');
const databaseController = require('./../controllers/databaseController');
const gfxController = require('./../controllers/gfxController');

const tools = require('./../controllers/tools');

const eventEmitter = getEventEmitter();

let io = null;

const showRoomSize = (id) => {
    const roomName = id;
    const room = io.sockets.adapter.rooms.get(roomName);
    if (room) {
        const numSockets = room.size;
//        console.log(room);
        log(`Number of sockets in room ${roomName}: ${numSockets}`);
        return room.size;
    } else {
        log(`Room ${roomName} does not exist or has no sockets.`);
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
        console.log('emitting socketConnect')
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
                socket.emit('handshakeCheck', getPlayerHandshake());
                socket.on('disconnect', () => {
//                    console.log('gone');
                });
                socket.on('newSession', (cb) => {
                    sessionController.newSession(cb);
                });
                socket.on('restoreSession', (sOb, cb) => {
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
                    console.log('create a QR');
                    gfxController.generateLocationQR(loc, cb);
                });
            }
            // end game clients
            // admin clients
            if (sType === 'admin') {
                socket.on('deleteSessions', (sOb, cb) => {
                    sessionController.deleteSessions(sOb, cb);
                });
            }
            if (sType === 'session.admin') {
                socket.on('getAllSessions', (dbName, collectionName, cb) => {
                    databaseController.getAllSessions(dbName, collectionName, cb);
                });
                socket.on('deleteSession', (dbName, collectionName, sessionID, cb) => {
                    databaseController.deleteSession(dbName, collectionName, sessionID, cb);
                });
//                socket.on('deleteSessions', (sOb, cb) => {
//                    sessionController.deleteSessions(sOb, cb);
//                });
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
