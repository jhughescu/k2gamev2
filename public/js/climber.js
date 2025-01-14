class Climber {
    constructor(init) {
        if (init.hasOwnProperty('summaryString')) {
            const gd = init.gameData;
            const tm = init.team;
            init = this.unpackStorageSummary(init.summaryString);
//            console.log(`summary string: ${init.summaryString}`);
            init.gameData = gd;
            init.team = tm;
//            console.log(init);
        }
        this.gameData = init.gameData;
        this.profile = init.profile;
        if (init.type > -1) {
            this.option = this.getOption(init.type);
            this.OPTION = this.getOption(init.type).toUpperCase();
        }
        this.options = Object.values(this.gameData.profiles[`profile_${this.profile}`]);
        this.expandOptions();
        this.option = this.getOption(init.profile);
        this.OPTION = this.getOption(init.profile).toUpperCase();
        this.name = init.team.profiles[`p${init.profile}`];
        this.filename = this.name.replace(' ', '').replace(/[^a-zA-Z0-9]/g, '');
        const stored = Object.assign({position: init.position, currentTime: 0, delayExpiry: 0}, this.unpackStorageSummary(this.getStoredSummary()));
        this.type = init.type;
        this.capacity = init.capacity;
        this.t1 = init.t1;
        this.t2 = init.t2;
        this.tTotal = (this.t1 * 2) + (this.t2 * 2);
        this.currentSpeed = 0;
//        this.oxygen = init.hasOwnProperty('oxygen') ? init.oxygen : 0;
        this.oxygen = stored.hasOwnProperty('oxygen') ? stored.oxygen : 0;
//        this.sustenance = init.hasOwnProperty('sustenance') ? init.sustenance : 0;
        this.sustenance = stored.hasOwnProperty('sustenance') ? stored.sustenance : 0;
//        this.rope = init.hasOwnProperty('rope') ? init.rope : 0;
        this.rope = stored.hasOwnProperty('rope') ? stored.rope : 0;
        this.initialSettings = stored.hasOwnProperty('initialSettings') ? stored.initialSettings : '{}';
        this.position = stored.position > 0 ? stored.position : 0;
        // currentTime is a simple integer which can be written/read from the database
        this.currentTime = stored.currentTime > 0 ? stored.currentTime : 0;
        // currentTimeObject is a read-only object sent in by the game code (see updatePosition)
        this.currentTimeObject = {};
        // delay in minutes
        this.delayExpiry = stored.delayExpiry > 0 ? stored.delayExpiry : 0;
        this.eventTime = stored.eventTime > 0 ? stored.eventTime : 0;
        this.currentStage = 0;
        this.finished = false;
        this.view = null;
        this.icon = null;
        // finish bounce - may be removed later
        this.b = 0;
        this.bounceFac = 5 + (Math.random() * 21);
        this.bouncer = this.bouncer.bind(this);
        this.bounceInc = 5 + (Math.random() * 10);
        this.iconX = 100 + (this.profile * 0);
        this.calculateClimbRate();
        if (Climber.allClimbers.filter(c => c.profile === this.profile).length === 0) {
            Climber.allClimbers.push(this);
        } else {
            Climber.allClimbers[Climber.allClimbers.findIndex(e => e.profile === this.profile)] = this;
        }
//        console.log(this);
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
        }
        const active = Climber.getClimbers().filter(c => !c.finished);
        active.forEach(c => {
            c.updateViewFromTime(o);
        });
    }
    static test() {
        //
    }
    static getX(y) {
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
        return rtn;
    }
    static getClimbers() {
        return this.allClimbers;
    }
    static async getRouteMap(cb) {
        const response = await fetch('data/routemap.json');
        const data = await response.json();
        const bigData = {};
        this.routeMap = data;
        for (var i = 0; i < 100; i += 0.01) {
            bigData[roundNumber(i, 2)] = this.getX(i);
        }
        this.routeMap = bigData;
        if (cb) {
            cb();
        }
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
//        if (this.profile === 1 ) {
        if (this.profile === 1 || force) {
            if (typeof(s) === 'string' || typeof(s) === 'number') {
//                console.log(`%c${this.name} %c${s}`, 'color: white;', `color: ${colour};`);
                window.updateDevLog(`${this.OPTION} ${s} (${this.name.split(' ')[0]})`);
            } else {
//                console.log(`%c${this.name}:`, 'color: yellow;');
//                console.log(s);
            }
        }
    }
    console(s) {
        if (this.option === 'a') {
            console.log(s);
//            localStorage.setItem('timeElapsed', s);
        }
    }

    // gets
    getSummaryMap() {
        // mapped values to be stored in DB (store strings and numbers only, no objects etc)
        const m = {
            p: 'profile',
            t: 'type',
            c: 'capacity',
            t1: 't1',
            t2: 't2',
            cs: 'currentSpeed',
            ct: 'currentTime',
            o: 'oxygen',
            s: 'sustenance',
            r: 'rope',
            i: 'initialSettings',
            pos: 'position',
            st: 'currentStage',
            de: 'delayExpiry', /* delay is a time in minutes  */
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

    // sets
    setProperty(p, v, cb) {
        if (typeof(v) === 'number' && v !== NaN) {
//            console.log(`initial setting of ${p} to ${v}, which is ${this[p]}`);
            this.storeInitialSetting(p, v);
            if (v !== this[p]) {
                this.log(`set ${p} to ${this.prepForLog(v)}: ${this.prepForLog(this[p])} => ${this.prepForLog(v)}`, true);
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
        if (this[p]) {
//            console.log(`${this.name} ${p} change`, (this[p] + av), (this[p] + av) >= 0);
            if ((this[p] + av) >= 0) {
                // Values cannot be made negative:
    //            this.log(`adj ${p} by ${av}: ${this[p]} => ${this[p] + av}`, true);
                this[p] += av;
                if (cb) {
                    cb({prop: p, adj: av, res: this[p]});
                }
            } else {
//                console.log(`${this.name} ${p} change`, (this[p] + av), (this[p] + av) >= 0, 'no negative values allowed');
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
        this.option = this.getOption(n);
        this.OPTION = this.getOption(n).toUpperCase();
        this.storeSummary();
        if (cb) {
            cb(this);
        }
    }
    setOxygen(n, cb) {
//        console.log(`initial setting of oxygen for ${this.name}`);
        this.setProperty('oxygen', n, cb);
    }
    adjustOxygen(n, cb) {
        this.adjustProperty('oxygen', n, cb);
    }
    setRope(n, cb) {
//        console.log(`initial setting of rope for ${this.name}`);
        this.setProperty('rope', n, cb);
    }
    setSustenance(n, cb) {
//        console.log(`initial setting of sustenance for ${this.name}`);
        this.setProperty('sustenance', n, cb);
    }
    adjustSustenance(n, cb) {
        this.adjustProperty('sustenance', n, cb);
    }
    setPosition(n) {
        this.setProperty('position', n);
    }
    setCurrentSpeed(n) {
        this.setProperty('currentSpeed', n);
    }
    setDelay(n) {
        // a game event has sent a delay to this climber. Prevent updates until the delay (in minutes) has expired
        if (this.currentTimeObject) {
            if (this.currentTimeObject.gametime) {
                this.delayExpiry = this.currentTimeObject.gametime.m + n;
            } else {
                console.warn('cannot set delay; currentTimeObject not yet defined');
            }
        }
    }
    // storage/summarising
    storeSummary() {
        const ss = this.getStorageSummary();
        localStorage.setItem(`${this.gameData.storeID}-c${this.profile}`, ss);
    }
    unstoreSummary() {
        localStorage.removeItem(`${this.gameData.storeID}-c${this.profile}`);
    }
    getStoredSummary() {
        const s = `${this.gameData.storeID}-c${this.profile}`;
        const ss = localStorage.getItem(s) ? localStorage.getItem(s) : '';
        return ss;
    }
    getStorageSummary() {
        const m = this.getSummaryMap();
        let s = '';
        for (var i in m) {
            s += `_${i}:${this[m[i]]}`
        }
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


    calculateClimbRate() {
        const before = window.clone(this);
        const r = this.gameData.route.ratio;
        const s = this.gameData.route.stages;
        const up = this.position <= r[0];
        const cs = this.currentStage;
        const logic = cs > 1 && cs < 4;
        const tm = logic ? this.t2 : this.t1; /* time to ascend/descend in minutes */
//        this.log(` * * * currentStage is ${cs}, hence logic is ${logic}, therefore so we use ${(logic ? 't2' : 't1')};  t1 is ${this.t1}, t2 is ${this.t2}`);
        const ts = tm * 60; /* time to ascend/descend in seconds */
        const stage = s[cs];
        const tempRate = [window.clone(this).currentSpeed];
        let rate = (100 / 4) / ts; /* distance travelled each second */
//        this.log(`rate prior to calculation: ${this.currentSpeed}`);
//        this.log(`calculation: (100 / 4) / (${tm} * 60) = ${rate}`);
//        this.log(`calculation: (100 / 4) / ${ts} = ${rate}`);
        if (isNaN(rate)) {
            rate = 0;
        }
        tempRate.push(rate);
//        this.log(`${this.currentSpeed}, ${rate}, ${this.currentSpeed === rate}`, true);
        if (this.currentSpeed !== rate && this.currentSpeed !== 0) {
//            this.log(`${this.name}`, true);
//            this.log(`climb rate from ${roundNumber(this.currentSpeed, 4)} to ${roundNumber(rate, 4)}`, true);
//            this.log(`total time stage ${this.currentStage}: ${this.getStageTime().val} minutes (rate ${roundNumber(this.currentSpeed, 4)} => ${roundNumber(rate, 4)})`, true);
//            this.log(`obj: ${JSON.stringify(this.getStageTime())}`, true);
//            console.log('has the climber been updated?', this)
//            this.log(`calculateClimbRate based on t${cs} at ${tm} before: ${this.currentSpeed}, after: ${rate}`);
//            this.log(`speed change ${roundNumber(this.currentSpeed, 5)} => ${roundNumber(rate, 5)}`, true);
        }
//        this.log(tempRate.toString());
//        console.log(this.options[this.type]);
        if (!isNaN(rate)) {
            this.setCurrentSpeed(rate);
        }
//        console.log(`rate change ${logic ? before.t2 : before.t1} => ${logic ? this.t2 : this.t2} (${this.name})`, true);
//        this.log(`rate change ${logic ? before.t2 : before.t1} => ${logic ? this.t2 : this.t1}`, true);

//        console.log(`calculateClimbRate, rate: ${rate}`);
//        console.log(before);
//        console.log(this);
//        this.currentStage += 1;
    }
    updatePosition(o, cb) {
        this.currentTimeObject = JSON.parse(JSON.stringify(o));
        const gt = this.currentTimeObject.gametime;
        if (!this.finished) {
            const d = o.sec - this.currentTime;
            const step = d * this.currentSpeed;
            this.currentTime = o.sec;
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
                this.log(`moves from stage ${this.currentStage - 1} to ${this.currentStage}, will complete in ${this.getStageTime().val} minutes`);
                this.calculateClimbRate();
                window.climberUpdate(this);
                if (cb) {
                    cb('reset');
                }
            }
            if (this.position + step < 100) {
//                console.log(this.delayExpiry)
                if (this.delayExpiry > 0 && gt.m < this.delayExpiry) {
//                    console.log(`${this.name} is delayed here for ${this.delayExpiry - gt.m} minutes`);
                    // climber is delayed
                } else {
                    this.position += step;

                }
            } else {
                this.position = 100;
            }
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
        // Sustenance: per second depletion
        const currSustenance = this.sustenance;
        const depSustenance = 1 / (con.sustenance.unitTime * 60);
        this.adjustSustenance(-1 * (depSustenance * s));
        if (Math.ceil(this.oxygen) !== Math.ceil(currOxygen) && Math.ceil(this.oxygen) >= 0) {
            window.climberDepletionEvent(Object.assign(this, {resource: 'oxygen'}))
        }
        if (Math.ceil(this.sustenance) !== Math.ceil(currSustenance) && Math.ceil(this.sustenance) >= 0) {
            window.climberDepletionEvent(Object.assign(this, {resource: 'sustenance'}))
        }
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

    updateView() {
        if (this.view.length && Climber.routeMap) {
            // only run if view has been correctly defined
            const H = Climber.bounds.h;
            let pos = (H / 50) * this.position;
            if (this.position > 50) {
                pos = H - (pos - H);
            }
            if (this.position === 100) {
                this.showFinished();
                this.finished = true;
            }
            const scaleFactor = 200;
            const div = pos === 0 & H === 0 ? 0 : pos / H;
            const xFactor = Climber.routeMap[roundNumber(div * 100, 2)] * scaleFactor;
            const xAdj = (-50 + (this.profile * 50)) * (1 - div);
            const x = `${150 + (xFactor) + xAdj}px`;
            const y = `${pos}px`;
            let str = `updateView : ${this.profile} ${this.view.attr('id')} visible? ${this.view.is(':visible')}, set y to ${y} at p=${this.position}`;
            str += ` ${this.view.is(':visible') ? this.view.position().top : ''}`;
            // dev code: change colour of climbers based on their position on the expedition
            if (this.gameData.isDev) {
                const cs = this.currentStage;
                const cols = ['red', 'orange', 'yellow', 'green', 'blue']
                this.view.css({'background-color': cols[cs]});
            }
            //
            if (this.view.length > 0) {
                this.view.css({
                    bottom: y,
                    left: x
                });
            }
            this.storeSummary();
    //        }
        } else {
            if (this.view.length === 0) {
//                console.warn('updateView not possible: view not defined');
            } else {
//                console.warn(`updateView not possible: routeMap not defined`);
            }
        }
    }
    setView(jq) {
        this.view = $(jq[this.profile]);
        this.icon = this.view.find('.climber_icon');
        this.view.show();
        this.view.find('.type').html(this.type);
        this.updateView();
        this.view.off('click').on('click', function () {
            jq.css({'z-index': 1})
            $(this).css({'z-index': 10});
        });
    }
    expandOptions() {
        this.options.forEach((o, n) => {
            o.n = n;
            o.option = this.getOption(n).toUpperCase();
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
        this.finished = false;
        clearInterval(this.bounceInt);
        this.calculateClimbRate();
//        console.log('i bet this is the culprit');
//        console.log(cs);
        this.updatePosition(cs);
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
}
