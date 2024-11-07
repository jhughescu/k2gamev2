const socketIo = require('socket.io');
const { getEventEmitter } = require('./../controllers/eventController');
const routeController = require('./../controllers/routeController');
//const sessionController = require('./../controllers/sessionController');
const downloadController = require('./../controllers/downloadController');
const logController = require('./../controllers/logController');

const tools = require('./../controllers/tools');

const eventEmitter = getEventEmitter();

let io = null;
let adminDashboardNamespace = null;
let facilitatorDashboardNamespace = null;
let playerNamespace = null;
const logging = false;

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
// Function to initialize socket.io
function initSocket(server) {
    io = socketIo(server);
    logController.emptyFolder('logs');
    // Handle client events
    io.on('connection', async (socket) => {
        let ref = socket.request.headers.referer;
        let src = ref.split('?')[0]
        src = src.split('/').reverse()[0];
        src = `/${src}`;
        const Q = socket.handshake.query;

        socket.on('checkSocket', (o, cb) => {
            console.log(`request for sock: ${o.sock}, ${o.address}`);
            const sock = `${o.address}-${o.sock}`;
            const ro = {total: showRoomSize(sock)};
//            console.log(`request for sock: ${sock}`);
//            const total = getRoomSockets(sock);
//            console.log(sock);
//            console.log(total);
//            console.log(getRoomSockets(sock));
            if (cb) {
                cb(ro);
//                console.log(`there is one`);
            } else {
                console.log(`no callback provided`);
            }
        });
        socket.emit('socketConnect', {
            port: process.env.PORT,
            testID: process.env.TEST_ID
        });
        // Spedific client ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if (Q.role === 'PASSED_VALUE') {
            // when a client connects it can pass a 'role' value which places it into a specific room for event targetting
            roomID = `${session.address}-ROOMID  `;
            socket.join(roomID);
            console.log('PASSED_VALUE connected');
            socket.on('disconnect', () => {
    //            log('User disconnected from the admin dashboard');
            });
        }
        // End specific client ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    });



    eventEmitter.on('EVENT', () => {
        const rooms = [];
        rooms.forEach(r => {
            const room = `${game.address}${r}`;
//            console.log(`emit gameUpdate to room ${room} which has ${getRoomSockets(room).size} socket(s)`);
            io.to(room).emit('gameUpdate', eGame);
        });
    });
};

const emitAll = (ev, o) => {
    io.emit(ev, o);
};
const emitSystem = (ev, o) => {
    if (io) {
        adminDashboardNamespace.emit(ev, o)
    }
};
const getSockets = (id) => {
    return getRoomSockets(id);
};
module.exports = {
    initSocket,
    eventEmitter,
    emitSystem,
    emitAll,
    gameNamespaces
};
