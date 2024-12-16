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
        this.filename = this.name.replace(' ', '');
        const stored = Object.assign({position: init.position, currentTime: 0, delay: {d: 0, i: 0}}, this.unpackStorageSummary(this.getStoredSummary()));
        // timeObject contains various time values and is only ever supplied by the game code (read only)
        this.timeObject = null;
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

        this.currentTime = stored.currentTime > 0 ? stored.currentTime : 0;
        // delay is an object containing d: total delay and i: delay start time in minutes
        this.delay = stored.delay > 0 ? stored.delay : 0;
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

    static resetAll() {
        Climber.allClimbers.forEach(c => {
            c.reset();
        })
    }
    static zeroAll() {
        // More vigorous version of resetAll, nukes all values.
        Climber.allClimbers.forEach(c => {
            c.zero();
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
        if (this.profile === 0) {
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
            d: 'delay', /* delay is a time in minutes  */
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
        this.delay = n;
        console.log(`**  ${this.name} delayed for ${n} minutes at ${this.currentTime}`);
        console.log(this.timeObject);
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
        const ts = tm * 60; /* time to ascend/descend in seconds */
        const stage = s[cs];
        const rate = (100/4)/ts; /* distance travelled each second */
        if (!isNaN(rate)) {
            this.setCurrentSpeed(rate);
        }
        this.currentStage += 1;
    }
    updatePosition(o, cb) {
        this.log(`updatePosition`);
        this.log(o);
        if (!this.finished) {
            const d = o.sec - this.currentTime;
            const step = d * this.currentSpeed;
            this.currentTime = o.sec;
            this.timeObject = o;
            if (this.position > this.gameData.route.stages[this.currentStage]) {
                // stage has changed; climb rate must be recalculated
                this.calculateClimbRate();
                if (cb) {
                    cb('reset');
                }
            }
            if (this.position + step < 100) {
                if (this.delay === 0) {
                    this.position += step;
                    const r = Math.round(Math.random() * 10);
                } else {
//                    console.log(` * * * ${this.name} is currently delayed for ${this.delay} minutes`);
                }
            } else {

                this.position = 100;
            }
            this.log(`position: ${this.position}`);
            return this.position;
        }
    }
    updatePositionV1(t, cb) {
        if (!this.finished) {
//            this.log(`t: ${t}`);
            const d = t - this.currentTime;
            const step = d * this.currentSpeed;
            this.currentTime = t;
            this.log(this.currentTime / 60);
            if (this.position > this.gameData.route.stages[this.currentStage]) {
                // stage has changed; climb rate must be recalculated
                this.calculateClimbRate();
                if (cb) {
                    cb('reset');
                }
            }
            if (this.position + step < 100) {
                if (this.delay.d === 0) {
                    this.position += step;
                    const r = Math.round(Math.random() * 10);
                } else {
//                    console.log(`${this.name} is currently delayed for ${this.delay.d} minutes`);
                }
            } else {

                this.position = 100;
            }
            return this.position;
        }
    }
    updateViewFromTime(o) {
        if (!this.finished) {
            this.log(`updateViewFromTime (input type: ${typeof(o)})`);
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
    reset() {
        this.setPosition(0);
        this.currentTime = 0;
        this.currentStage = 0;
        this.setCurrentSpeed(0);
        this.finished = false;
        this.log('reset sets finished to false')
        clearInterval(this.bounceInt);
        this.calculateClimbRate();
        this.updatePosition({sec: 0});
    }
    zero() {
        this.reset();
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
