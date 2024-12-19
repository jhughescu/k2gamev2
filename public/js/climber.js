class Climber {
    constructor(init) {
        if (init.hasOwnProperty('summaryString')) {
            const gd = init.gameData;
            const tm = init.team;
            init = this.unpackStorageSummary(init.summaryString);
            init.gameData = gd;
            init.team = tm;
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
        this.oxygen = init.hasOwnProperty('oxygen') ? init.oxygen : 0;
        this.sustenance = init.hasOwnProperty('sustenance') ? init.sustenance : 0;
        this.rope = init.hasOwnProperty('rope') ? init.rope : 0;
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

    log(s) {
//        if (this.profile === 0 || 2 < 8) {
        return;
        if (this.profile === 2) {
            if (typeof(s) === 'string' || typeof(s) === 'number') {
                console.log(`%c${this.name} %c${s}`, 'color: white;', 'color: yellow;');
            } else {
                console.log(`%c${this.name}:`, 'color: yellow;');
                console.log(s);
            }
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
            pos: 'position',
            st: 'currentStage',
            de: 'delayExpiry', /* delay is a time in minutes  */
            et: 'eventTime', /* if under the effect of an event, this is the time in minutes when the event occured */
        }
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
            this[p] = v;
            if (cb) {
                cb(this);
            }
        } else {
            const name = `set${p.substr(0, 1).toUpperCase()}${p.substr(1)}`;
            console.warn(`${name} requires a argument of type number`);
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
        this.setProperty('oxygen', n, cb);
    }
    setRope(n, cb) {
        this.setProperty('rope', n, cb);
    }
    setSustenance(n, cb) {
        this.setProperty('sustenance', n, cb);
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
                oo[m[v[0]]] = procVal(v[1]);
            }
        });
        return oo;
    }


    calculateClimbRate() {
        const r = this.gameData.route.ratio;
        const s = this.gameData.route.stages;
        const up = this.position <= r[0];
        const cs = this.currentStage;
        const tm = cs > 0 && cs < 3  ? this.t2 : this.t1; /* time to ascend/descend in minutes */
//        console.log(`using ${(cs > 0 && cs < 3  ? 't2' : 't1')} t1: ${this.t1} t2: ${this.t2}`);
        const ts = tm * 60; /* time to ascend/descend in seconds */
        const stage = s[cs];
        let rate = (100/4)/ts; /* distance travelled each second */
        if (isNaN(rate)) {
            rate = 0;
        }
//        console.log(`${this.name} calculateClimbRate based on t${cs} at ${tm} before: ${this.currentSpeed}, after: ${rate}`);
//        console.log(this.options[this.type]);
        if (!isNaN(rate)) {
            this.setCurrentSpeed(rate);
        }
//        this.currentStage += 1;
    }
    updatePosition(o, cb) {
//        console.log(`updatePosition`);
//        console.log(o);
        this.currentTimeObject = JSON.parse(JSON.stringify(o));
        const gt = this.currentTimeObject.gametime;
        if (!this.finished) {
            const d = o.sec - this.currentTime;
            const step = d * this.currentSpeed;
            this.currentTime = o.sec;
            if (this.position > this.gameData.route.stages[this.currentStage]) {
                // stage has changed; climb rate must be recalculated
                // Note: change the currentStage here NOT in the calculation method as that can be called at other times.
//                console.log(`calculateClimbRate, reset times if they have changed: ${this.t1}, ${this.t2}, ${this.currentStage}, ${this.options[this.type].t1}, ${this.options[this.type].t2}`);
                const adjustID = `t${this.currentStage}`;
                const adjusting = this[adjustID];
//                console.log(`adjusting ${adjustID} which is currently ${adjusting}, the updated value is ${this.options[this.type][adjustID]}`);
                // set the current t value to the predefined value, in case it has been adjusted by an event
//                this[adjustID] = this.options[this.type][adjustID];
                // reset all timings - adjusted timings do not persist across stages
                this.t1 = this.options[this.type].t1;
                this.t2 = this.options[this.type].t2;

                this.calculateClimbRate();
                this.currentStage += 1;
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
            this.log(`position: ${this.position}`);
            return this.position;
        }
    }
    updateViewFromTime(o) {
        if (!this.finished) {
//            console.log(`updateViewFromTime (input type: ${typeof(o)})`);
            this.log(o)
            this.updatePosition(o);
//            this.log(`time (${s}) sets pos: ${this.position}`);
            this.updateView();
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
//                this.log(this.position);
                if (this.position === 100) {
                    this.log(`updateView sets finished to true`);
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
//        this.log('reset sets finished to false');
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
