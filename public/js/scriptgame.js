document.addEventListener('DOMContentLoaded', function() {
//    return;
    const socket = io('', {
        query: {
            role: 'player'
        }
    });
    socket.on('disconnect', () => {
        gameflow('server connection lost - show warning');
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

    const confirmStartNew = () => {
        let startNew = false;
        startNew = confirm('would you like to start a new game?');
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

    const getStoreID = () => {
        return `${handshake}-id${getIdAdj()}`;
    };
    const gameflow = (msg) => {
        let act = false;
        if (msg.includes('[')) {
            act = msg.match(/\[(.*?)\]/g).map(match => match.slice(1, -1));
            msg = msg.replace(/\[.*?\]/g, '');

        }
        const newMsg = msg + (act ? `: ${act}` : '');
        msgs.push(newMsg);
        msgWin.html('');
        msgs.forEach(m => {
            msgWin.append(`<p>${m}</p>`);
        });
        if (typeof(program.confirms[act]) === 'function') {
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
    };
    const checkSession = () => {
        const gid = getStoreID();
        const lid = localStorage.getItem(gid);
        if (Boolean(lid)) {
            gameflow(`continuing game ${lid}`);
            if (newconnect) {
                gameflow(`You can choose to start a new game [confirm1]`);
                let reset = false;
//                reset = confirm('would you like to stop this session and create a new one?');
                if (reset) {
                    clearSession();
                    return;
                }
                newconnect = false;
            }
            socket.emit('restoreSession', {uniqueID: lid}, (sesh) => {
                console.log('restore callback:', sesh)
                if (typeof(sesh) === 'object') {
                    session = sesh;
                    gameflow(`game ${lid} restored (check console), game state: ${session.state}`);
                    summariseSession();
                    console.log(session);
                } else {
                    gameflow(`no game found with ID ${lid} [confirm2]`);
                }
            });
        } else {
            gameflow('no game in progress, start new game');
            socket.emit('newSession', sesh => {
                session = sesh;
                gameflow(`starting new game with ID ${session.uniqueID}`);
                summariseSession();
                localStorage.setItem(gid, session.uniqueID);
                console.log(session);
            });
        }
    };
    const clearSession = () => {
        const sId = getStoreID();
        const lid = localStorage.getItem(sId);
//        console.log('clear');
//        console.log(session);
        socket.emit('restoreSession', {uniqueID: lid}, (sesh) => {
            socket.emit('deleteSession', {uniqueID: sesh.uniqueID}, (boo) => {
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
    const updateSession = (p, v) => {
        session[p] = v;
        const hup = {uniqueID: session.uniqueID};
        hup[p] = v;
        socket.emit('updateSession', hup, (str) => {
            gameflow(`update complete: ${str}`);
        });
    };
    const D = 6;
    const diceRoll = () => {
        let numbers = Array.from({ length: 6 }, (_, i) => i + 1);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        return numbers[Math.floor(numbers.length * Math.random())];
    };
    const testDice = () => {
        const t = new Array(100).fill(0);
        t.forEach((id, i) => {t[i] = diceRoll()});
        for (var n = 1; n < (D + 1); n++) {
            console.log(n, t.filter(i => i === n).length);
        }
    }
    testDice();
    window.updateSession = updateSession;
    const init = () => {
        gameflow('script init');
        newconnect = true;
    };
    init();
});
