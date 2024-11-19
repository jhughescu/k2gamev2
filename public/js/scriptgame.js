document.addEventListener('DOMContentLoaded', function () {
    //    return;
    const socket = io('', {
        query: {
            role: 'player'
        }
    });
    socket.on('disconnect', () => {
//        theState.storeTime(session.time);

        gameflow('server connection lost - show warning', {style: 'warning'});
    });
    socket.on('handshakeCheck', (str) => {
        gameflow('please wait, checking connection');
        handshake = str;
        setTimeout(() => {
            checkSession();
        }, 1000);
    });
    const msgWin = $('#msg');
    const msgs = [];

    const sessionPlayPause = $('#b_playpause');
    const sessionReset = $('#b_reset');
    const timeDisplay = $('#time_display');

    const confirmStartNew = () => {
        let startNew = false;
//        startNew = confirm('would you like to start a new game?');
        if (startNew) {
            clearSession();
            newconnect = false;
        }
    };
    const confirmRetry = () => {
        gameflow(`would you like to try to connect again?`)
    };

    const program = {
        confirms: {
            confirm1: confirmStartNew,
            confirm2: confirmRetry
        }
    };

    let handshake = null;
    let session = null;
    let newconnect = false;
    // state stuff
    let theState = null;
    // end state stuff


    const getStoreID = () => {
        return `${handshake}-id${getIdAdj()}`;
    };
    const gameflow = (msg, ob) => {
        let act = false;
        if (msg.includes('[')) {
            act = msg.match(/\[(.*?)\]/g).map(match => match.slice(1, -1));
            msg = msg.replace(/\[.*?\]/g, '');
        }
        const newMsg = msg + (act ? `: ${act}` : '');
        let mOb = {msg: newMsg};
        if (ob) {
            mOb = Object.assign(mOb, ob);
        }
//        console.log(mOb);
        msgs.push(mOb);
        msgWin.html('');
        msgs.forEach(m => {
            msgWin.append(`<p class='message ${m.hasOwnProperty('style') ? m.style : ''}'>${m.msg}</p>`);
        });
        if (typeof (program.confirms[act]) === 'function') {
            program.confirms[act]();
        }
    };
    const getIdAdj = () => {
        const q = window.location.search;
        let a = '';
        if (q) {
            a = `-${q.replace('?', '').split('&').filter(s => s.includes('fake'))[0].split('=')[1]}`;
        }
        return a;
    };
    const summariseSession = () => {
        gameflow(`your country is ${session.team.country}`);
        console.log(session);
    };

    const storeLocal = (p, v) => {
        const id = `${getStoreID()}-${p}`;
        console.log(`storing`, id, v);
        localStorage.setItem(id, v);
    };
    const getLocal = (p) => {
        const id = `${getStoreID()}-${p}`;
        return localStorage.getItem(id);
    };
    const snapshot = () => {
        // store all required session data in local object for quick retrieval
//        storeLocal('time', session.time);
        storeLocal('time', gTimer.elapsedTime);
    };
    const clearSnapshot = () => {
        const kill = [];
        for (var i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const match = getStoreID();
            console.log(k === match)
            // snapshot does not include the session ID:
            if (k.includes(match) && k !== match) {
                kill.push(k);
            }
        }
        kill.forEach(k => {
            localStorage.removeItem(k);
        });
    };
    const updateView = () => {
//        showtime(session.time);
        showtime(gTimer.elapsedTime);
    };
    const setSession = (sesh, type) => {
        // unified method for setting the session
        session = sesh;
        gameflow(`session initialised (${type}) with ID ${session.uniqueID}`);
        theState = new State(socket, session);
        console.log(`setSession`);
        console.log(`session`, session.time);
        console.log(`gTimer`, gTimer.elapsedTime);
//        console.log(`theState`, theState);
        console.log('stored time', getLocal('time'));
        gTimer.setTimer(session.time);
        summariseSession();
        updateView();
    };
    const checkSession = () => {
        const gid = getStoreID();
        const lid = localStorage.getItem(gid);
        if (Boolean(lid)) {
            gameflow(`continuing game ${lid}`, {style: 'ok'});
            if (newconnect) {
                gameflow(`You can choose to start a new game [confirm1]`);
                let reset = false;
                if (reset) {
                    clearSession();
                    return;
                }
                newconnect = false;
            }
            socket.emit('restoreSession', {
                uniqueID: lid
            }, (sesh) => {
//                console.log('restore callback:', sesh)
                if (typeof (sesh) === 'object') {
                    setSession(sesh, 'restored');
//                    session = sesh;
//                    gameflow(`game ${lid} restored (check console), game state: ${session.state}`);
//                    summariseSession();
                } else {
                    gameflow(`no game found with ID ${lid} [confirm2]`);
                }
            });
        } else {
            gameflow('no game in progress, start new game');
            socket.emit('newSession', sesh => {
                setSession(sesh, 'new');
//                session = sesh;
//                gameflow(`starting new game with ID ${session.uniqueID}`);
//                summariseSession();
                localStorage.setItem(gid, session.uniqueID);
//                console.log(session);
            });
        }
    };
    const clearSession = () => {
        const sId = getStoreID();
        const lid = localStorage.getItem(sId);
        //        console.log('clear');
        //        console.log(session);
        socket.emit('restoreSession', {
            uniqueID: lid
        }, (sesh) => {
            socket.emit('deleteSession', {
                uniqueID: sesh.uniqueID
            }, (boo) => {
                gameflow(`emit callback: ${boo}`);
                if (boo) {
                    localStorage.removeItem(sId);
                    window.location.reload();
                } else {
                    gameflow(`cannot delete game ${sId}`);
                }
            });
        });

    };
    const resetSession = () => {
//        gameTime.now = startTime;
        gTimer.resetTimer();
        theState.storeTime(gTimer.elapsedTime);
//        updateView();
    };
    const playPauseSession = () => {
        toggleTimer();
    };
    const packState = () => {
        const ps = JSON.stringify(tstate);
        updateSession('state', ps);
    };
    const unpackState = (str) => {
        state = JSON.parse(str);
    };
    const getStoredState = async () => {
        const hup = {
            uniqueID: session.uniqueID
        };
        socket.emit('getSession', hup, (s) => {
            console.log('we have the session', s)
        });
    };
    const updateSession = (p, v) => {
        session[p] = v;
        const hup = {
            uniqueID: session.uniqueID
        };
        hup[p] = v;
        socket.emit('updateSession', hup, (str) => {
            gameflow(`update complete: ${str}`);
        });
    };
    const diceRoll = () => {
        let numbers = Array.from({
            length: 6
        }, (_, i) => i + 1);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        return numbers[Math.floor(numbers.length * Math.random())];
    };

    // timing
    const gTimer = new GameTimer();
    const startTime = gTimer.getHourInMilli(5);
    const endTime = gTimer.getHourInMilli(18);
    const runTime = endTime - startTime;
    const gameHours = gTimer.getHoursFromMilli(runTime);
    const gameMinutes = gTimer.getMinutesFromMilli(runTime);
    const sessionMax = 70; /* total play time before game death in minutes */
    const tAdj = gameMinutes / sessionMax; /* factor by which time is speeded up */
    const formatTime = (ms) => {
        // Calculate hours, minutes, and seconds
//        console.log(ms);
        const hours = Math.floor(ms / 3600000); // 1 hour = 3600000 ms
        const minutes = Math.floor((ms % 3600000) / 60000); // 1 minute = 60000 ms
        const seconds = Math.floor((ms % 60000) / 1000); // 1 second = 1000 ms

        // Format each as a 2-digit string
        const hoursStr = String(hours).padStart(2, '0');
        const minutesStr = String(minutes).padStart(2, '0');
        const secondsStr = String(seconds).padStart(2, '0');

        // Concatenate to HH:MM:SS format
        return `${hoursStr}:${minutesStr}:${secondsStr}`;
    }
    const showtime = () => {
        const gtime = gTimer.elapsedTime;
        const adj = gtime * tAdj;
        if ((adj + startTime) >= endTime) {
            timeDisplay.html(formatTime(endTime));
            gTimer.pauseTimer();
            gameflow(`time's up`);
            theState.storeTime(endTime);
        } else {
//            storeLocal('time', (adj + startTime));
            storeLocal('time', gTimer.elapsedTime);
            timeDisplay.html(formatTime(adj + startTime));
        }
    };
    gTimer.updateDisplay = showtime;
    const toggleTimer = () => {
        if (gTimer.hasStarted) {
            if (gTimer.isRunning) {
                gTimer.pauseTimer();
                storeLocal('time', gTimer.elapsedTime);
                theState.storeTime(gTimer.elapsedTime);
                showtime();
            } else {
                gTimer.resumeTimer();
            }
        } else {
            if (gTimer.elapsedTime === 0) {
                gTimer.startTimer();
            } else {
                gTimer.resumeTimer();
            }
        }
    };

    // end timing
    sessionReset.on('click', resetSession);
    sessionPlayPause.on('click', playPauseSession);
    const onUnload = () => {
        snapshot();
        theState.storeTime(gTimer.elapsedTime);
    };
    window.onbeforeunload = onUnload;
    const init = () => {
        gameflow('script init');
        newconnect = true;
    };
    init();
});
