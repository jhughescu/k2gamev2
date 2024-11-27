const socketIo = require('socket.io');
const { getEventEmitter } = require('./../controllers/eventController');
const routeController = require('./../controllers/routeController');
const sessionController = require('./../controllers/sessionController');
const downloadController = require('./../controllers/downloadController');
const logController = require('./../controllers/logController');

const tools = require('./../controllers/tools');

const eventEmitter = getEventEmitter();

let io = null;
if (1 == 2) {
//let adminDashboardNamespace = null;
//let facilitatorDashboardNamespace = null;
//let playerNamespace = null;
//const logging = false;
/*
const gameNamespaces = {};

const log = (msg) => {
    if (process.env.ISDEV && logging) {
        if (typeof(msg) === 'object' && !msg.hasOwnProperty('length')) {
            console.log(Object.assign({loggedBy: 'socketController'}, msg));
        } else {
            console.log(`socketController: ${msg}`);
        }
    }
}
const procVal = (v) => {
    // process values into numbers, booleans etc
    if (!isNaN(parseInt(v))) {
        v = parseInt(v);
    } else if (v === 'true') {
        v = true;
    } else if (v === 'false') {
        v = false;
    }
    return v;
}
const getQueries = (u) => {
//    log(u);
    let r = u.split('?');
    let qu = {};
    if (r.length > 1) {
        r = r[1].split('&');
        r.forEach(q => {
            q = q.split('=');
            qu[q[0]] = procVal(q[1]);
        });
    }
//    console.log(qu);
    return qu;
};
*/
}
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
                console.log('player enters')
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
                })
            }
            // end game clients
            // admin clients
            if (sType === 'admin') {
                socket.on('deleteSessions', (sOb, cb) => {
                    sessionController.deleteSessions(sOb, cb);
                });
            }
            // end admin clients
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
