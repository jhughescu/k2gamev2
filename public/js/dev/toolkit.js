document.addEventListener('DOMContentLoaded', function () {
    let initObj;
    let socket;
    let info;
    const ins = $('#insertion');
    //
    const bToggleAutoRes = $('#toggleAutoResource');
    const bToggleCheating = $('#toggleCheating');
    const bStart = $('#startNew');
    const bID = $('#idGame');
    const bPlay = $('#playPause');
    const bResetTime = $('#resetTime');
    const bStartStorm = $('#startStorm');
    const bResetStorm = $('#resetStorm');
    const bToggleDebug = $('#toggleDebug');
    const bClearConsole = $('#clearConsole');
    //
    const setupSocket = () => {
        socket.on('gameFound', (g) => {
            console.log('we have a game', g);
        });
    };
    const initControls = () => {
        bToggleAutoRes.off('click').on('click', toggleAutoResource);
        bToggleCheating.off('click').on('click', toggleCheating);
        bStart.off('click').on('click', startNew);
        bID.off('click').on('click', idGame);
        bPlay.off('click').on('click', playPause);
        bResetTime.off('click').on('click', resetTime);
        bStartStorm.off('click').on('click', startStorm);
        bResetStorm.off('click').on('click', resetStorm);
        bToggleDebug.off('click').on('click', toggleDebug);
        bClearConsole.off('click').on('click', clearConsole);
    };
    const closedown = () => {
//        socket.emit('toolkitClosed', { gameID: initObj.uniqueID });
    };
    const init = () => {
        const q = window.getQueries();
        initObj = Object.assign({}, q);
        socket = io('', {
            query: {
                role: 'toolkit',
                gameID: initObj.uniqueID,
                gameName: initObj.name
            }
        });
        initControls();
        window.addEventListener('beforeunload', closedown);
        window.addEventListener('message', (ev) => {
//            console.log(`i heard ${ev.data.type}`);
            console.log(ev.data);
            console.log(ev);
        });
        window.addEventListener('load', () => {
//            console.log('loaded');
            info = window.opener.requestToolkitInfo(window.getQueries().uniqueID);
            if (info.hasOwnProperty('autoResource')) {
                renderArButton(info.autoResource);
            }
            if (info.hasOwnProperty('cheating')) {
                renderCheatButton(info.cheating);
            }
        })
    };

//    control actions
    const renderArButton = (res) => {
        const b = bToggleAutoRes;
        const t = b.text().replace(/\s*\(on\)|\s*\(off\)/i, '');
        b.text(`${t} (${res ? 'on' : 'off'})`);
    };
    const renderCheatButton = (res) => {
        const b = bToggleCheating;
        const t = b.text().replace(/\s*\(on\)|\s*\(off\)/i, '');
        b.text(`${t} (${res ? 'on' : 'off'})`);
    };
    const toggleAutoResource = () => {
        socket.emit('toggleAutoResource', { gameID: initObj.uniqueID });
        // Listen for the response
        socket.once('toggleAutoResourceResponse', (res) => {
            renderArButton(res);
        });
    };
    const toggleCheating = () => {
        socket.emit('toggleCheating', { gameID: initObj.uniqueID });
        // Listen for the response
        socket.once('toggleCheatingResponse', (res) => {
            console.log('tc res');
            renderCheatButton(res);
        });
    };
    const startNew = () => {
        socket.emit('startNew', { gameID: initObj.uniqueID });
    };
    const idGame = () => {
//        console.log('I will ID');
        socket.emit('idGame', { gameID: initObj.uniqueID });
    };
    const playPause = () => {
        socket.emit('playPause', { gameID: initObj.uniqueID });
    };
    const resetTime = () => {
        socket.emit('resetTime', { gameID: initObj.uniqueID });
    };
    const startStorm = () => {
        socket.emit('startStorm', { gameID: initObj.uniqueID });
    };
    const resetStorm = () => {
        socket.emit('resetStorm', { gameID: initObj.uniqueID });
    };
    const toggleDebug = () => {
        socket.emit('toggleDebug', { gameID: initObj.uniqueID });
    };
    const clearConsole = () => {
        socket.emit('clearConsole', { gameID: initObj.uniqueID });
    };
    init();
});
