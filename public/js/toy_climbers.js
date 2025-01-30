class ToyClimbers {
    constructor(init) {
        this.gameData = init.gameData;
        this.currentTimeObject = {};
        this.currentTime = null;
        this.counts = {teams: 8, climbers: 3};
//        this.counts = {teams: 3, climbers: 1};
        this.storeID = `${this.gameData.storeID}-toys`;
        this.updateInterval = {funk: null, int: 50};
        // delayInterval is all about setting delays for the various toys, doesn't need to be as fast at the updateInterval
        this.delayInterval = {funk: null, int: 1000, c: 0};
        this.toys = [];
        this.delays = [];
        this.init();
    }
    async init() {
//        console.log('init the toys');
        this.theRouteMap = await this.getRouteMap();
        const stored = this.checkForStored();
        if (!stored) {
            this.createToys();
        } else {
            this.toys = this.restoreToys();
            this.delays = this.restoreDelays();
//            console.log(`${this.toys.length} toys restored`);
        }
        this.intervalStart();
    }
    renderView() {
        if ($('.toyClimber').length === 0) {
            this.toys.forEach((t, i) => {
                $('#toyClimbers').append(`<div class='toyClimber' id='toyClimber${i}'></div>`);
                this.updateView(i);
            });
        }
    }
    unrenderView() {
//        console.log(`unrender ${$('.toyClimber').length}`);
        $('.toyClimber').remove();
//        console.log(`unrender ${$('.toyClimber').length}`);
    }
    updateView(i, delayed) {
        // update an individual toy icon
        const v = $('.toyClimber');
        const y = this.getViewY(i);
        const x = (this.getViewX(y)) * 100;
        const adjPx = 170;
        // adjPx is a horizontal startpoint for the icons
        $(v[i]).css({
            bottom: `${y}%`,
            left: `calc(${x}% + ${adjPx}px)`,
            opacity: y ? 1 : 0
        });
        this.delays[i] > 0 ? $(v[i]).addClass('delayed') : $(v[i]).removeClass('delayed');
    }
    getViewY(n) {
        const p = this.toys[n].p;
        const y = p < 50 ? (p * 2) : 100 - ((p - 50) * 2);
        return Math.max(y, 0);
    }
    getViewX(y) {
        const rtn = this.theRouteMap ? this.theRouteMap[roundNumber(y, 2)] : 0;
//        const rtn = 0;

        return rtn;
    }
    intervalStart() {
        clearInterval(this.updateInterval.funk);
        this.updateInterval.funk = setInterval(this.toysUpdate.bind(this), this.updateInterval.int);
        clearInterval(this.delayInterval.funk);
        this.delayInterval.funk = setInterval(this.delayUpdate.bind(this), this.delayInterval.int);
        this.store();
    }
    intervalStop() {
        clearInterval(this.updateInterval.funk);
        clearInterval(this.delayInterval.funk);
        this.store();
    }
    getRate() {
//        return 0.001 + window.roundNumber(Math.random() / 20, 3);
        return window.roundNumber(0.01 + window.roundNumber(Math.random() / 40, 3), 3);
    }
    getStart() {
//        return 0;
        return Math.round(Math.random() * 25) - 12;
    }
    createToys() {
        const c = this.counts;
        for (let i = 0; i < c.teams; i++) {
            for (let j = 0; j < c.climbers; j++) {
                const s = this.getStart()
                const o = {r: this.getRate(), p: s, op: s};
                this.toys.push(o);
            }
        }
        // also create an array for storing delays
        this.delays = new Array(this.toys.length).fill(0);
//        console.log(this.delays)
        this.store();
//        console.log(`${this.toys.length} toys created`);
    }
    restoreToys() {
        const ls = JSON.parse(localStorage.getItem(this.storeID));
        const s = ls.toys.map(t => JSON.parse(t));
        return s;
    }
    restoreDelays() {
        const ls = JSON.parse(localStorage.getItem(this.storeID));
        const s = ls.delays.split(',');
        return s;
    }
    checkForStored() {
        let s = false;
        if (localStorage.getItem(this.storeID)) {
            s = localStorage.getItem(this.storeID);
        }
        return s;
    }
    packToys() {
        return this.toys.map(t => JSON.stringify(t));
//        return JSON.stringify(this.toys.map(t => JSON.stringify(t)));
    }
    store() {
        const o = {
            toys: this.packToys(),
            delays: this.delays.join(',')
        };
//        console.log('storing')
        localStorage.setItem(this.storeID, JSON.stringify(o));
    }
    unstore() {
        localStorage.removeItem(this.storeID);
    }
    resetAll() {
        this.toys.map(t => t.p = 0);
    }

    static setBounds(y, h) {
        ToyClimber.bounds.h = h;
    }

    async getRouteMap(cb) {
        if (Climber.routeMap) {
            if (this.theRouteMap === undefined) {
                this.theRouteMap = window.clone(Climber.routeMap);
//                console.log(`map length: ${Object.values(this.theRouteMap).length}`);
                this.toysUpdate(true);
                return;
                setInterval(() => {
                    console.log(`we have the map, run the update, map length: ${Object.values(this.theRouteMap).length}`);
                    this.toysUpdate();
                }, 1000);
            }
        } else {
            setTimeout(() => {
                this.getRouteMap();
            }, 200)
        }
    }


    // sets
    setProperty(p, v, cb) {
//        console.log(`setProperty: ${p}`);
        if (p === undefined) {
            return;
        }
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
    setPosition(n) {
        this.setProperty('position', n);
    }


    updateTime(o, cb) {
        const cto = JSON.parse(JSON.stringify(o));
        if (!$.isEmptyObject(cto)) {
            this.currentTimeObject = cto;
        }
        return;
        if (this.position + step < 100) {
            this.position += step;
        } else {
            this.position = 100;
        }
        return this.position;
    }
    toysUpdate(force) {
        // this is the interval update belonging to the ToyClimbers class - these don't need to be updated as frequently as the main game interval
        const cto = this.currentTimeObject;
        if (cto && this.toys.length) {
            if (!$.isEmptyObject(cto)) {
                const gt = cto.gametime;
                const ct = this.currentTime || gt.s;
                const gap = gt.s - ct;
                if (gap > 0 || force) {
                    this.toys.forEach((t, i) => {
                        const inc = gap * t.r;
                        if (this.delays[i] === 0) {
//                            console.log(`toy ${i} is under a delay, no update at this time (${this.delays.filter(n => n > 0).length} toys delayed)`);
                            t.p = t.p + inc < 100 ? window.roundNumber(t.p + inc, 3) : 100;
                        }
                        this.updateView(i, this.delays[i] === 0);
                    });
//                    this.store();
                }
                this.currentTime = gt.s;
            }
        } else {
            console.warn(`no cto (or toys)`);
        }
    }
    delayUpdate() {
        // randomly set delays and reduce all delays by 1 on each iteration
        const d = this.delays;
        const delayMax = 10;
        if (Math.random() > 0.3) {
            const r = Math.floor(Math.random() * d.length);
            if (d[r] === 0) {
                // don't further delay a delayed toy
                d[r] = 2 + Math.round(Math.random() * delayMax);
            }
        }
        this.delays = d.map(n => Math.max(n - 1, 0));
        // update storage on this interval rather than the faster update interval
        if ((this.delayInterval.c++)%3 === 0) {
            this.store();
        }
//        console.log(`${d.filter(n => n > 0).length} delay(s) set`);
    }
    update(o) {
        this.updateTime(o);
    }
    showFinished() {
        this.b = 270;
        this.bounceInt = setInterval(this.bouncer, 10);
    }
    getZeroPos() {
        const y = (ToyClimber.bounds.h * 1);
        const zp = {y: y};
        return zp;
    }
    reset(cs) {
//        this.toys.forEach(t => t.p = t.op);
//        console.log('reset')
        this.unstore();
        this.unrenderView();
        this.toys.length = 0;
        this.delays.length = 0;
        this.createToys();
        this.renderView();
        this.toysUpdate();
    }
    static bounds = {y: 0, h: 0};

}
