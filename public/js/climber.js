class Climber {
    constructor(init) {
        if (init.hasOwnProperty('summaryString')) {
//            console.log(init);
            const gd = init.gameData;
            const tm = init.team;
            init = this.unpackStorageSummary(init.summaryString);
            init.gameData = gd;
            init.team = tm;
//            console.log(init)
        }
//        console.log(init);
        this.gameData = init.gameData;
        this.profile = init.profile;
        if (init.type > -1) {
//            console.log(`init.type: ${init.type}`);
//            console.log(`option: ${this.getOption(init.type)}`);
            this.option = this.getOption(init.type);
            this.OPTION = this.getOption(init.type).toUpperCase();
        }
        this.options = Object.values(this.gameData.profiles[`profile_${this.profile}`]);
        this.expandOptions();
        this.option = this.getOption(init.profile);
        this.OPTION = this.getOption(init.profile).toUpperCase();
        this.name = init.team.profiles[`p${init.profile}`];
        this.filename = this.name.replace(' ', '');
        const stored = Object.assign({position: init.position, currentTime: 0}, this.unpackStorageSummary(this.getStoredSummary()));
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
//            console.warn(' a climber with that profile already exists');
//            console.log(this);
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
//        console.log('zeroAll');
//        console.log(Climber.allClimbers);
        this.allClimbers = [];
//        console.log(Climber.allClimbers);
    }
    static setBounds(y, h) {
        Climber.bounds.h = h;
//        console.log(`setBounds`, Climber.bounds);
    }
    static setViews(jq) {
//        console.log(`setViews - static`);
        Climber.allClimbers.forEach(c => {
            c.setView(jq);
        });
    }
    static updateViews(s) {
//        console.log(`updateViews - static, s: ${s}`);
        if (s === undefined) {
            console.warn(`no 's' value supplied, updates will fail`);
        }
        const active = Climber.getClimbers().filter(c => !c.finished);
        active.forEach(c => {
            c.updateViewFromTime(s);
        });
    }
    static test() {
//        console.log(`test`);
//        console.log(Climber.allClimbers[0].gameData.timer);
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
//        console.log(this.routeMap);
    }

    log(s) {
        if (this.profile === 0) {
            console.log(s);
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
            st: 'currentStage'
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
//            console.log(`set ${p} to ${v}, typeof: ${typeof(v)}`);
            if (cb) {
                cb(this);
            }
        } else {
            const name = `set${p.substr(0, 1).toUpperCase()}${p.substr(1)}`;
            console.warn(`${name} requires a argument of type number`);
        }
    }
    setType(n, cb) {
//        console.log('setType');
        this.setProperty('type', n, cb);
        this.options = Object.values(this.gameData.profiles[`profile_${this.profile}`]);
//        console.log(this.options);
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
    // storage/summarising
    storeSummary() {
        const ss = this.getStorageSummary();
//        console.log(`storeSummary:`);
//        console.log(ss);
        localStorage.setItem(`${this.gameData.storeID}-c${this.profile}`, ss);
    }
    unstoreSummary() {
        localStorage.removeItem(`${this.gameData.storeID}-c${this.profile}`);
    }
    getStoredSummary() {
        const s = `${this.gameData.storeID}-c${this.profile}`;
//        console.log(s);
        const ss = localStorage.getItem(s) ? localStorage.getItem(s) : '';
//        console.log(ss);
//        console.log(this.profile);
//        console.log(this.position);
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
//        console.log(`p: ${this.profile}, timeM: ${tm}, timeS: ${ts}, currentStage: ${cs}, stage: ${stage}, rate: ${rate}`);
        this.currentStage += 1;
    }
    updatePosition(t, cb) {
        if (!this.finished) {
            const d = t - this.currentTime;
            const step = d * this.currentSpeed;
            this.currentTime = t;
            if (this.position > this.gameData.route.stages[this.currentStage]) {
                this.calculateClimbRate();
                if (cb) {
                    cb('reset');
                }
            }
            if (this.position + step < 100) {
                this.position += step;
                const r = Math.round(Math.random() * 10);
            } else {

                this.position = 100;
            }
            return this.position;
        }
    }
    updateViewFromTime(s) {
        if (!this.finished) {
//            this.log(`updateViewFromTime: ${s}, finished? ${this.finished}`);
            this.updatePosition(s);
    //        this.log(`time (${s}) sets pos: ${this.position}`);
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
//        console.log(zp)
        return zp;
    }
    //
    updateView() {
//        console.log(this.view.length);
        if (this.view.length && Climber.routeMap) {
//            console.log('ok to go');
            // only run if view has been correctly defined
            const H = Climber.bounds.h;
    //        this.log(`updateView ${this.name} (positions view based on this.position) ${this.finished ? ' - but I am finished' : ''}, H: ${H}`);
    //        if (!this.finished && H !== 0) {
    //        if (!this.finished) {
                let pos = (H / 50) * this.position;
    //            console.log(Climber.bounds)
    //            this.log(`prior; pos calculated as ${pos} with position: ${this.position}, H/50: ${H / 50}`);
                if (this.position > 50) {
                    pos = H - (pos - H);
                }
    //            console.log(`prior; pos calculated as ${pos} with position: ${this.position}`);
                if (this.position === 100) {
                    this.showFinished();
                    this.finished = true;
                }
                const scaleFactor = 200;
                const div = pos === 0 & H === 0 ? 0 : pos / H;
    //            console.log(Climber.routeMap);
                const xFactor = Climber.routeMap[roundNumber(div * 100, 2)] * scaleFactor;
                const xAdj = (-50 + (this.profile * 50)) * (1 - div);
    //            console.log(xAdj, div);
    //            const xAdj = 1 - (pos / H);
                const x = `${150 + (xFactor) + xAdj}px`;
                const y = `${pos}px`;
                let str = `updateView : ${this.profile} ${this.view.attr('id')} visible? ${this.view.is(':visible')}, set y to ${y} at p=${this.position}`;
                str += ` ${this.view.is(':visible') ? this.view.position().top : ''}`;
    //            console.log(str);
    //            console.log(x, y, this.position, this.view);
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
//        console.log(this.view);
        this.icon = this.view.find('.climber_icon');
        this.view.show();
        this.view.find('.type').html(this.type);
//        console.log('setView');
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
        clearInterval(this.bounceInt);
        this.calculateClimbRate();
        this.updatePosition(0);
    }
    zero() {
        this.reset();
        this.t1 = this.t2 = this.tTotal = null;
        this.type = -1;
        this.option = this.OPTION = null;
        this.oxygen = this.rope = this.sustenance = null;
        this.bounceFac = this.bounceInc = 0;
        this.unstoreSummary();
//        console.log('zeroed:')
//        console.log(this)
    }

    static allClimbers = [];
    static bounds = {y: 0, h: 0};
}
