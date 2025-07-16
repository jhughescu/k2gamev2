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
    const bRefreshGame = $('#refreshGame');
    const bTestClimbers = $('#testClimbers');
    const bToggleLocal = $('#toggleLocal');
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
        bRefreshGame.off('click').on('click', refreshGameWin);
        bTestClimbers.off('click').on('click', testClimbers);
        bToggleLocal.off('click').on('click', toggleLocal);
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
            info = window.opener.requestToolkitInfo(window.getQueries().uniqueID);
            console.log('loaded', info);
            if (info.hasOwnProperty('autoResource')) {
                renderArButton(info.autoResource);
            }
            if (info.hasOwnProperty('cheating')) {
                renderCheatButton(info.cheating);
            }
        })
    };
    const testClimbers = () => {
        // create climbers for testing (do not store, i.e. set type to -9999)
//        console.log('testClimbers');
//        console.log(info.gameData.teams);
        if (info.gameData) {
            let cCount = 0;
            let str = '<div class="grid-container">';
            info.gameData.teams.forEach(t => {
                console.log(`${t.adjective} team:`)
                Object.values(t.profiles).forEach((p, i) => {
//                    console.log(p);
                    const clOb = {
                        profile: i,
                        type: -9999,
                        team: t,
                        teamID: t.id,
                        gameData: info.gameData
                    }
                    const c = new Climber(clOb);
//                    console.log(clOb);
//                    console.log(c);
                    cCount++;
                    str += `<div class="grid-item">`;
                    str += `<img src='assets/profiles/profileimages_${c.filename}.png'>`;
                    str += `<p>${c.name}</p>`;
                    str += `<p>${c.filename}.png</p>`;
                    str += `<p>${c.team.country}</p>`;
                    str += `</div>`;
                });
            });
            str += '</div>';
            $('#insertion').html(str);
//            console.log(`${cCount} climbers created`);
        }
        /*
        const clOb = {
            profile: i,
            type: -9999,
            team: t,
            teamID: t.id,
            gameData: gameData
        }
        const c = createClimber(clOb);
        */
    };
    window.testClimbers = testClimbers;
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
    const toggleLocal = () => {
        socket.emit('toggleLocalAccess', () => {

        });
    }
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
    const refreshGameWin = () => {
        socket.emit('refreshWin', { gameID: initObj.uniqueID });
    };
    window.showInfo = () => {
        console.log(info);
    };
    init();
});
