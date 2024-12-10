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
    const msgWin = $('#msg');
    const msgs = [];

    const sessionPlayPause = $('#b_playpause');
    const sessionReset = $('#b_reset');
    let timeDisplay = $('#time_display');

    // programmable event methods
    const confirmStartNew = () => {
        let startNew = false;
//        startNew = confirm('would you like to start a new game?');
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

    const storeLocal = (p, v) => {
        const id = `${getStoreID()}-${p}`;
//        console.log(`storing`, id, v);
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
//        console.log(`expandSession`);
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

    };
    const setSession = (sesh, type) => {
        // unified method for setting the session
        session = sesh;
        gameflow(`session initialised (${type}) with ID ${session.uniqueID}`);
        theState = new State(socket, session);
        gTimer.setTimer(session.time);
        expandSession();
        summariseSession();
        initRender();
        updateView();
    };
    const checkSession = () => {
        const gid = getStoreID();
        const lid = localStorage.getItem(gid);
        if (Boolean(lid)) {
            gameflow(`continuing game ${lid}`, {style: 'ok'});
            gameflow(`newconnect? ${newconnect}`)
            if (newconnect) {
                gameflow(`You can choose to start a new game [confirm1]`);
                showOverlay(`Would you like to start a new game?`, {button: 'yes', action: startNew})
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
                setTeamMember(0, -1);
                setTeamMember(1, -1);
                setTeamMember(2, -1);
                localStorage.setItem(gid, session.uniqueID);
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
                    window.location.hash = 'home';
                    delete session.profile0;
                    delete session.profile1;
                    delete session.profile2;
                    session.allProfiles = [];
                    Climber.zeroAll();
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
        resetClimbers();
    };
    const showSession = () => {
        console.log(session);
    };
    const showProfiles = () => {
        const p = Object.entries(session).filter(s => s[0].includes('profile')).map(([_, value]) => value);
        console.log(p);
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

    const updateSession = (p, v, cb) => {
//        console.log(`updateSession`)
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
//        console.log(`min: ${min}, sec: ${sec}`);
        return {sec: sec, min: min};
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
//            gameflow(`game data ready (check console)`);
            gameflow(`game data ready`);
            gameData = processData(d);
//            console.log(gameData);
        });
    };
    // teams
    const resetClimbers = () => {
//        console.log(`resetClimbers`);
        Climber.resetAll();
        updateClimbers(0);
    };
    const updateClimbers = (s) => {
        Climber.updateViews(s);
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
//        console.log(`getClimber`);
//        console.log(session);
//        console.log(session.team);
        // getClimber returns a new Climber instance
        // Requires an object as arg
        // Add the game data to all instances
        if (gameData) {
            o.gameData = JSON.parse(JSON.stringify(gameData));
            o.team = JSON.parse(JSON.stringify(session.team));

            const c = new Climber(o);
//            c.setView($('.climber'));
            c.setView($('.map-pointer-container'));
//            console.log(c);
//            console.log(Climber.getClimbers().length)
            return c;
        }
    };
    const setTeamMember = (profile, type) => {
        let tm = false;
        if (session[`profile${profile}`]) {
            if (session[`profile${profile}`].profile === null || $.isEmptyObject(session[`profile${profile}`].profile)) {
                const fullProfile = Object.assign(getTeamMember(profile, type), {profile: profile, type: type});
                const p = getClimber(fullProfile);
//                console.log(p);
                tm = {summary: p.getStorageSummary()};
                if (Boolean(tm)) {
                    updateSession(`profile${profile}`, tm, (r) => {
                        //
                        if (Climber.getClimbers().length === 3) {
                            gameflow(`you can now use renderMap`)
                        }
                    });
                }
            }
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
        const r = Climber.getClimbers().filter(c => c.type === -1).length === 0;
        return r;
    };

    // timing
    const gTimer = new GameTimer();
    const startTime = gTimer.getHourInMilli(5);
    const endTime = gTimer.getHourInMilli(18);
    const runTime = endTime - startTime;
    const gameHours = gTimer.getHoursFromMilli(runTime);
    const gameMinutes = gTimer.getMinutesFromMilli(runTime);
    const sessionMax = 20; /* total play time before game death in minutes */
    const tAdj = gameMinutes / sessionMax; /* factor by which time is speeded up */
//    console.log(`tAdj = ${tAdj}`);
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
//            console.log(`time's up`);
            theState.storeTime(endTime);
        } else {
            storeLocal('time', gTimer.elapsedTime);
            timeDisplay.html(formatTime(adj + startTime));
            if (colourBG) {
                colourBG.style.background = updateGradient((adj/runTime) * 100);
            }
        }
    };
    const updateDisplay = () => {
//        console.log(`updateDisplay`)
        const cs = getCurrentState();
        updateClimbers(cs.sec);
        showtime();
    };

    // key page setup
    const setupHome = () => {
        const bClimb = $(`#btn-start`);
        const bTeam = $(`#btn-team`);
        const bResources = $(`#btn-resources`);
        const all = [bClimb, bTeam, bResources];
        const cReady = climbersReady();
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
    const submitResources = (p) => {
        const o = isNaN(parseInt($('#oxygen').val())) ? 0 : parseInt($('#oxygen').val());
        const s = isNaN(parseInt($('#sustenance').val())) ? 0 : parseInt($('#sustenance').val());
        const r = isNaN(parseInt($('#rope').val())) ? 0 : parseInt($('#rope').val());
//        const t = p.type;
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
    const setupResourceExtras = (boo) => {

        const nin = $('input[type=number]');
        const remain = parseFloat($('#resource_remaining').find('div').length > 0 ? $('#resource_remaining').find('div').html() : $('#resource_remaining').html());
        const c = gameData.constants;
        const p = session[$('.form-submit-btn').data('profile')];

//        console.log(`p is ${p}`);
//        console.log(p);
        console.log(`setupResourceExtras ${boo}`);
//        console.log(nin.length);
        nin.prop('disabled', !boo);
        if (boo) {
            const max = p.options[p.temptype].capacity;
            nin.off('input').on('input', function () {
                if ($(this).val() < 0) {
//                    $(this).val(0);
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
//                    console.log(n);
                });
                const l = calculateLoad();
                const drt = $('#resource_total');
                const drr = $('#resource_remaining');
                drt.html(showDyno(T + l));
                drr.html(showDyno(max - (T + l)));
                max - (T + l) < 0 ? drr.addClass('wrong') : drr.removeClass('wrong');
//                console.log(p);
//                resOptionselect(p.profile, p.temptype);
                if (T + l > max) {
//                    alert('you are overloaded, reduce some of your extras')
                }
            })

        }
    };
    const setupResources = async () => {
        const sub = $('.form-submit-btn');
        const p = session[sub.data('profile')];
//        console.log(p);
        setupResourceExtras(false);
        if (p.type > -1) {
            sub.prop('disabled', true);
            sub.addClass('disabled');
            $('.resop').addClass('disabled');
            $('.resop').removeClass('abled');
            $('input').prop('disabled', true);
            console.log(p)
            $('#oxygen').val(p.oxygen);
            $('#sustenance').val(p.sustenance);
            $('#rope').val(p.rope);
            updateResImg(p.profile, p.type);
            resOptionselect(p.profile, p.type);
        } else {
            sub.prop('disabled', false);
            sub.removeClass('disabled');
            $('.resop').removeClass('disabled');
            $('.resop').addClass('abled');
            sub.off('click').on('click', function (ev) {
                ev.preventDefault();
                console.log($('#resource_remaining').html().includes('-'));
                if ($('#resource_remaining').html().includes('-')) {
                    alert('you are overloaded, try removing some extras');
                } else {
                    const inputValues = $('input[type="text"]').map((_, el) => parseInt($(el).val())).get();
                    const zeroValues = inputValues.filter(v => v === 0);
                    if (p.temptype < 0) {
                        // no profile selected
                        alert('you must pick an Option')
                    } else {
                        const r = $('#resource_remaining').find('div').length > 0 ? $('#resource_remaining').find('div').html() : $('#resource_remaining').html();
                        if (zeroValues.length > 1) {
                            if (parseFloat(r) > 0) {
                                const ok = confirm(`You have ${r}kg of remaining capacity and have not allocated any extra resources, are you sure you want to continue? You will not be able to change your mind later.`);
                                if (ok) {
                                    submitResources(p);
                                }
                            }
                        } else {
                            const ok = confirm('Are you sure these are the values you want to set? You will not be able to change your mind later.');
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
    const resOptionselect = (profile, type) => {
        const c = gameData.constants;
        const p = session[`profile${profile}`];
        const pn = parseInt(profile);
        const tn = parseInt(type);
        p.temptype = tn;
        updateResImg(pn, tn);
        const o = p.options[tn];
        const t_oxygen = Math.ceil((o.t1 + o.t2) * 2 / c.oxygen.unitTime) + p.oxygen;
        const w_oxygen = t_oxygen * c.oxygen.weight;
        const t_sustenance = Math.ceil((o.t1 + o.t2) * 2 / c.sustenance.unitTime) + p.sustenance;
        const w_sustenance = t_sustenance * c.sustenance.weight;
        const w_total = w_oxygen + w_sustenance;
//        const w_remain = w_total < o.capacity ? o.capacity - w_total : 0;
        const w_remain = o.capacity - w_total;
        const dot = $('#total_oxygen');
        const dow = $('#weight_oxygen');
        const dst = $('#total_sustenance');
        const dsw = $('#weight_sustenance');
        const drt = $('#resource_total');
        const drr = $('#resource_remaining');
        dot.html(showDyno(t_oxygen));
        dow.html(showDyno(w_oxygen));
        dst.html(showDyno(t_sustenance));
        dsw.html(showDyno(w_sustenance));
        drt.html(showDyno(w_total));
        drr.html(showDyno(w_remain));
        w_remain < 0 ? drr.addClass('wrong') : drr.removeClass('wrong');
//        console.log(`set up extras: ${w_remain}: ${typeof(w_remain)}`);
//        setupResourceExtras(w_remain > 0 && p.type < 0);
        setupResourceExtras(true);
    };
    const resOptionSetup = (button) => {
        $(button).off('click').on('click', function () {
            const disabled = $(this).attr('class').includes('disabled');
            const id = $(this).attr('id').split('_');
            const p = session[`profile${id[1]}`];
            if (!disabled) {
                resOptionselect(id[1], id[2]);
                $('.resop').removeClass('selected');
                $(this).addClass('selected');
            }
        })
    };
    const renderResources = (n) => {
        renderNone(() => {
            const p = `profile${n === undefined || n === null? 0 : n}`;
            const rOb = session[p];
//            console.log(rOb)
            renderTemplate('theatre', 'resources', rOb, () => {
                updateAddress('resources');
                $(`#resop_${rOb.profile}_${rOb.type}`).addClass('selected');
                setupResources();
            })
        });
    };
    const renderTeam = () => {
//        console.log(`renderTeam`);
        renderNone(() => {
            const rOb = {profiles: Climber.getClimbers()}
            console.log(rOb);
            renderTemplate('theatre', 'team', rOb, () => {
                updateAddress('team');
            })
        });
    };
    const renderMap = () => {
        renderNone(() => {
            const rOb = {
                climbers: Climber.getClimbers().map((climber, index) => ({
                    ...climber, // Spread the original properties of the climber object
                    initx: 10 + (index * 5)
                }))
            };
            console.log(`renderMap:`);
            console.log(rOb);
            renderTemplate('theatre', 'map', rOb, () => {
                updateAddress('map');
                $('body').addClass('body-map');
                Climber.getRouteMap(() => {
                    Climber.setViews($('.map-pointer-container'));
                    Climber.setBounds(0, $('#mapzone').height());
                    timeDisplay = $('.game-time');
                    updateDisplay();
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
//            alert('dunne')
            if (cb) {
                cb();
            }
        })
    };
    window.showSession = showSession;
    window.showProfiles = showProfiles;
    //
//    test();
    gTimer.updateDisplay = updateDisplay;
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



    // Initialize the MutationObserver
    const observer = new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
            // Check added nodes for the target selector
            mutation.addedNodes.forEach((node) => {
                let bId = '.back-btn';
                if ($(node).is(bId)) {
//                    console.log(`found ${bId}`)
                    setupBackButton(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => setupBackButton(descendant));
                bId = '.resources_adj';
                if ($(node).is(bId)) {
//                    console.log(`found ${bId}`)
                    resChangeProfile(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => resChangeProfile(descendant));
                bId = '.resop';
                if ($(node).is(bId)) {
//                    console.log(`found ${bId}`)
                    resOptionSetup(node);
                }
                // If the node is a container, search its descendants
                $(node)
                    .find(bId)
                    .each((_, descendant) => resOptionSetup(descendant));
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
