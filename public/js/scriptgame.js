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
            getData()
            checkSession();

        }, 1000);
    });

    const cheating = true;
//    const cheating = false;


    const msgWin = $('#msg');
    const msgs = [];
    const devLog = [];
    // common words
    const OX = 'oxygen';
    const SUS = 'sustenance';
    const RP = 'rope';

    const versionControl = new VersionControl();

    const sessionPlayPause = $('#b_playpause');
    const sessionReset = $('#b_reset');
    let timeDisplay = $('#time_display');

    // programmable event methods
    const confirmStartNew = () => {
        let startNew = false;
//        startNew = showConfirm('would you like to start a new game?');
        if (startNew) {
            startNew();
        }
    };
    const startNew = () => {
        clearSession();
        newconnect = false;
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
    //
    let handshake = null;
    let session = null;
    let newconnect = false;
    let theState = null;
    let gameData = null;
    let eventStack = null;
    let devController = null;
    let devTimer = null;
    let mArray = [];

    // bg gradient change
    const gradientStops = [
        [135, 206, 235], // Dawn Sky Blue (LightSkyBlue)
        [250, 214, 165], // Dawn Peach/Orange (Peach Puff)
        [255, 223, 91],  // Morning Yellow (Sunrise Yellow)
        [135, 206, 250], // Midday Bright Blue (Sky Blue)
        [70, 130, 180],  // Afternoon Deep Sky Blue (Steel Blue)
        [255, 165, 0],   // Sunset Orange (Orange)
        [255, 105, 180], // Dusk Pink (Hot Pink)
        [72, 61, 139]    // Twilight Deep Purple (DarkSlateBlue)
    ];
    const interpolateColor = (color1, color2, percentage) => {
        return color1.map((start, i) => Math.round(start + percentage * (color2[i] - start)));
    };
    const updateGradient = (value) => {

        value = value < 100 ? value : 100;
        console.log(value)
        const totalStops = gradientStops.length - 1; // Number of transitions
        const normalizedValue = value / 100; // Normalize between 0 and 1
        const rangeIndex = Math.floor(normalizedValue * totalStops); // Determine current range
        const rangePercentage = (normalizedValue * totalStops) - rangeIndex; // Percentage within the range

        // Get the two colors to interpolate
        const startColor = gradientStops[rangeIndex];
        const endColor = gradientStops[rangeIndex + 1];

        // Interpolate color
        const interpolatedColor = interpolateColor(startColor, endColor, rangePercentage);

        // Create CSS gradient
        const gradient = `linear-gradient(to right, rgb(${interpolatedColor.join(',')}), rgb(${interpolatedColor.join(',')}))`;
//            gradientBox.style.background = gradient;
        return gradient;
    }
    const colourBG = document.getElementById('temp');
    //

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
            if (q.includes('fake')) {
                a = `-${q.replace('?', '').split('&').filter(s => s.includes('fake'))[0].split('=')[1]}`;
            }
        }
        return a;
    };
    const getQueries = () => {
        let q = window.location.search;
        let o = {};
        if (q) {
            q = q.replace('?', '').split('&');
//            console.log(q);
            q.forEach((e, id) => {
//                const o = {};
                o[e.split('=')[0]] = procVal(e.split('=')[1])
//                q[i] = ob;
            });
        }
        return o;
    };
    const summariseSession = () => {
        gameflow(`your country is ${session.team.country}`);
//        console.log(session);
//        console.log(theState);
    };
    const getCurrentPage = () => {
        const hash = window.location.hash;
        let h = hash.replace('#', '');
        let v = null;
        const o = {val: null};
        if (h.includes('?')) {
            h = h.substring(0, hash.indexOf('?')).replace('?', '');
        }
        if (h.includes('_')) {
//            console.log('under');
            v = h.split('_')[1];
            h = h.split('_')[0];
            o.val = v;
        }
        o.page = h;
//        console.log(`h: ${h}`);
        return o;
    }
    const showOverlay = (msg, ob) => {
        const o = $('#overlay');
        const m = o.find('#msg');
        const b = o.find('button');
        const c = o.find('#close');
        m.html(msg);
        m.show();
        if (ob.hasOwnProperty('button')) {
            b.html(ob.button);
            b.show();
            b.off('click').on('click', () => {
                ob.action();
            });
        }
        c.off('click').on('click', hideOverlay);
        o.fadeIn();
    };
    const hideOverlay = () => {
        const o = $('#overlay');
        o.fadeOut();
    };
    const showAlert = (s) => {
//        alert(s);
    };
    const showConfirm = (s) => {
        let ok = confirm(s);
        ok = true;
        return ok;
    }

    // Methods called when event modals are launched
    // modal-specifics
    // try to always send in the modal as an arg - makes modal closing easier
    const injury1Setup = (m) => {
        const t = $('#treat');
        const l = $('#leave');
        const both = $('.treatleave');
        const die = $('.dieroll');
        const rollDisplay = $('#rollresult');
        const ev = eventStack.getCurrentEvent();
        const threshold = ev.metrics.threshold;
        let act = null;
        let results = null;
        both.off('click').on('click', function () {
            const die = $(this).parent().find('#die');
            die.show();
            both.addClass('disabled');
            both.prop('disabled', true);
            act = $(this).attr('id');
            results = ev.metrics[act];
        });
        die.off('click').on('click', () => {
            die.addClass('disabled');
            die.prop('disabled', true);
            const r = dieRoll();
            const a = results.results.map(e => e[r <= threshold ? 0 : 1]);
            rollDisplay.html(`you rolled a ${r}`);
            a.forEach((p, id) => {
                const prof = session[`profile${id}`];
                if (prof.currentStage === 1) {
                    const p1 = window.clone(prof);
                    prof.adjustProperty(ev.metrics.penalty, p, (r) => {
//                        console.log(`adjustment complete`, r);
                    });
                    prepProfilesForDisplay();
                    prof.calculateClimbRate();
                    devShowProfiles();
                }

            });
            completeEvent();
            if (m) {
                setupModalClose(m, true);
            }
        });
    };
    const resourcesGoneSetup = (m, ev) => {
        const d = $('.resupply');
        const b = $('.k2-modal-btn');
        const out = {};
        const prof = session[`profile${ev.profile}`];
        b.off('click').on('click', () => {
            d.find('input[type="checkbox"]').each((i, c) => {
//                out[$(c).attr('id')] = $(c).prop('checked');
                if ($(c).prop('checked')) {
//                    prof.resetProperty($(c).attr('id'));
                    prof.addResupply($(c).attr('id'));
                }
            });
            prof.setDelay(gameData.constants.resupplyDelay);

            closeModal({noevent: true});
        });
        d.find('input[type="checkbox"]').on('change', function () {
            let any = false;
//            console.log(`Checkbox ${this.id} checked: ${$(this).prop('checked')}`);
            d.find('input[type="checkbox"]').each((i, c) => {
                if ($(c).prop('checked')) {
                    any = true;
                }
            });
            if (any) {
                b.prop('disabled', false);
                b.removeClass('disabled');
            } else {
                b.prop('disabled', true);
                b.addClass('disabled');
            }
        });

    };
    // end modal-specifics
    const closeModal = (ob) => {
        const m = $('#overlay_modal');
        let isEventModal = m.find('.modal-event').length > 0;

        if (isEventModal) {
            if (ob) {
                if (ob.hasOwnProperty('noevent')) {
    //                isEventModal = !ob.noevent;

                } else {
                    completeEvent();
                }
            }

            playPauseSession();
        }
        removeFullscreenModalClick();
        m.removeClass('clickable');
        m.hide();
    };
    // note: unify the two methods below & kill one of them
    const setupCloseModal = (btn) => {
        // possibly removed -  monitor for time being
        console.warn('possible deprecated method');
        $(btn).off('click').on('click', () => {
            closeModal();
        })
    };
    const setupModalClose = (modal, boo) => {
//        console.log(`setupModalClose`, boo, modal);
        const closer = modal.find('.k2-modal-btn');
        if (!boo) {
            closer.addClass('disabled');
        } else {
            closer.removeClass('disabled');
        }
        closer.prop('disabled', !boo);
        closer.off('click').on('click', closeModal);
    };
    const showModalEvent = (ev) => {
//        console.log(`showModalEvent`);
//        console.log(ev);
        const m = $('#overlay_modal');
        m.show();
        m.addClass('clickable');
        renderTemplate('overlay_modal', `modal`, {type: 'event'}, () => {
            renderTemplate('modal_content', `modal/event/${ev.event}`, ev, () => {
//                console.log('render complete');
                if (devController) {
                    devController.setupGameTimeSelect();
                }
                const hasMethod = ev.hasOwnProperty('method');
//                console.log(`hasMethod: ${hasMethod}`);
                // event modals cannot be closed by clicking the overlay, they require user input before progression
                setupModalClose(m, !hasMethod);
                if (hasMethod) {
                    eval(ev.method)(m, ev);
                }
            })
        });
    };
    const removeFullscreenModalClick = () => {
        document.querySelector('#overlay_modal').removeEventListener('click', closeModal);
    }
    const setupFullscreenModalClick = () => {
        document.querySelector('#overlay_modal').addEventListener('click', closeModal);
        document.querySelector('.modal').addEventListener('click', (event) => {
            event.stopPropagation(); // Prevents the click event from bubbling up to the parent
        });
    };
    const showModal = (id, ob) => {
        const m = $('#overlay_modal');
        const o = ob ? ob : {};
        m.show();
        m.addClass('clickable');
        renderTemplate('overlay_modal', 'modal', {}, () => {
            renderTemplate('modal_content', id, o, () => {
//                console.log(`%cshowModal adds the click event`, 'color: yellow;');
                setupFullscreenModalClick();
                if (devController) {
                    devController.setupGameTimeSelect();
                }
                setupModalClose(m, true);
            })
        });
    };

    const storeLocal = (p, v) => {
        const id = `${getStoreID()}-${p}`;
//        console.log(`storing`, id, v);
        localStorage.setItem(id, v);
    };
    const getLocal = (p) => {
        const id = `${getStoreID()}-${p}`;
//        console.log(`getLocal: ${id}`);
        return localStorage.getItem(id);
    };
    const snapshot = () => {
        // store all required session data in local object for quick retrieval
//        storeLocal('time', session.time);
        storeLocal('time', gTimer.elapsedTime);
        console.log('this')
    };
    const clearSnapshot = () => {
        const kill = [];
        for (var i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const match = getStoreID();
//            console.log(k === match)
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
    const expandSession = () => {
        // on init, takes a session and expands various items
//        console.log(`expandSession: profile2 type: ${session.pr
//        if (session.profile2.constructor.name !== 'Climber') {
//            only run if profile2 not yet defined
            session.allProfiles = [];
            for (var i in session) {
                if (i.includes('profile')) {
                    if (session[i].profile !== null && session[i].hasOwnProperty('summary')) {
                        const o = {summaryString: session[i].summary};
                        session[i] = getClimber(o);
                        session.allProfiles.push(session[i]);
                    }
                }
            }
            buildSupportTeam();
//        }
    };
    const setSession = (sesh, type) => {
        // unified method for setting the session
        const i = setInterval(() => {
            if (gameData !== null) {
                session = sesh;
                gameflow(`session initialised (${type}) with ID ${session.uniqueID}`);
                theState = new State(socket, session);
                gTimer.setTimer(session.time);
//                console.log(`setSession`);
                expandSession();
                const initO = Object.assign({}, gameData);
                initO.session = session;
                eventStack = new EventStack(initO);
                summariseSession();
//                console.log(`current? ${versionControl.isCurrentVersion(session.uniqueID)}`);
                if (!versionControl.isCurrentVersion(session.uniqueID)) {
                    const rs = confirm(`There is a newer version of the software available, would you like to start a new session? You may experience unexpected results if you continue your current session.`);
                    if (rs) {
                        versionControl.updateVersion(session.uniqueID);
//                        debugger;
                        startNew();
                        return;
                    }
                }
//                console.log(3, JSON.parse(JSON.stringify(session)));
                initRender();
                updateView();
                clearInterval(i);
        //        console.log(`let's go: ${session.time}`);
        //        console.log('eventStack', eventStack);

        //        console.log(gameData);
        //        console.log(session);
            } else {
                console.log('waiting for data...')
            }
        }, 100);
    };
    const buildSupportTeam = () => {
        // sets up a support team for interations
        // support team is currently stored in the session object
        // the support team members need only be simple climber objects - no view required etc. And they need not be stored in locaslStorage/DB. Only supportTeamRef is stored

        if (!session.supportTeam.hasOwnProperty('climbers')) {
//            console.log('build support team', session.supportTeam);
//            console.log(session.supportTeam);
            session.supportTeam.climbers = {};
            const P = session.supportTeam.profiles;
            Object.keys(P).forEach(p => {
                const ob = {
                    profile: window.justNumber(p),
                    type: -9999,
                    team: session.supportTeam,
                    teamID: session.supportTeam.id,
                    gameData: gameData
                };
//                console.log(ob);
                session.supportTeam.climbers[p] = new Climber(ob);
            });
        }
    };
    // Main init method:
    const checkSession = () => {
//        console.log(`checkSession, newconnect? ${newconnect}`);
        showOverlay(`Would you like to start a new game?`, {button: 'yes', action: startNew});
        const gid = getStoreID();
        const lid = localStorage.getItem(gid);
        if (Boolean(lid)) {
            gameflow(`continuing game ${lid}`, {style: 'ok'});
            gameflow(`newconnect? ${newconnect}`)
            if (newconnect) {
                gameflow(`You can choose to start a new game [confirm1]`);
                showOverlay(`Would you like to start a new game?`, {button: 'yes', action: startNew});
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
                if (typeof (sesh) === 'object') {
                    setSession(sesh, 'restored');
                } else {
                    gameflow(`no game found with ID ${lid} [confirm2]`);
                }
            });
        } else {
            gameflow('no game in progress, start new game');
            socket.emit('newSession', sesh => {
                setSession(sesh, 'new');
                const i = setInterval(() => {
                    if (gameData !== null) {
                        clearInterval(i);
                        console.log('creating three blank team members');
//                        debugger;
                        setTeamMember(0, -1);
                        setTeamMember(1, -1);
                        setTeamMember(2, -1);
                        setNewEventArray();
                        localStorage.setItem(gid, session.uniqueID);
                    }
                }, 2000);


                setTimeout(() => {
                    // delay required to allow for async retrieval of gameData
                    if (gameData.isDev) {
                        // show a modal allowing a new game time to be set
//                        showModal('dev.initsetup', gameData);
                    }
                }, 500);
            });
        }
    };
    const clearSession = () => {
        const sId = getStoreID();
        const lid = localStorage.getItem(sId);
        socket.emit('restoreSession', {
            uniqueID: lid
        }, (sesh) => {
            socket.emit('deleteSession', {
                uniqueID: sesh.uniqueID
            }, (boo) => {
                gameflow(`emit callback: ${boo}`);
                if (boo) {

                    localStorage.removeItem(sId);
                    localStorage.clear();
                    window.location.hash = 'home';
                    delete session.profile0;
                    delete session.profile1;
                    delete session.profile2;
                    session.allProfiles = [];
                    const cs = getCurrentState();
//                    console.log(`calling zeroAll`, cs)
                    Climber.zeroAll(cs);
//                    showSession();
//                    showProfiles();
//                    debugger;
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
        eventStack.initSessionEvents(0);
        const e = eventStack.resetEvents();
        updateSession('events', e);
        resetClimbers();
        devShowProfiles();
    };
    const showSession = () => {
        console.log(session);
    };
    const getSession = () => {
        return session;
    }
    const getSessionID = () => {
        return session ? session.uniqueID : null;
    }
    const getProfiles = () => {
        const p = Object.entries(session).filter(s => s[0].includes('profile')).map(([_, value]) => value);
        return p;
    };
    const showProfiles = () => {
        const p = getProfiles();
//        console.log(p);
        p.forEach(pf => console.log(pf));
    };
    const playPauseSession = () => {
        toggleTimer();
    };
    const pauseSession = () => {
        if (gTimer.hasStarted) {
            if (gTimer.isRunning) {
                gTimer.pauseTimer();
                storeLocal('time', gTimer.elapsedTime);
                theState.storeTime(gTimer.elapsedTime);
                showtime();
            }
        }
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

    const updateSession = (p, v, cb) => {
//        console.log(`updateSession`);
//        console.log('session1', JSON.parse(JSON.stringify(session)));
//        console.log(`updateSession`, p, v);
        session[p] = v;
//        console.log('session2', JSON.parse(JSON.stringify(session)));
        expandSession();
//        console.log('session3', JSON.parse(JSON.stringify(session)));
//        gameflow(`session updated (${p})`);
        const hup = {
            uniqueID: session.uniqueID
        };
        hup[p] = v;
//        console.log(hup);
        socket.emit('updateSession', hup, (str) => {
            gameflow(`update complete: (${p} set to ${JSON.stringify(v)})`);
            if (cb) {
                cb(str);
            }
        });
    };

    const getCurrentState = () => {
        // creates an object which can be used to update the view at a given point in the timeline - use tAdj to convert real time to game time
        const sec = roundNumber((gTimer.elapsedTime * tAdj) / 1000, 2);
        const min = roundNumber((gTimer.elapsedTime * tAdj) / 60000, 2);
        const realtime = {
            ms: gTimer.elapsedTime,
            s: gTimer.elapsedTime / 1000,
            m: gTimer.elapsedTime / 60000,
        }
        // sessiontime is realtime adjusted for testing, i.e. simulates the 70 minute game regardless of sessionMax
        const sessiontime = {
            m: realtime.m * (70 / sessionMax),
            s: (realtime.s * (70 / sessionMax))
        }
        const gametime = {
            s: sec,
            m: min
        }
//        console.log(`min: ${min}, sec: ${sec}`);
        const cs = {
            sec: sec,
            min: min,
            realtime: realtime,
            sessiontime: sessiontime,
            gametime: gametime,
            gametimeDisplay: formatTime((gTimer.elapsedTime * tAdj) + startTime)};
//        console.log(cs);
        return cs;
    };
    const dieRoll = () => {
        let numbers = Array.from({
            length: 6
        }, (_, i) => i + 1);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        numbers = numbers.sort(() => Math.random() - 0.5);
        return numbers[Math.floor(numbers.length * Math.random())];
    };
    const setupDieRoll = (btn) => {
        return;
        const b = $(btn);
        b.off('click').on('click', () => {
            console.log(dieRoll());
        });
    };


    const processData = (d) => {
        if (d) {
            d.route.stages = [];
            const s = d.route.stages;
            const r = d.route.ratio;
            if (r[0] + r[1] !== 100) {
                console.warn(`the values of route.ratio must add up to 100`);
            }
            s[0] = 0;
            s[1] = 50 / (r[0] + r[1]) * r[0];
            s[2] = 50
            s[3] = 50 + (50 / (r[0] + r[1]) * r[1]);
            s[4] = 100;

            d.storeID = getStoreID();
            d.timer = gTimer;
//            console.log(d.route.stages);
            return d;
        }
    };
    const getData = () => {
        socket.emit('getGameData', (d) => {
//            console.log(`game data ready`);

            gameData = processData(d);
//            console.log(d)
//            console.log(gameData)
            const qTime = getQueries().gtime;
            const gTime = Boolean(qTime) ? qTime : gameData.gameTime;
            setSessionMax(gTime);
            set_tAdj();
//            const initO = Object.assign({}, gameData);
//            initO.session = session;
//            eventStack = new EventStack(initO);
            if (gameData.isDev) {
                devController = new DevController(gameData);
                devController.setSessionMax = setSessionMax;
            }
        });
    };
    const showData = () => {
        console.log(gameData);
    };
    // teams

    const checkCompletion = () => {
        const c = Climber.getClimbers();
        const cf = Climber.getClimbers().filter(p => p.finished);
        const cu = Climber.getClimbers().filter(p => !p.finished);
        const co = {finished: cf, notFinished: cu, allFinished: c.length === cf.length};
        return co;
    };
    const climberUpdate = (c, temp) => {
        // event to be called from Climber class
        devShowProfiles();
        if (c.finished) {
            const allFinished = checkCompletion().allFinished;
            if (allFinished) {
                gTimer.pauseTimer();
            }
        }
    };
    const resetClimbers = () => {
//        console.log(`resetClimbers`);
//        console.log(getCurrentState());
        const cs = getCurrentState();
        Climber.resetAll(cs);
        updateClimbers(cs);
    };
    const updateClimbers = (cs) => {
        Climber.updateViews(cs);
    };
    const clearTeamMember = (p, cb) => {
        const id = `profile${p}`;
        if (session.hasOwnProperty(id)) {
            session[id] = {};
            updateSession(id, {profile: null}, () => {
                if (cb) {
                    cb();
                }
            })
        } else {
            console.warn(`no profile profile${p}`);
        }
    };
    const clearTeam = () => {
        const kill = [];
        for (var i in session) {
            if (i.includes('profile')) {
                kill.push(justNumber(i));
            }
        }
        kill.forEach(p => {
            clearTeamMember(p);
        })
        console.log(kill);
    };
    const getClimber = (o) => {
        // getClimber returns a new Climber instance
        // Requires an object as arg
        // Add the game data to all instances
        if (gameData) {
            o.gameData = JSON.parse(JSON.stringify(gameData));
            o.team = JSON.parse(JSON.stringify(session.team));
            o.teamID = o.team.id;
//            console.log(`create Climber from object`);
            const c = new Climber(o);
            c.setView($('.map-pointer-container'));
            return c;
        } else {
            return {summary: o.summaryString};
        }
    };
    const setTeamMember = (profile, type) => {
//        console.log(`setTeamMember, ${profile}, ${type}`);
        let tm = false;
        if (session[`profile${profile}`]) {
                if (session[`profile${profile}`].profile === null || $.isEmptyObject(session[`profile${profile}`].profile)) {
                    const gtm = getTeamMember(profile, type);
                    const fullProfile = Object.assign(getTeamMember(profile, type), {profile: profile, type: type});
                    const p = getClimber(fullProfile);
                    tm = {summary: p.getStorageSummary()};
                    if (Boolean(tm)) {
                        updateSession(`profile${profile}`, tm, (r) => {
                            if (Climber.getClimbers().length === 3) {
                                gameflow(`you can now use renderMap`)
                            }
                        });
                    } else {
                        console.warn('no tm object, profile will not be stored');
                    }
                } else {
                    console.want('will not create profile, possible blank profile');
                }
//            }
        }
        if (!tm) {
            console.warn('cannot overwrite established team member (to force, use overwriteTeamMember instead)');
        }
//        console.log(tm);
        return tm;
    };
    const setMemberType = (p, t) => {
        const m = session[`profile${p}`];
        if (!m) {
            console.warn(`profile${p} does not exist`);
        } else {
            const o = m.options;
            const l = o.length;
            if (t < l && t > -1) {
                m.setType(t, (rp) => {
                    session[`profile${p}`] = rp;
                    tm = {summary: m.getStorageSummary()};
                    updateSession(`profile${m.profile}`, tm, (r) => {
                        //
                    });
                });
            } else {
                console.warn(`profile${p} has ${l} possible options`);
            }
        }
    };
//    window.setMemberType = setMemberType;
    const getTeamMember = (profile, type) => {
        const P = gameData.profiles;
        const p = `profile_${profile}`;
        const t = `type_${type}`;
        const l = Object.entries(P).length;
        let r = {};
        if (profile < l) {
            if (P[p].hasOwnProperty(t)) {
                r = P[p][t];
            } else {
//                console.warn(`profile ${profile} has only ${Object.entries(P[p]).length} types`);
            }
        } else {
            console.warn(`there are only ${l} profiles`);
        }
        return r;
    };
    const overwriteTeamMember = (p, t) => {
        clearTeamMember(p, () => {
            setTeamMember(p, t);
        });

    };
    const climbersReady = () => {
        const cl = Climber.getClimbers().filter(c => c.type === -1);
        const r = cl.length === 0;
//        console.log(Climber.getClimbers().filter(c => c.type === -1));
        if (!r) {
//            console.log(`Climbers not ready: ${cl.length}`);
        }
        return r;
    };
    // timing
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
    const addTimesToData = () => {
        if (gameData) {
            gameData.timings = {};
            gameData.timings.startTime = formatTime(startTime);
            gameData.timings.endTime = formatTime(endTime);
            gameData.timings.runTime = runTime;
            gameData.timings.hours = gameHours;
            gameData.timings.minutes = gameMinutes;
//            console.log(gameData.timings);
        } else {
            // gameData isn't ready yet - but it will be soon
            setTimeout(addTimesToData, 100);
        }
    }
    const gTimer = new GameTimer();
    const startTime = gTimer.getHourInMilli(5);
    const endTime = gTimer.getHourInMilli(12);
    const runTime = endTime - startTime;
    const gameHours = gTimer.getHoursFromMilli(runTime);
    const gameMinutes = gTimer.getMinutesFromMilli(runTime);
//    console.log(`startTime: ${formatTime(startTime)}, endTime: ${formatTime(endTime)}, runTime: ${gameHours} hours (${gameMinutes} minutes)`);
    addTimesToData();
    let sessionMax = null; /* total play time before game death in minutes. Set via gameData on startup */
    const setSessionMax = (n) => {
        if (gameData) {
            sessionMax = parseInt(n);
            gameData.gameTime = sessionMax;
        } else {
            console.warn(`setSessionMax failed: gameData not ready`);
        }
    };
    const set_tAdj = () => {
        tAdj = gTimer.getMinutesFromMilli(runTime) / sessionMax;
//        console.log(`tAdj: ${tAdj}`);
    };
    //let tAdj = gameMinutes / sessionMax; /* factor by which time is speeded up */
    let tAdj = null; /* factor by which time is speeded up */
//    console.log(`tAdj = ${tAdj}`);

    const showtime = () => {
        const gtime = gTimer.elapsedTime;
        const adj = gtime * tAdj;
        if ((adj + startTime) >= endTime) {
            timeDisplay.html(formatTime(endTime));
            gTimer.pauseTimer();
            gameflow(`time's up`);
//            console.log(`time's up`);
            theState.storeTime(endTime);
            const cs = checkCompletion();
            if (!cs.allFinished) {
                const dead = cs.notFinished.map(c => c.name);
                console.log(`dead climbers: ${dead}`);
                Climber.onTimeout();
            }
        } else {
//            storeLocal('time', gTimer.elapsedTime);
//            console.log('poo');
            timeDisplay.html(formatTime(adj + startTime));
            if (colourBG) {
                colourBG.style.background = updateGradient((adj/runTime) * 100);
            }
        }
    };
    const storageUpdater = () => {
        // hooked to timer class
        Climber.storeSummaries();
        storeLocal('time', gTimer.elapsedTime);
    };
    const updateDisplay = () => {
        const cs = getCurrentState();
        updateClimbers(cs);
        updateEventStack(cs);
        if (devTimer) {
            devTimer.updateTime(cs);
        }
        showtime();
    };
    const updateDisplayV1 = () => {
        const cs = getCurrentState();
        mArray.push(cs.sessiontime.m);
        if (mArray.length > 1) {
            const l = mArray.length;
            if (Math.ceil(mArray[l - 1]) !== Math.ceil(mArray[l - 2])) {
//                console.log(`minute changes to ${Math.round(cs.sessiontime.m)}`);
            }
        }
        updateClimbers(cs);
//        console.log(`call updateEventStack`);
        updateEventStack(cs);

        if (devTimer) {
            devTimer.updateTime(cs);
        }
        showtime();
    };

    // key page setup
    const setupHome = () => {
        const bClimb = $(`#btn-start`);
        const bTeam = $(`#btn-team`);
        const bResources = $(`#btn-resources`);
        const all = [bClimb, bTeam, bResources];
        const cReady = climbersReady();
//        console.log(cReady, `cReady`)
        if (!cReady) {
            bClimb.addClass('disabled');
            bClimb.prop('disabled', true);
        }
        if (cReady) {
            bClimb.off('click').on('click', () => {
                renderMap();
            });
        }
        bTeam.off('click').on('click', () => {
            renderTeam();
        });
        bResources.off('click').on('click', () => {
            renderResources();
        });
    };

    // controls (page types)
    const onSubmitResouces = (p, ob) => {
        const t = p.temptype;
        const o = ob.o;
        const s = ob.s;
        const r = ob.r;
        p.setOxygen(o, (rp) => {
            p.setSustenance(s, (rp) => {
                session[`profile${p.profile}`] = rp;
                p.setRope(r, (rp) => {
                    session[`profile${p.profile}`] = rp;
                    setMemberType(p.profile, t);
                    setupResources();
                });
            });
        });
    };
    const submitResources = (p) => {
        const o = isNaN(parseInt($('#oxygen').val())) ? 0 : parseInt($('#oxygen').val());
        const s = isNaN(parseInt($('#sustenance').val())) ? 0 : parseInt($('#sustenance').val());
        const r = isNaN(parseInt($('#rope').val())) ? 0 : parseInt($('#rope').val());
        //
//        console.log(`submitResources`);
//        console.log(o, s, r);
//        console.log(p);
        const uo = {o: o, s: s, r: r};
        onSubmitResouces(p, uo);
        return;
        //
        /*
        const t = p.temptype;
        p.setOxygen(o, (rp) => {
            p.setSustenance(s, (rp) => {
                session[`profile${p.profile}`] = rp;
                p.setRope(r, (rp) => {
                    session[`profile${p.profile}`] = rp;
                    setMemberType(p.profile, t);
                    setupResources();
                });
            });
        });
        */
    };
    const calculateLoad = () => {
        const co = gameData.constants.oxygen;
        const cs = gameData.constants.sustenance;
        const P = session[$('.form-submit-btn').data('profile')];
        const op = P.options;
        const t = P.type > -1 ? P.type : P.temptype;
        const o = op[t];
        const time = (o.t1 + o.t2) * 2;
        const load = (Math.ceil(time / co.unitTime) * co.weight) + (Math.ceil(time / cs.unitTime) * cs.weight);
//        console.log(`${load}kg`);
        return load;
    };
    // inputs for ox, sus & rope AFTER option selected
    const setupResourceExtras = (boo) => {
        const nin = $('input[type=number]');
        const adj = $(`.adjust_btn`);
        const remain = parseFloat($('#resource_remaining').find('div').length > 0 ? $('#resource_remaining').find('div').html() : $('#resource_remaining').html());
        const c = gameData.constants;
        const p = session[$('.form-submit-btn').data('profile')];
        nin.prop('disabled', !boo);
        if (boo) {
            const max = p.options[p.temptype].capacity;
            nin.each(function (n, i) {
                const nn = parseFloat($(i).val());
                $(i).val(isNaN(nn) ? 0 : nn);
            });
            nin.off('input').on('input', function () {
                if ($(this).val() < 0) {
                    $(this).val(0);
                }
                let T = 0;
                nin.each(function (n, i) {
                    const e = $(i);
                    const id = e.attr('id');
                    const v = isNaN(parseFloat(e.val())) ? 0 : parseFloat(e.val());
                    const w = c[id].weight;
                    const t = v * w;
                    p[id] = v;
                    T += t;
                });
                const l = calculateLoad();
                const drt = $('#resource_total');
                const drr = $('#resource_remaining');
                drt.html(showDyno(T + l));
                drr.html(showDyno(max - (T + l)));
                max - (T + l) < 0 ? drr.addClass('wrong') : drr.removeClass('wrong');
                resOptionselect(p.profile, p.temptype);
            });
            adj.off('click').on('click', function () {
                const i = $(this).parent().find('input');
                const a = $(this).attr('class').includes('plus') ? 1 : -1;
                let n = parseFloat(i.val()) + a;
                n = n < 0 ? 0 : n;
                const v = i.attr('id');
                updateProfile(p, v, n);
                updateResourceView(p);
            });
        }
    };
    const setupResources = async () => {
        const sub = $('.form-submit-btn');
        const p = session[sub.data('profile')];
        setupResourceExtras(false);
        if (p.type > -1) {
            sub.prop('disabled', true);
            sub.addClass('disabled');
            $('.adjust_btn').addClass('disabled');
            $('.resop').addClass('disabled');
            $('.resop').removeClass('abled');
            $('input').prop('disabled', true);
            $('#oxygen').val(p.oxygen);
            $('#sustenance').val(p.sustenance);
            $('#rope').val(p.rope);
            updateResImg(p.profile, p.type);
            updateResourceView(p);
        } else {
            sub.prop('disabled', false);
            sub.removeClass('disabled');
            $('.resop').removeClass('disabled');
            $('.resop').addClass('abled');
            $('.adjust_btn').addClass('disabled');
            sub.off('click').on('click', function (ev) {
                ev.preventDefault();

                if ($('#resource_remaining').html().includes('-')) {
                    showAlert(`${p.name} is ${Math.abs(getWeight(p).remaining)}kg over capacity, please adjust resources`);
                } else {
                    const inputValues = $('input[type="text"]').map((_, el) => parseInt($(el).val())).get();
                    const zeroValues = inputValues.filter(v => v === 0);
                    if (p.temptype < 0) {
                        // no profile selected
                        showAlert('you must pick an Option')
                    } else {
                        const r = $('#resource_remaining').find('div').length > 0 ? $('#resource_remaining').find('div').html() : $('#resource_remaining').html();
                        if (zeroValues.length > 1) {
                            if (parseFloat(r) > 0) {
                                const ok = showConfirm(`You have ${r}kg of remaining capacity and have not allocated any extra resources, are you sure you want to continue? You will not be able to change your mind later.`);
                                if (ok) {
                                    submitResources(p);
                                }
                            }
                        } else if (getWeight(p).remaining > 0) {
                            const m = `${p.name} has ${getWeight(p).remaining}kg unused carrying capacity, are you sure you don't want to use it? You will not be able to change your mind later.`;
                            const ok = showConfirm(m);
                            if (ok) {
                                submitResources(p);
                            }
                        } else {
                            const m1 = 'Are you sure these are the values you want to set? You will not be able to change your mind later.';
                            const m2 = `${p.name} is carrying fewer resources than necessary for the expedition and will need to resupply later. If you are happy with this, please continue.`;
                            const req = getRequirement(p);
                            const m = p.oxygen < req.oxygen || p.sustenance < req.sustenance ? m2 : m1;
                            const ok = showConfirm(m);
                            if (ok) {
                                submitResources(p);
                            }
                        }
                    }
                }
            });
        }
    };
    // rendering
    const updateAddress = (s) => {
        window.location.hash = s;
    };
    const prepareAndRenderMap = () => {
        Climber.getRouteMap(() => {
            const i = setInterval(() => {
                if (Climber.getClimbers().length === 3) {
                    clearInterval(i);
                    renderMap();
                } else {
//                    console.log('not enough climbers')
                }
            }, 1000);
        });
    };
    const setupBackButton = (button) => {
//        console.log('set up a back')
        $(button).on("click", () => {
            renderHome();
        });
    }
    const resChangeProfile = (button) => {
//        console.log('set up res');
        $(button).off('click').on('click', function() {
//            console.log('res')
            const detail = $(this).attr('id').split('_');
            const fac = parseInt(detail[1]);
            const curr = parseInt(detail[2]);
            const c = Climber.getClimbers().length - 1;
            let adj = curr + fac;
            adj = adj < 0 ? c : adj;
            adj = adj > c ? 0 : adj;
//            console.log(`adj: ${adj}`);
            renderResources(adj);
        });
    };
    const updateResImg = (p, t) => {
        const img = $('.summit-graphic');
        const P = getAlph(p).toUpperCase()
        const T = getAlph(t).toUpperCase();
        const src = `assets/profiles/ProfileImages_Profile${P}-${T}.png`
//        console.log('src', src);
        img.attr('src', src);
    };
    const showDyno = (s) => {
        return `<div class='dyno'>${s}</div>`;
    };
    // make a change to a property of the current profile (does not make changes permanent)
    const updateProfile = (p, prop, val) => {
        const prof = typeof(p) === 'string' || typeof(p) === 'number' ? session[`profile${p}`] : p;
        prof[prop] = val;

//        console.log(`updateProfile p ${p}: ${prof.name} ${prop} set to ${prof[prop]}`);
//        console.log(p);
    };
    // On Option tile click, calculate requisites
    const resOptionselect = (profile, type) => {
//        console.log(`resOptionselect, ${profile}, ${type}`)
        const c = gameData.constants;
        const p = session[`profile${profile}`];
        const pn = parseInt(profile);
        const tn = parseInt(type);
        p.temptype = tn;
        updateResImg(pn, tn);
        const req = getRequirement(p);
        const o = p.options[tn];
        const t_oxygen = req.oxygen;
        const w_oxygen = t_oxygen * c.oxygen.weight;
        const t_sustenance = req.sustenance;
        const w_sustenance = t_sustenance * c.sustenance.weight;
        const w_total = w_oxygen + w_sustenance;
        const w_remain = o.capacity - w_total;
        // update the profile
        updateProfile(profile, 'oxygen', t_oxygen);
        updateProfile(profile, 'sustenance', t_sustenance);
        updateResourceView(profile);
        setupResourceExtras(true);
        $('.adjust_btn').removeClass('disabled');
        resOptionOnClick(profile, type);
    };
    // calculate weight (total & remaining) from profile
    const getWeight = (p) => {
        const w = {};
        const c = gameData.constants;
        const t = p.type < 0 ? p.temptype : p.type;
        w.total = p[OX] * c[OX].weight;
        w.total += p[SUS] * c[SUS].weight;
        w.total += p[RP] * c[RP].weight;
        w.remaining = p.options[t].capacity - w.total;
        return w;
    };
    // calculate required resources to complete expedition:
    const getRequirement = (prof) => {
        const p = typeof(prof) === 'string' || typeof(prof) === 'number' ? session[`profile${prof}`] : prof;
        const t = p.type > -1 ? p.type : p.temptype;
        const o = p.options[t];
        const time = (o.t1 + o.t2) * 2;
        const r = {oxygen: 0, sustenance: 0};
        r.oxygen = Math.ceil(time / gameData.constants.oxygen.unitTime);
        r.sustenance = Math.ceil(time / gameData.constants.sustenance.unitTime);
        r.rope = 0;
        return r;
    };
    // update the resource screen with data from current profile:
    const updateResourceView = (profile) => {
        // method can take a profile identifier or full profile as arg
        const p = typeof(profile) === 'string' || typeof(profile) === 'number' ? session[`profile${profile}`] : profile;
        const w = getWeight(p);
        const req = getRequirement(p);
        const cOx = gameData.constants[OX];
        const cSus = gameData.constants[SUS];
        const cRp = gameData.constants[RP];
//        console.log(req);
//        console.log(req[OX]);
        //
        const dot = $(`#total_${OX}`);
        const dow = $(`#weight_${OX}`);
        //
        const dst = $(`#total_${SUS}`);
        const dsw = $(`#weight_${SUS}`);
        //
        const drt = $(`#total_${RP}`);
        const drw = $(`#weight_${RP}`);
        //
        const dt = $(`#resource_total`);
        const dr = $(`#resource_remaining`);
        //
        // inputs
        const doi = $(`#${OX}`);
        const dsi = $(`#${SUS}`);
        const dri = $(`#${RP}`);
        //
        dot.html(showDyno(`${req[OX]} (${p[OX]})`));
        dow.html(showDyno(`${req[OX] * cOx.weight}kg (${p[OX] * cOx.weight}kg)`));
        //
        dst.html(showDyno(`${req[SUS]} (${p[SUS]})`));
        dsw.html(showDyno(`${req[SUS] * cSus.weight}kg (${p[SUS] * cSus.weight}kg)`));
        //
        drt.html(showDyno(`${req[RP]} (${p[RP]})`));
        drw.html(showDyno(`${req[RP] * cRp.weight}kg (${p[RP] * cRp.weight}kg)`));
        //
        dt.html(showDyno(`${w.total}kg`));
        dr.html(showDyno(`${w.remaining}kg`));
        // input elements
        doi.prop('value', p[OX]);
        dsi.prop('value', p[SUS]);
        dri.prop('value', p[RP]);
        //
        w.remaining < 0 ? dr.addClass('wrong') : dr.removeClass('wrong');
    };
    // Option tile click:
    const resOptionSetup = (button) => {
        $(button).off('click').on('click', function () {
            const disabled = $(this).attr('class').includes('disabled');
            const id = $(this).attr('id').split('_');
            const p = session[`profile${id[1]}`];
            if (!disabled) {

                resOptionselect(id[1], id[2]);
//                return;
//                $('.resop').removeClass('selected');
//                $(this).addClass('selected');
//                setTimeout(() => {
//                    if ($('#resource_remaining').html().includes('-')) {
//                        // negative resource remaining
//                        showAlert(`${p.name} is ${Math.abs(getWeight(p).remaining)}kg over capacity, please adjust the load.`);
//                    }
//                }, 100);
            }
        })
    };
    const resOptionOnClick = (prof, id) => {
//        console.log(`${prof}, ${id} has been clicked`);
        const tile = $(`#resop_${prof}_${id}`);
        const p = session[`profile${prof}`];
        const many = $(`[id^='resop_${prof}_']`);
        many.removeClass('selected');
        tile.addClass('selected');
//        $('.resop').removeClass('selected');
        setTimeout(() => {
            if ($('#resource_remaining').html().includes('-')) {
                // negative resource remaining
                showAlert(`${p.name} is ${Math.abs(getWeight(p).remaining)}kg over capacity, please adjust the load.`);
            }
        }, 100);
    };
    const renderResources = (n) => {
        renderNone(() => {
            const p = `profile${n === undefined || n === null? 0 : n}`;
            const rOb = session[p];
//            console.log(rOb);
            renderTemplate('theatre', 'resources', rOb, () => {
                updateAddress('resources');
                $(`#resop_${rOb.profile}_${rOb.type}`).addClass('selected');
                setupResources();

                if (cheating) {
                    const c = gameData.constants;
                    const ch =[0, 0, 3];
                    resOptionselect(0, ch[0]);
                    resOptionselect(1, ch[1]);
                    resOptionselect(2, ch[2]);
                    const pf = getProfiles();
                    pf.forEach((p, i) => {
//                        console.log(p);
                        const total = (p.oxygen * c.oxygen.weight) + (p.sustenance * c.sustenance.weight) + (p.rope * c.rope.weight);
                        const over = p.options[ch[i]].capacity - total;
                        if (over < 0) {
                            const redOx = Math.ceil(Math.abs(over) / c.oxygen.weight);
                            const newOx = p.oxygen - redOx;
                            updateProfile(i, 'oxygen', newOx);
                            updateResourceView(i);
                        }
                        const uo = {o: p.oxygen, s: p.sustenance, r: p.rope};
                        onSubmitResouces(p, uo);
                    });
                }
            })
        });
    };
    const renderTeam = () => {
//        console.log(`renderTeam`);
        renderNone(() => {
            const rOb = {profiles: Climber.getClimbers()}
//            console.log(rOb);
            renderTemplate('theatre', 'team', rOb, () => {
                updateAddress('team');
            })
        });
    };
    // Events
    const setNewEventArray = () => {
//        console.log(`setNewEventArray called`);
        if (session && gameData) {
            session.events = new Array(gameData.events.length).fill(0);
//            console.log('SUCCESS');
//            console.log('new event array:');
//            console.log(session.events);
            updateSession('events', session.events);
            eventStack.setEventSummary(session.events);
        } else {
            console.warn(`failure to init, session or gameDatathis.eventSummary not ready yet`);
        }
    };
    const eventTrigger = (ev) => {
        // EventStack calls this method when a new event is to be triggered
//        console.log(ev);
        if (!ev.active) {
            return;
        }
        pauseSession();
        if (ev.hasOwnProperty('profiles')) {
            // NOTE: the event model CAN send in  any number of profiles, the line below assumes only a single profile, edit if events effect multiple profiles
            ev.theProfile = session[`profile${ev.profiles[0]}`];
        }
//        console.log(`event`, ev);
        if (ev.hasOwnProperty('delay')) {
            ev.profiles.forEach(p => {
//                console.log(p, session[`profile${p}`])
                session[`profile${p}`].setDelay(ev.delay);
            });
        }
        showModalEvent(ev);
    };
    const updateEventStack = (cs) => {
//        console.log(`updateEventStack`);
        const ev = eventStack.updateTime(cs, eventTrigger);
        if (ev) {
            const evSumm = eventStack.updateSummary(ev, 1);
            updateSession('events', evSumm);
//            console.log(evSumm);
        }
    };
    const completeEvent = () => {
        const ev = eventStack.getCurrentEvent();
        const evSumm = eventStack.updateSummary(ev, 2);
        updateSession('events', evSumm);
//        console.log(evSumm);
    };
    const showEvents = () => {
        eventStack.getEvents().forEach(e => console.log(e));
        console.log('#######################');
        session.events.forEach(e => console.log(e));
    };
    const climberDepletionEvent = (ob) => {
        const rem = Math.ceil(ob[ob.resource]);
//        console.log(`depletion of ${ob.resource} for ${ob.name}, remaining: ${rem}`);
        devShowProfiles();
        if (rem === 0) {
            gTimer.pauseTimer();
//            alert(`${ob.name} has run out of ${ob.resource}`);
            const o = Object.assign(ob, {event: 'resource_gone', method: 'resourcesGoneSetup'});
//            console.log(o);
//            socket.emit('writeJsonFile', '', 'testobject', o);
            showModalEvent(o);
        }
    };
    const testDep = () => {
        const data = Object.assign(Climber.getClimbers()[0], {oxygen: 0, resource: 'oxygen', event: 'resource_gone', method: 'resourcesGoneSetup'});
        climberDepletionEvent(data);
//        return;
//        $.getJSON('testobject_20250115-102930.json', function(data) {
//            climberDepletionEvent(data);
//        })
    };
    window.testDep = testDep;
//    setTimeout(testDep, 2000);

    //
    const prepProfilesForDisplay = () => {
        let p = Object.entries(session).filter(e => e[0].includes('profile')).map(e => e[1]);
        p.forEach(e => {
            const cs = e.currentStage;
            e.isT1 = cs === 1 || cs === 4 ? 'bolded' : '';
            e.isT2 = cs === 2 || cs === 3 ? 'bolded' : '';
            e.currentSpeedShort = roundNumber(e.currentSpeed, 5);
            e.delayShort = roundNumber(e.delayRemaining, 5);
            e.tNow = e[`t${e.currentStage}`];
            e.quantumOxygen = Math.ceil(e.oxygen);
            e.quantumSustenance = Math.ceil(e.sustenance);
            e.quantumRope = Math.ceil(e.rope);
            e.delayRemainingRounded = window.roundNumber(e.delayRemaining, 3)
        });
        return p;
    };
    const devShowProfiles = () => {
        const p = prepProfilesForDisplay();
        const pd = $('.map-pointer-label');
        renderTemplateWithStyle('profilepanel', 'dev.profile.panel', p, () => {
//                    console.log('profiles rendered');
        });
//        console.log(p);
//        console.log(pd);
        pd.each((i, d) => {
            const targ = $($(d)[0]).attr('id');
//            console.log(targ, p[i].name);
//            console.log(p[i]);

//            console.log($(d).parent())
            window.renderPartial(targ, 'dev_climber_summary', p[i]);
        })
    };
    const updateDevLog = (s) => {
        // in dev, add important messages to the dev.log.panel
        devLog.push(s);
        const p = {logs: devLog.slice(0)};
        const profs = Object.entries(session).filter(e => e[0].includes('profile')).map(e => e[1]);
        const canRender = !$('#logpanel').find('.log').hasClass('hidden');
//        console.log(`canRender? ${canRender}, logs: ${p.logs.length}`);
        p.logs.forEach((m, i) => {
            const id = m.substr(0, 1).toLowerCase();
            const P = profs.filter(p => p.option === id);
            const o = {msg: m, type: id, img: P.length ? P[0].filename : 'AdrienRomane'};
            p.logs[i] = o;
        });
        if (canRender) {
            renderTemplateWithStyle('logpanel', 'dev.log.panel', p, () => {
                const div = document.getElementById('logpanel');
                const clear = $('#clear');
                const toggle = $('#toggle');
                div.scrollTop = div.scrollHeight;
                clear.off('click').on('click', function () {
                    const logs = $(this).parent().find('.log');
                    logs.remove();
                    devLog.length = 0;
                });
                toggle.off('click').on('click', function () {
    //                $(this).parent().addClass('min');
                    const logs = $(this).parent().find('.log');
    //                logs.is(':visible') ? logs.hide() : logs.show();
    //                logs.is(':visible') ? logs.addClass('hidden') : logs.removeClass('hidden');
                    !logs.hasClass('hidden') ? logs.addClass('hidden') : logs.removeClass('hidden');
                });
            });
        }
    };
    const renderMap = () => {
        renderNone(() => {
            const rOb = {
                climbers: Climber.getClimbers().map((climber, index) => ({
                    ...climber, // Spread the original properties of the climber object
                    initx: 10 + (index * 5)
                }))
            };
//            console.log(rOb);
            renderTemplate('theatre', 'map', rOb, () => {
                updateAddress('map');
                $('body').addClass('body-map');
                renderTemplateWithStyle('timerpanel', 'dev.timer.panel', gameData, () => {
//                    console.log('timer rendered');
                    devTimer = new DevTimer();
                });
                devShowProfiles();
                Climber.getRouteMap(() => {
                    Climber.setViews($('.map-pointer-container'));
                    Climber.setBounds(0, $('#mapzone').height());
                    timeDisplay = $('.game-time');
                    eventStack.initSessionEvents(getCurrentState().sessiontime.m);
                    updateDisplay();
//                    console.log(`renderMap`);
                });
            })
        });
    };

    const renderHome = () => {
        renderNone(() => {

            renderTemplate('theatre', 'home', session, () => {
                setupHome();
                updateAddress('home');
            })
        });
    };
    const renderNone = (cb) => {
        renderTemplate('theatre', 'blank', {}, () => {
            $('body').removeClass('body-map');
//            showAlert('dunne')
            if (cb) {
                cb();
            }
        })
    };

    // publically exposed methods - temporary, should be deleted prior to deployment
    window.showSession = showSession;
    window.showData = showData;
    window.showProfiles = showProfiles;
    window.showEvents = showEvents;
    // publically exposed methods - keep
    window.getSessionID = getSessionID;
    window.climberUpdate = climberUpdate;
    window.updateDevLog = updateDevLog;
    window.climberDepletionEvent = climberDepletionEvent;
    //
//    test();
    // hook into timer methods
    gTimer.updateDisplay = updateDisplay;
    gTimer.storageUpdater = storageUpdater;
    const toggleTimer = () => {
        Climber.storeSummaries();
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

    // Initialize the MutationObserver - set up common button methods
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
            // Check added nodes for the target selector
            mutation.addedNodes.forEach((node) => {
                let bId = '.back-btn';
                if ($(node).is(bId)) {
                    setupBackButton(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => setupBackButton(descendant));
                //
                bId = '.resources_adj';
                if ($(node).is(bId)) {
                    resChangeProfile(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => resChangeProfile(descendant));
                //
                bId = '.resop';
                if ($(node).is(bId)) {
                    resOptionSetup(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => resOptionSetup(descendant));
                //
                /* removed auto-setup for modal close buttons, event modals often require an optional close button
                bId = '.k2-modal-btn';
                if ($(node).is(bId)) {
                    setupCloseModal(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => setupCloseModal(descendant));//
                */
                bId = '.dieroll';
                if ($(node).is(bId)) {
                    setupDieRoll(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => setupDieRoll(descendant));
            });
        });
    });
    // Start observing the document body for changes
    observer.observe(document.body, {
        childList: true, // Watch for direct children being added/removed
        subtree: true, // Watch the entire subtree of the body
    });


    sessionReset.on('click', resetSession);
    sessionPlayPause.on('click', playPauseSession);
    const onUnload = () => {
        snapshot();
        theState.storeTime(gTimer.elapsedTime);
    };
    window.onbeforeunload = onUnload;
    const initRender = () => {
        // do not run init on DOM load, checkSession must run first
//        console.log(`initRender, do we have a session?`);
//        console.log(session);

        const cp = getCurrentPage();
//        console.log(cp);
        switch (cp.page) {
            case 'home':
                renderHome();
                break;
            case 'map':
                prepareAndRenderMap();
                break;
            case 'resources':
                renderResources(cp.val);
                break;
            case 'team':
                renderTeam();
                break;
            default:
                renderHome();
        }
    };
    const init = () => {
        gameflow('script init');
        newconnect = true;
    };
    init();
});
