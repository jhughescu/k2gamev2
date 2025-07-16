class Climber {

    constructor(init) {
//        console.log('##################################### create new climber ##################################### ');
//        console.log(init);
        if (init.summaryString && init.summaryString !== undefined) {
                const gd = init.gameData;
                const tm = init.team;

                init = this.unpackStorageSummary(init.summaryString);
                init.gameData = gd;
                init.team = tm;
        }
        this.onClimberUpdate = null;
        this.gameData = init.gameData;
        this.profile = init.profile;
        if (init.type > -1) {
            this.option = this.getOption(init.type);
            this.OPTION = this.getOption(init.type).toUpperCase();
        }
//        console.log(this.gameData);
//        console.log(this.gameData.profiles);
        this.options = Object.values(this.gameData.profiles[`profile_${this.profile}`]).filter(p => p.hasOwnProperty('capacity'));
        this.expandOptions();
        this.option = this.getOption(init.profile);
        this.OPTION = this.getOption(init.profile).toUpperCase();
        this.name = init.team.profiles[`p${init.profile}`].name;
        this.nameFirst = this.name.split(' ')[0];
        this.pronouns = init.team.profiles[`p${init.profile}`].gender === 'm' ? {p1: 'he', p2: 'his', p3: 'him'} : {p1: 'she', p2: 'her', p3: 'her'};
        Object.values(this.pronouns).forEach((p, i) => this.pronouns[`P${(i + 1)}`] = window.stringToCamelCase(p));
//        this.filename = this.name.replace(' ', '').replace(/[^a-zA-Z0-9]/g, '');
//        this.filename = window.stringToCamelCase(this.name).normalize('NFD').replace(' ', '').replace(/[^a-zA-Z0-9]/g, '').toLocaleLowerCase();
        this.filename = window.stringToCamelCase(this.name.normalize('NFD')).replace(' ', '').toLocaleLowerCase();
        //
        const stored = Object.assign({position: init.position, currentTime: 0, delayExpiry: 0}, this.unpackStorageSummary(this.getStoredSummary()));

        this.type = init.type;
        this.capacity = init.capacity || this.options[this.profile].capacity;
        this.t1 = init.t1;
        this.t2 = init.t2;
//        console.log('stored', stored);
//        console.log('init', init);
//        console.log(`type: ${this.type}, option: ${this.option}, profile: ${this.profile}`);

        this.tTotal = (this.t1 * 2) + (this.t2 * 2);
        this.currentSpeed = 0;
        const PROF = init.team.profiles[`p${init.profile}`];
        const TEAM = init.team;
        this.responses = {
            yes: TEAM.responses.yes[this.profile],
            no: TEAM.responses.no[this.profile],
            res: this.gameData.constants.responses.res
        }
        this.responsesArray = Object.values(this.responses);
        this.profileData = init.gameData.profiles[`profile_${init.profile}`];

        this.oxygen = stored.hasOwnProperty('oxygen') ? window.clone(stored).oxygen : 0;
        this.sustenance = stored.hasOwnProperty('sustenance') ? stored.sustenance : 0;
        this.rope = stored.hasOwnProperty('rope') ? stored.rope : 0;
        this.teamID = stored.hasOwnProperty('teamID') ? stored.teamID : (init.hasOwnProperty('teamID') ? init.teamID : -1);
        this.team = this.getBasicTeam(this.teamID);
        this.initialSettings = stored.hasOwnProperty('initialSettings') ? stored.initialSettings : '{}';
        this.resupplies = stored.hasOwnProperty('resupplies') ? stored.resupplies : '';
//        this.allDelays = stored.hasOwnProperty('allDelays') ? stored.allDelays : '';
        this.allDelays = this.retrieveValue(stored, init, 'allDelays', '');
        this.allLandmarks = stored.hasOwnProperty('allLandmarks') ? stored.allLandmarks : '';
        this.position = stored.position > 0 ? stored.position : 0;

        // currentTime is a simple integer which can be written/read from the database
        this.currentTime = stored.currentTime > 0 ? stored.currentTime : 0;
        this.currentTime = this.retrieveValue(stored, init, 'currentTime');
        if (this.type > -1) {
//            console.log('timing stuff', this.type, this.name);
//            console.log(stored.currentTime);
//            console.log(init.currentTime);
        }
        if (this.type > -1999999999999999999999) {
//            console.log('position stuff', this.profile, this.name);
//            console.log(stored.position);
//            console.log(init.position);
//            console.log(init.finishTime, stored.finishTime);
        }
//        this.finishTime = stored.hasOwnProperty('finishTime') ? stored.finishTime : 0;
        this.finishTime = init.finishTime || 0;
        // currentTimeObject is a read-only object sent in by the game code (see updatePosition)
        this.currentTimeObject = {};
        // delay in minutes
        this.delayExpiry = stored.delayExpiry > 0 ? stored.delayExpiry : 0;
        this.delayCurrentTotal = stored.delayCurrentTotal > 0 ? stored.delayCurrentTotal : 0;
        this.delayRemaining = null;
        this.eventTime = stored.eventTime > 0 ? stored.eventTime : 0;
        this.currentStage = init.currentStage || 0;
//        console.log('derive currentStage from init?', init.currentStage, this.currentStage);
//        console.log(this.name, this.position)
        this.finished = Boolean(init.finishTime) || false;
        this.view = null;
        this.icon = null;
        // finish bounce - may be removed later
        this.b = 0;
        this.bounceFac = 5 + (Math.random() * 21);
        this.bouncer = this.bouncer.bind(this);
        this.bounceInc = 5 + (Math.random() * 10);
        this.iconX = 100 + (this.profile * 0);
//        console.log(this);
        this.calculateClimbRate();
        if (this.isRealClimber()) {
            if (Climber.allClimbers.filter(c => c.profile === this.profile).length === 0) {
                Climber.allClimbers.push(this);
            } else {
                Climber.allClimbers[Climber.allClimbers.findIndex(e => e.profile === this.profile)] = this;
            }
        }
        this.unstore = (gID) => {
            console.log(`unstoring ${this.nameFirst}`);
            this.unstoreSummary(gID);
        };
        this.storeSummary();
//        console.log('new climber:', this.oxygen, this);
//        console.log('new climber:', this.oxygen, window.clone(this));
    }


    static resetAll(cs) {
//        console.log('resetAll', cs);
        Climber.allClimbers.forEach(c => {
            c.reset(cs);
        })
    }
    static zeroAll(cs) {
//        console.log('zeroAll', cs);
        // More vigorous version of resetAll, nukes all values.
        Climber.allClimbers.forEach(c => {
            c.zero(cs);
        })
        this.allClimbers = [];
    }
    static setBounds(y, h) {
        Climber.bounds.h = h;
    }
    static setViews(jq) {
        Climber.allClimbers.forEach(c => {
            c.setView(jq);
        });
    }
    static updateViews(o) {
        if (o === undefined) {
            console.warn(`no 'o' value supplied, updates will fail`);
            return;
        }
        const active = Climber.getClimbers().filter(c => !c.finished);
//        const active = Climber.getClimbers().filter(c => c.profile === 1);
        active.forEach(c => {
            c.updateViewFromTime(o);
        });
    }
    static storeSummaries() {
        const active = Climber.getClimbers().filter(c => !c.finished);
        active.forEach(c => {
            c.storeSummary();
        });
    }
    static test() {
        //
    }
    static getX(y, test) {
        const output = this.routeMap;
        let comp = [];
        let rtn = null;

        if (y === 100) {
            rtn = output[0].x;
        } else {
            // get the ratio for y
            for (var i = 0; i < output.length; i++) {
                if (output[i + 1].y > y) {
                    comp = [output[i].y, output[i + 1].y];
                    const r = (y - comp[0]) / (comp[1] - comp[0]);
                    rtn = output[i].x + (r * (output[i + 1].x - output[i].x));
                    break;
                }
            }
        }
//        console.log(`climber getX y; ${y}, rtn: ${rtn}`);
        return rtn;
    }
    static getClimbers() {
        return this.allClimbers;
    }
    static onTimeout() {
        const C = this.getClimbers().filter(c => !c.finished);
        C.forEach(c => {
            c.showDead();
        });
    }
    static async getRouteMap(cb) {
        const response = await fetch('data/routemap.json');
        const data = await response.json();
        const bigData = {};
        this.routeMap = data;
//        console.log(`getRouteMap`)
        for (var i = 0; i < 100; i += 0.01) {
            bigData[roundNumber(i, 2)] = this.getX(i, 'no');
        }
        this.routeMap = bigData;
//        console.log(window.clone(this.routeMap));
//        console.log(`i am a climber, is the map an array? ${$.isArray(this.routeMap)}`);
        if (cb) {
            cb();
        }
    }

    retrieveValue(stored, init, p, def = 0) {
        const storedP = localStorage.getItem(p) || def;
        const initP = init.hasOwnProperty(p) ? init[p] : def;
        let v;
        if (initP) {
            v = initP;
        } else if (storedP) {
            v = storedP;
        } else {
            v = def;
        }
        return v;
    }
    prepForLog(n) {
        // round down any long numerics and display with ellipsis
        if (roundNumber(n, 5) !== n) {
            n = `${roundNumber(n, 5)}...`
        }
        return n;
    }
    log(s, force) {
//        if (this.profile === 0 || 2 < 8) {
//        return;
//        console.log('loglogogogojh', s, force);
        const colour = typeof(s) === 'string' ? s.includes('#########') ? 'cyan' : 'yellow' : 'yellow';
        if (this.profile === 1 ) {
//        if (this.profile === 0) {
            if (typeof(s) === 'string' || typeof(s) === 'number') {
                console.log(`%c${this.name} %c${s}`, 'color: white;', `color: ${colour};`);
            }
        }
        if (this.profile === 0 || force) {
            if (typeof(s) === 'string' || typeof(s) === 'number') {
//                console.log(`%c${this.name} %c${s}`, 'color: white;', `color: ${colour};`);
//                window.updateDevLog(`${this.OPTION} ${s} (${this.name.split(' ')[0]})`);
                window.updateDevLog(`${s} (${this.name.split(' ')[0]})`);
            } else {
//                console.log(`%c${this.name}:`, 'color: yellow;');
//                console.log(s);
            }
        }
    }
    logPos() {
        if (this.view.length) {
            console.log(this.view.position());
        }
    }
    console(s) {
        if (this.option === 'a') {
            console.log(s);
        }
    }

    isRealClimber() {
        // diff. between an actual playable climber and a support team climber (these have type = -9999)
        return this.type > -100;
    }

    // gets
    getSummaryMap() {
        // mapped values to be stored in DB (store strings and numbers only, no objects etc)
        const m = {
            p: 'profile',
            ty: 'type',
            tm: 'teamID',
            c: 'capacity',
            t1: 't1',
            t2: 't2',
            cs: 'currentSpeed',
            ct: 'currentTime',
            ft: 'finishTime',
            o: 'oxygen',
            s: 'sustenance',
            r: 'rope',
            rs: 'resupplies',
            i: 'initialSettings',
            pos: 'position',
            st: 'currentStage',
            de: 'delayExpiry', /* delay is a time in minutes  */
            dct: 'delayCurrentTotal', /* delayCurrentTotal is a time in minutes  */
            ad: 'allDelays', /* allDelays stores all delays as separate integers in a per-stage array */
            al: 'allLandmarks', /* allLandmarks stores all landmarks (timestamps for stage changes) as separate integers in an array */
            et: 'eventTime', /* if under the effect of an event, this is the time in minutes when the event occured */
        }
        Object.entries(m).forEach(v => {
            m[v[1]] = v[0];
        })
        return m;
    }
    getOption(n) {
        const s = 'abcdef';
        const a = s.split('');
        return a[n];
    }
    getBasicTeam(id) {
        const o = window.clone(this.gameData.teams[id]);
//        console.log(this.gameData.teams[id]);
//        console.log('deleting the profiles');
        delete o.profiles;
        return o;
    }

    // sets
    setProperty(p, v, cb) {
//        this.log(`setProperty: ${p} to ${v}`);
        if (p === undefined) {
            return;
        }
        if (typeof(v) === 'number' && v !== NaN) {
//            console.log(`initial setting of ${p} to ${v}, which is ${this[p]}`);
            this.storeInitialSetting(p, v);
            if (v !== this[p]) {
//                this.log(`set ${p} to ${this.prepForLog(v)}: ${this.prepForLog(this[p])} => ${this.prepForLog(v)}`, true);
            }
            this[p] = v;
            if (cb) {
                cb(this);
            }
        } else {
            const name = `set${p.substr(0, 1).toUpperCase()}${p.substr(1)}`;
            console.warn(`${name} requires a argument of type number`);
        }
    }
    resetProperty(p) {
        // if a property exists in the initialSettings object it can be reset here
//        console.log(`resetProperty ${p} (${this.name})`);
        const sm = this.getSummaryMap();
        const is = JSON.parse(this.initialSettings);
//        console.log(is);
        if (p.length > 1) {
            p = sm[p];
        }
        if (is.hasOwnProperty(p)) {
//            console.log('set', sm[p], is[p]);
            this.setProperty(sm[p], is[p]);
        }
        window.climberUpdate(this);
    }
    resetAllInitial() {
        const sm = this.getSummaryMap();
        const is = JSON.parse(this.initialSettings);
        Object.entries(is).forEach(e => {
//            console.log(e);
            this.setProperty(sm[e[0]], e[1]);
        });
        window.climberUpdate(this);
    }
    storeInitialSetting(p, v) {
        const sm = this.getSummaryMap();
        const canStore = ['oxygen', 'sustenance', 'rope'];
        const can = canStore.includes(p);
        if (can) {
            let is = JSON.parse(this.initialSettings);
            if (!is.hasOwnProperty(sm[p])) {
                is[sm[p]] = v;
                this.initialSettings = JSON.stringify(is);
                if (Object.values(is).length === 3) {
//                    console.log(`complete initial settings for ${this.name}: ${this.initialSettings}`);
                }
            }
        }
    }
    adjustProperty(p, av, cb) {
//        this.log(`adjusting ${p}, ${window.clone(this)[p]}, ${this[p]}`, this.displayProps.includes(p), av);
        if (this.displayProps.includes(p)) {
            if (Math.ceil(this[p]) !== Math.ceil(this[p] + av)) {
                const cdp = this.view.find('#climberDetailPanel');
                if (cdp.length > 0) {
                    if (cdp.is(':visible')) {
                        // the detail panel is open and visible; update it.
                        cdp.find(`#detail_${p}`).html(Math.ceil(this[p] + av));
                    }
                }
            }

        }
        if (this.hasOwnProperty(p)) {
            let np = this[p] + av;
            if (np < 0) {
                // cannot be negative
                np = 0;
            }
            this[p] = np;
            if (cb) {
                cb({prop: p, adj: av, res: this[p]});
            }

        } else {
            console.warn(`attempt to adjust property which does not exist (${p})`);
            if (cb) {
                cb(false);
            }
        }
    }
    setType(n, cb) {

        this.setProperty('type', n, cb);
        this.options = Object.values(this.gameData.profiles[`profile_${this.profile}`]);
        const op = this.options[n];
        this.t1 = op.t1;
        this.t2 = op.t2;
        this.tTotal = (this.t1 * 2) + (this.t2 * 2);
        this.capacity = op.capacity;
//        console.log('climber setType', n, op, `capacity: ${this.capacity}`);
        this.option = this.getOption(n);
        this.OPTION = this.getOption(n).toUpperCase();
        this.calculateClimbRate();
        this.storeSummary();
        if (cb) {
            cb(this);
        }
    }
    setOxygen(n, cb) {
        this.setProperty('oxygen', n, cb);
        this.log('set oxygen', n);
    }
    adjustOxygen(n, cb) {
        this.adjustProperty('oxygen', n, cb);
    }
    setRope(n, cb) {
        this.setProperty('rope', n, cb);
//        console.log('set rope', n);
    }
    adjustRope(n, cb) {
        this.adjustProperty('rope', n, cb);
//        console.log('adj rope', n, cb);
    }
    setSustenance(n, cb) {
        this.setProperty('sustenance', n, cb);
//        console.log('set sustenance', n);
    }
    adjustSustenance(n, cb) {
        this.adjustProperty('sustenance', n, cb);
    }
    addResupply(s, v) {
        if (s.length > 1) {
            // if a full string has been passed in, convert to an initial
            s = sm[s]
        }
        const sm = this.getSummaryMap();
        const str = `${s}${v}`;
//        console.log(str);

        if (this.resupplies === '') {
            this.resupplies = str;
        } else {
            const ro = [...this.resupplies.matchAll(/([a-z])(\d)/g)].reduce((obj, [, key, value]) => (obj[key] = +value, obj), {});
//            console.log(ro);
            ro.hasOwnProperty(s) ? ro[s] += v : ro[s] = v;
            this.resupplies = Object.entries(ro)
                .map(([key, value]) => key + value)
                .join("");
            }
        if (this.resupplies.length === 6) {
//            console.log(`${this.name} resupplies = ${this.resupplies}`);
        }
//        console.log(`${this.name} resupplies = ${this.resupplies}`);
    }
    addResupplyV1(s, v) {
        // add an item to the resupplies string if it doesn't already contain it (use initials only)
        const sm = this.getSummaryMap();
        const str = `${s}${v}`;
//        console.log(str);
        if (s.length > 1) {
            // if a full string has been passed in, convert to an initial
            s = sm[s]
        }
        if (this.resupplies === '') {
            this.resupplies = str;
        } else {
            if (!this.resupplies.includes(s)) {
                this.resupplies += str;
            }
        }
        if (this.resupplies.length ) {
            console.log(`${this.name} resupplies = ${this.resupplies}`);
        }
    }
    addResupplyV1(s) {
        // add an item to the resupplies string if it doesn't already contain it (use initials only)
        // V1 works with a simple string of letters (o, s, r)
        const sm = this.getSummaryMap();
        if (s.length > 1) {
            s = sm[s]
        }
        if (this.resupplies === '') {
            this.resupplies = s;
        } else {
            if (!this.resupplies.includes(s)) {
                this.resupplies += s;
            }
        }
//        console.log(`${this.name} resupplies = ${this.resupplies}`);
    }
    setPosition(n) {
//        console.log(`${this.name} setPosition ${n}`);
        this.setProperty('position', n);
    }
    setCurrentSpeed(n) {
        this.setProperty('currentSpeed', n);
    }
    setDelay(n) {
//        console.log(`setDelay ${n}`);
        // a game event has sent a delay to this climber. Prevent updates until the delay (in minutes) has expired
        if (this.currentTimeObject) {
            if (this.currentTimeObject.gametime) {
                if (isNaN(this.delayExpiry) || this.delayExpiry === 0) {
                    this.delayExpiry = this.currentTimeObject.gametime.m + n;
                    this.delayCurrentTotal = n;
                    this.log(`${n} minute delay`, true);
                } else {
                    // delays accrue:
                    this.delayExpiry += n;
                    this.delayCurrentTotal += n;
                }
//                console.log(`time now: ${this.currentTimeObject.gametime.m}, delay expires at ${this.delayExpiry}`);
//                this.showPie(true);
            } else {
                console.warn('cannot set delay; currentTimeObject not yet defined');
            }
        }

        if (!$.isArray(this.allDelays)) {
            this.allDelays = this.allDelays.toString().split('|');
        }
//        console.log(this.allDelays);
//        console.log(this.currentStage);
//        console.log(this.allDelays[this.currentStage]);
//        console.log(this.allDelays[this.currentStage] === undefined);
//        console.log(this.allDelays[this.currentStage] === '');
        const sd = this.allDelays[this.currentStage];
        if (sd === undefined || sd === '') {
            this.allDelays[this.currentStage] = n;
        } else {
            this.allDelays[this.currentStage] += `,${n}`;
        }
        this.allDelays = this.allDelays.join('|');
//        console.log(`${this.name} setDelay of ${n} minutes at stage ${this.currentStage}, allDelays: ${this.allDelays}`);
        if (this.onClimberUpdate) {
            this.onClimberUpdate(`profile${this.profile}`, {summary: this.getStorageSummary()});
        }
    }
    // storage/summarising
    getStorageID() {
        // generate a unique ID to use for getting/setting localStorage summaries
        const sid = `${this.gameData.storeID}-c${this.profile}-${this.filename}`;
        return sid;
    }
    storeSummary() {
        if (this.teamID > -1 && this.team !== -1 && this.type > -100) {
            // don't store any temporary climbers, or support team climbers (these have type = -9999)
            const sid = this.getStorageID();
            const ss = this.getStorageSummary();
    //        const sid = `${this.gameData.storeID}-c${this.profile}-${this.filename}`;
            if (this.finishTime > 0) {
//                console.log(`storing climber with ID ${sid} - use filename? ${this.filename} finishTime: ${this.finishTime}`);
//                console.log(ss);
            }
//            console.log(`storeSummary saves local data for ${this.name}`);
            localStorage.setItem(sid, ss);
        }
    }
    unstoreSummary(gID) {
        let sid = false;
        if (this.gameData) {
            sid = this.gameData.storeID;
        } else if (gID) {
            sid = gID;
        }
        if (sid) {
            console.log(`removing ${sid}-c${this.profile}-${this.filename}`);
            localStorage.removeItem(`${sid}-c${this.profile}-${this.filename}`);
        } else {
            console.warn('Climber cannot be removed; ID not provided');
        }
    }
    getStoredSummary() {
//        const s = `${this.gameData.storeID}-c${this.profile}`;
//        const s = `${this.gameData.storeID}-c${this.profile}-${this.filename}`;
        const sid = this.getStorageID();
        const ss = localStorage.getItem(sid) ? localStorage.getItem(sid) : '';
//        console.log(`getting storage called ${sid}:`);
//        console.log(ss);
        return ss;
    }
    getStorageSummary() {
        const m = this.getSummaryMap();
        let s = '';
        for (var i in m) {
            if (this[m[i]] !== undefined) {
//                console.log(i, m[i], this[m[i]]);
                s += `_${i}:${this[m[i]]}`;
            }
        }
//        console.log(`getStorageSummary: ${s}`);
        return s;
    }
    unpackStorageSummary(str) {
        const s = str.split('_');
        const m = this.getSummaryMap();
        const oo = {};
        s.forEach((v, i) => {
            if (v.length > 0) {
                v = v.split(':');
                if (v.length > 2) {
                    // any JSON strings need to be rejoined:
                    v[1] = v.slice(1).join(':');
                }
                oo[m[v[0]]] = procVal(v[1]);
            }
        });
        return oo;
    }
    clone() {
//        console.log('get the team from this?');
//        console.log(this.gameData.teams[this.teamID]);
        return new Climber({
            gameData: this.gameData,
            team: this.gameData.teams[this.teamID],
            summaryString: this.getStorageSummary()
        })
    }

    // delay countdown chart
    showPie(boo) {
//        debugger;
        const pie = this.view.find(`#countpie_${this.profile}`);
//        console.log(`shoePie`, boo, pie);
        boo ? pie.show() : pie.hide();
//        debugger;
    };
    describeArc(x, y, radius, startAngle, endAngle) {
        const start = this.polarToCartesian(x, y, radius, endAngle);
        const end = this.polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M", x, y,
            "L", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
            "Z"
        ].join(" ");
    }
    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    }
    updateCountdownPie(value) {
//        console.log(`updateCountdownPie, value: ${value}, dct: ${this.delayCurrentTotal}`);

//        const maxValue = 20;
        const maxValue = this.delayCurrentTotal;
        const endAngle = (value / maxValue) * 360;
        document.getElementById(`countdownPie${this.profile}`).setAttribute("d", this.describeArc(18, 18, 18, 0, endAngle));
    }
    // end delay countdown chart


    getStageTime() {
        // return a object containing the name & value of current stage time to climb
        const cs = this.currentStage;
        let t = `t${cs === 1 || cs === 4}`;
        if (cs === 1 || cs === 4) {
            t = 't1';
        } else if (cs === 2 || cs === 3) {
            t = 't2';
        } else {
            t = 't1';
        }
        const st = {cs: cs, t: t, val: Boolean(t) ? this[t] : 0};
        return st;
    }

    calculateDelayTotal() {
        const totalDelays = this.allDelays.split('|')               // split by '|'
            .filter(Boolean)          // remove empty strings
            .flatMap(part => part.split(',').map(Number)) // split by ',' and convert to numbers
            .reduce((a, b) => a + b, 0);
        this.delayTotal = totalDelays;
        return totalDelays;
    }

    calculateClimbRate() {
        const before = window.clone(this);
        const r = this.gameData.route.ratio;
        const s = this.gameData.route.stages;
        if (s) {
            // in dashboard requests the .stages object has not yet been created, in this case set climbRate to 0
            const up = this.position <= r[0];
            const cs = this.currentStage;
            const logic = cs > 1 && cs < 4;
            const tm = logic ? this.t2 : this.t1; /* time to ascend/descend in minutes */
            const ts = tm * 60; /* time to ascend/descend in seconds */
            const stage = s[cs];
            const tempRate = [window.clone(this).currentSpeed];
            let rate = (100 / 4) / ts; /* distance travelled each second */
            if (isNaN(rate)) {
                rate = 0;
            }
            tempRate.push(rate);
            if (!isNaN(rate)) {
                this.setCurrentSpeed(rate);
            }
        } else {
            this.setCurrentSpeed(0);
        }
    }
    getResupplyDetail() {
        const ra = [...this.resupplies.matchAll(/([a-zA-Z])(\d+)/g)].map(match => [match[1], Number(match[2])]);
        return ra;
    }
    resupply() {
        // this method runs at the end of the resupply delay, and completes all pending resupplies.
        if (this.resupplies !== '') {
//            console.log(`${this.name} resupply:`);
//            const ra = [...this.resupplies.matchAll(/([a-zA-Z])(\d+)/g)].map(match => [match[1], Number(match[2])]);
            const ra = this.getResupplyDetail();
//            console.log('we will resupply');
//            console.log(ra);
            const sm = this.getSummaryMap();
            ra.forEach(r => {
//                console.log(`hoping to adjust ${sm[r[0]]} by ${r[1]}`);
                const p = r[0];
                const v = r[1];
                this.adjustProperty(sm[p], v);
                /*
                switch (p) {
                    case 'o':
                        this.setOxygen(v);
                        break;
                    case 's':
                        this.setSustenance(v);
                        break;
                    case 'r':
                        this.setRope(v);
                        break;
                }
                */
            });

//            this.resupplies.split('').map(s => sm[s]).forEach(r => {
//                console.log(` - ${r}`);
//                this.resetProperty(r);
//            });
            this.resupplies = '';
        }
    }
    resupplyV1() {
        // this method runs at the end of the resupply delay, and completes all pending resupplies.
        if (this.resupplies !== '') {
            console.log(`${this.name} resupply:`);
            // apply any pending resupplies
            const sm = this.getSummaryMap();
            this.resupplies.split('').map(s => sm[s]).forEach(r => {
                console.log(` - ${r}`);
                this.resetProperty(r);
            });
            this.resupplies = '';
        }
    }
    onDelayExpiry() {
        // use explicit zeroing of delayExpiry to avoid logging
        // pending resource resupplies to be applied now.
        this.resupply();
        this.delayExpiry = 0;
        this.delayRemaining = 0;
        this.showPie(false);
    }
    updateLandmarks() {
        this.allLandmarks = typeof(this.allLandmarks) === 'number' ? this.allLandmarks.toString() : this.allLandmarks;
        this.allLandmarks = this.allLandmarks.split(',').map(e => e = parseFloat(e));
        this.allLandmarks[this.currentStage] = isNaN(this.currentTime) ? 0 : this.currentTime;
        this.allLandmarks = this.allLandmarks.join(',');
        this.onClimberUpdate(`profile${this.profile}`, {summary: this.getStorageSummary()});
//        console.log(`${this.nameFirst} updateLandmarks: ${this.currentStage}`, this.allLandmarks);
    }
    updatePosition(o, cb) {
        const toLog = 0;
        this.currentTimeObject = JSON.parse(JSON.stringify(o));
        const gt = this.currentTimeObject.gametime;
        if (!this.finished) {
            const d = o.sec - this.currentTime;
            const step = d * this.currentSpeed;
//            this.log(`step: ${step}, currentSpeed: ${this.currentSpeed}`);
            this.currentTime = o.sec;
            // update landmarks
            if (this.allLandmarks === '') {
                this.updateLandmarks();
            }
            //
            if (this.position > this.gameData.route.stages[this.currentStage]) {
                // stage has changed; climb rate must be recalculated
                // Note: change the currentStage here NOT in the calculation method as that can be called at other times.
                const adjustID = `t${this.currentStage}`;
                const adjusting = this[adjustID];
                // set the current t value to the predefined value, in case it has been adjusted by an event
                // reset all timings - adjusted timings do not persist across stages
                this.setProperty('t1', this.options[this.type].t1);
                this.setProperty('t2', this.options[this.type].t2);
                this.currentStage += 1;
                // update landmarks
                this.updateLandmarks();
                this.calculateClimbRate();
                window.climberUpdate(this);
                if (cb) {
                    cb('reset');
                }
            }
            if (this.position + step < 100) {
                const minUnderExpiry = gt.m <= this.delayExpiry;
                const expiryZero = this.delayExpiry === 0;
                let toExpire = false;
                if (!minUnderExpiry && !expiryZero) {
                    this.onDelayExpiry();
                    toExpire = true;
                }
                if (this.delayExpiry > 0 && gt.m < this.delayExpiry) {
                    // climber is delayed
//                    console.log(`${this.nameFirst} delayed`);
                    const dr = this.delayRemaining;
                    const de = this.delayExpiry;
                    const step = (de - gt.m) - (dr - (de - gt.m));
                    this.delayRemaining = this.delayExpiry - gt.m;
                    this.showPie(this.delayRemaining > 0);
                    this.updateCountdownPie(this.delayRemaining);
                } else {
                    if (toExpire) {
                        this.onDelayExpiry();
                        toExpire = false;
                    }



//                    this.log(`updating: ${step}`);




                    this.position += step;
                }
            } else {
                this.position = 100;
            }
//            console.log(`${this.name} position to ${this.position}`);
            return this.position;
        }
    }
    updateResources() {
        const cto = this.currentTimeObject;
        const con = this.gameData.constants;
        const s = cto.sec - (this.currentSec ? this.currentSec : cto.sec);
        // Oxygen: per second depletion
        const currOxygen = this.oxygen;
        const depOxygen = 1 / (con.oxygen.unitTime * 60);
        this.adjustOxygen(-1 * (depOxygen * s));
//        if (Math.ceil(this.oxygen) !== Math.ceil(currOxygen) && Math.ceil(this.oxygen) >= 0) {
//            window.climberDepletionEvent(Object.assign(this, {resource: 'oxygen'}));
//            this.log(`oxygen reduced to ${Math.ceil(this.oxygen)}`, true);
//        }
        if (Math.ceil(this.oxygen) !== Math.ceil(currOxygen) || Math.ceil(this.oxygen) === 0 && this.delayRemaining === 0) {
            // cond.1: ox change, cond.2 no delay, ox to zero
            if (Math.ceil(this.oxygen) >= 0) {
                window.climberDepletionEvent(Object.assign(window.clone(this), {resource: 'oxygen'}));
//                this.log(`oxygen reduced to ${Math.ceil(this.oxygen)}`, true);
            }
        }
        if (Math.ceil(this.oxygen) === 0 && this.delayRemaining === 0) {
            this.log('no ox!!');
        }
        // Sustenance: per second depletion
        const currSustenance = this.sustenance;
        const depSustenance = 1 / (con.sustenance.unitTime * 60);
        this.adjustSustenance(-1 * (depSustenance * s));
        if (Math.ceil(this.sustenance) !== Math.ceil(currSustenance) || Math.ceil(this.sustenance) === 0 && this.delayRemaining === 0) {
            // cond.1: sus change, cond.2 no delay, sus to zero
            if (Math.ceil(this.sustenance) >= 0) {
                window.climberDepletionEvent(Object.assign(window.clone(this), {resource: 'sustenance'}));
//                this.log(`sustenance reduced to ${Math.ceil(this.sustenance)}`, true);
            }
        }
        // Rope: per second depletion - NO
        /*
        const currRope = this.rope;
        const depRope = 1 / (con.rope.unitLength * 60);
        this.adjustRope(-1 * (depRope * s));
        if (Math.ceil(this.rope) !== Math.ceil(currRope) && Math.ceil(this.rope) >= 0) {
            window.climberDepletionEvent(Object.assign(this, {resource: 'rope'}));
            this.log(`rope reduced to ${Math.ceil(this.rope)}`, true);
        }
        */
        window.climberUpdate(this);
        // Do this last:
        this.currentSec = cto.sec;
    }
    updateViewFromTime(o) {
        if (!this.finished) {
            this.updatePosition(o);
            this.updateView();
            this.updateResources();
        }
    }
    // finish bounce - may be deleted (check for method calls elsewhere)
    bouncer() {
        this.b += this.bounceInc;
        let c = (Math.sin(this.b * (Math.PI / 180)) + 1) * this.bounceFac;
        if (this.b > 1300) {
            clearInterval(this.bounceInt);
            c = 0;
        }
        this.view.css({bottom: `${c}px`});
    }
    showFinished() {
        this.b = 270;
        this.bounceInt = setInterval(this.bouncer, 10);
    }
    getZeroPos() {
        const y = (Climber.bounds.h * 1);
        const zp = {y: y};
        return zp;
    }
    //
    toggleInfo() {
        // dev method, toggles climber detail display on/off
//        console.log(`toggleInfo`, this);
//        console.log(`toggleInfo`, window.clone(this));
        const d = $(this.view.find('.map-pointer-label')[0]);
        if (d.is(':visible')) {
            d.hide();
        } else {
            d.show();
        }
    }
    showDead() {
        this.view.css({'background-color': 'black'});
    }
    updateView() {
        if (this.view.length && Climber.routeMap) {
            // only run if view has been correctly defined
            const H = Climber.bounds.h;
            let pos = (H / 50) * this.position;
            if (this.position > 50) {
                pos = H - (pos - H);
            }
//            console.log('updateView', this);
            if (this.position === 100 && !this.finished) {
                this.showFinished();
                this.finished = true;
                this.setProperty('finishTime', this.currentTime);
//                console.log(`${this.name} has finished, ct: ${this.currentTime}, ft: ${this.finishTime}`);
                this.storeSummary();
                window.climberUpdate(this, true);
            }
            const scaleFactor = 200;
            const div = pos === 0 & H === 0 ? 0 : pos / H;
            const xFactor = Climber.routeMap[roundNumber(div * 100, 2)] * scaleFactor;
            const xAdj = (-50 + (this.profile * 50)) * (1 - div);
            const x = `${150 + (xFactor) + xAdj}px`;
            const y = `${pos}px`;
            let str = `updateView : ${this.profile} ${this.view.attr('id')} visible? ${this.view.is(':visible')}, x: ${x} y: ${y} at p=${this.position}`;
            str += ` ${this.view.is(':visible') ? this.view.position().top : ''}`;
            // dev code: change colour of climbers based on their position on the expedition
            if (this.gameData.isDev) {
                ///*
                const cs = this.currentStage;
                const devInd = this.view.find('.climberDevIndicator');
                const cols = ['red', '#ff5800', '#ff9300', '#ffe200', '#baff00'];
                devInd.css({'background-color': cols[cs]});
                if (this.finished) {
                    devInd.css({'background-color': 'green'});
                }
            }
            //
            if (this.view.length > 0) {
                this.view.css({
                    bottom: y,
                    left: x
                });
            }
        } else {
            if (this.view.length === 0) {
//                console.warn('updateView not possible: view not defined');
            } else {
//                console.warn(`updateView not possible: routeMap not defined`);
            }
        }
    }
    setView(jq) {
//        console.log(jq);
        this.view = $(jq[this.profile]);
        if (this.view.length && this.view.position().top === 0 && this.view.position().left === 0) {
            this.view.hide();
        } else {
            this.view.show();
        }
        this.icon = this.view.find('.climber_icon');
        this.view.show();
        this.view.find('.type').html(this.type);
        this.updateView();
        this.view.off('click').on('click', () => {
//            jq.css({'z-index': 1});
//            this.view.css({'z-index': 10});
            this.toggleInfo();
        });
        let timer;
        const timeout = 1000;
        this.view.append(`<div class='climberDevIndicator'></div>`);
        this.view
            .on('mousedown', () => {
                timer = setTimeout(() => {
                    $('#output').text('Long-press action triggered!');
                    jq.css({ 'z-index': 1 });
                    this.view.css({ 'z-index': 10 });
                }, timeout);
            })
            .on('mouseup touchend mouseleave', function () {
                clearTimeout(timer);
            });
        if (this.view.attr('id')) {
            // Use native addEventListener for touchstart with passive: true
            if (this.view) {
                document.getElementById(this.view.attr('id')).addEventListener('touchstart', () => {
                    timer = setTimeout(() => {
                        $('#output').text('Long-press action triggered!');
                        jq.css({ 'z-index': 1 });
                        this.view.css({ 'z-index': 10 });
                    }, timeout);
                }, { passive: true });
            }
        }
    }
    setViewV1(jq) {
        this.view = $(jq[this.profile]);
        this.icon = this.view.find('.climber_icon');
        this.view.show();
        this.view.find('.type').html(this.type);
        this.updateView();
        this.view.off('click').on('click', () => {
//            jq.css({'z-index': 1});
//            this.view.css({'z-index': 10});
            this.toggleInfo();
        });
        let timer;
        const timeout = 1000;
        this.view.append(`<div class='climberDevIndicator'></div>`);
        this.view
            .on('mousedown touchstart', () => {
                timer = setTimeout(() => {
                    $('#output').text('Long-press action triggered!');
                    jq.css({'z-index': 1});
                    this.view.css({'z-index': 10});
                }, timeout);
            })
            .on('mouseup touchend mouseleave', function () {
                clearTimeout(timer); // Cancel the action if released early
            });
    }
    expandOptions() {
        this.options.forEach((o, n) => {
            o.n = n;
            if (this.getOption(n)) {
                o.option = this.getOption(n).toUpperCase();
            }
//            o.profile = this.profile;
        });
    }
    reset(cs) {
        this.setPosition(0);
        this.currentTime = 0;
        this.currentStage = 0;
        this.setCurrentSpeed(0);
        this.currentTimeObject = cs;
        this.setDelay(0);
        this.delayExpiry = 0;
        this.onDelayExpiry();
        this.resupplies = '';
        this.allDelays = '';
        this.finished = false;
        clearInterval(this.bounceInt);
        this.calculateClimbRate();
        this.resetAllInitial();
//        console.log(`${this.name} reset`);
//        console.log(cs);
//        console.log(this);
        this.updatePosition(cs);
        this.showPie(false);
        this.storeSummary();
    }
    zero(cs) {
//        console.log('zero');
        this.reset(cs);
        this.t1 = this.t2 = this.tTotal = null;
        this.type = -1;
        this.option = this.OPTION = null;
        this.oxygen = this.rope = this.sustenance = null;
        this.bounceFac = this.bounceInc = 0;
        this.unstoreSummary();
    }

    static allClimbers = [];
    static bounds = {y: 0, h: 0};
    displayProps = ['oxygen', 'sustenance'];
}
