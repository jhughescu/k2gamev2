// ToyClimbers is a set of simple climber icons which can advance up the map, but do nothing else.
class ToyClimbers {
    constructor(init) {
        this.gameData = init.gameData;
        this.currentTimeObject = {};
        this.currentTime = null;
        this.counts = {teams: 12, climbers: 3};
        this.storeID = `${this.gameData.storeID}-toys`;
        this.interval = {funk: null, int: 100};
        this.toys = [];
        this.init();
    }
    init() {
        this.getRouteMap();
        const stored = this.checkForStored();
        if (!stored) {
            this.createToys();
        } else {
            this.toys = this.restoreToys();
            console.log(`${this.toys.length} toys restored`);
        }
//        this.renderView();
        this.intervalStart();
    }
    renderView() {
        if ($('.toyClimber').length === 0) {
            this.toys.forEach((t, i) => {
                $('#toyClimbers').append(`<div class='toyClimber' id='toyClimber${i}'>${i}</div>`);
            });
        }
    }
    getViewY(n) {
//        console.log(n, this.toys.length)
        const p = this.toys[n].p;
        const y = p < 50 ? 100 - (p * 2) : (p * 2) - 100;
        if (n === 1) {
//            console.log(p, y);
        }
        return y;
//        console.log(p)
    }
    getViewX(y) {
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
    test() {
        const ty = this.getViewY(2);
        const tx = this.getViewX(ty);
        console.log(ty, tx);
    };
    window.tester = this.test;
    intervalStart() {
        clearInterval(this.interval.funk);
        this.interval.funk = setInterval(this.toysUpdate.bind(this), this.interval.int);
    }
    intervalStop() {
        clearInterval(this.interval.funk);
    }
    getRate() {
        return 0.001 + window.roundNumber(Math.random() / 20, 3);
    }
    getStart() {
        return Math.round(Math.random() * 25);
    }
    createToys() {
        const c = this.counts;
        for (let i = 0; i < c.teams; i++) {
            for (let j = 0; j < c.climbers; j++) {
                const o = {r: this.getRate(), p: this.getStart()};
                this.toys.push(o);
            }
        }
        this.store();
        console.log(`${this.toys.length} toys created`);
    }
    restoreToys() {
        const s = JSON.parse(localStorage.getItem(this.storeID)).map(t => JSON.parse(t));
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
        return JSON.stringify(this.toys.map(t => JSON.stringify(t)));
    }
    store() {
        localStorage.setItem(this.storeID, this.packToys());
    }
    resetAll() {
        this.toys.map(t => t.p = 0);
    }



    static setBounds(y, h) {
        ToyClimber.bounds.h = h;
    }
    static updateViews(o) {
        if (o === undefined) {
            console.warn(`no 'o' value supplied, updates will fail`);
            return;
        }
        const active = ToyClimber.getClimbers().filter(c => !c.finished);
        active.forEach(c => {
            c.updateViewFromTime(o);
        });
    }


    static getToyClimbers() {
        return this.allToyClimbers;
    }
    async getRouteMap(cb) {
        const response = await fetch('data/routemap.json');
        const data = await response.json();
        const bigData = {};
        this.routeMap = data;
        for (var i = 0; i < 100; i += 0.01) {
            bigData[roundNumber(i, 2)] = this.getViewX(i);
        }
        this.routeMap = bigData;
//        console.log(this.routeMap);
        if (cb) {
            cb();
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
    toysUpdate() {
        // this is the interval update belonging to the ToyClimbers class - these don't need to be updated as frequently as the main game interval
        const cto = this.currentTimeObject;
        if (cto) {
            if (!$.isEmptyObject(cto)) {
                const gt = cto.gametime;
                const ct = this.currentTime || gt.s;
                const gap = gt.s - ct;

                if (gap > 0) {
//                    console.log(`ct: ${this.currentTime}, time gap in seconds: ${gap}`);
                    const v = $('.toyClimber');
//                    this.getViewY();
                    this.toys.forEach((t, i) => {
                        const inc = gap * t.r;
                        t.p = t.p + inc < 100 ? window.roundNumber(t.p + inc, 3) : 100;
                        const y = this.getViewY(i);
                        const x = this.getViewX(y);
                        $(v[i]).css({top: `${y}%`, right: `${x}px`});
                    });
//                    $(v[1]).css({top: `${this.getViewY(1)}%`});
                    this.store();
                }
                this.currentTime = gt.s;
            }
        } else {
            console.warn(`no cto`);
        }
    }
    update(o) {
        this.updateTime(o);
        this.updateView();
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
    updateView() {

    }
    reset(cs) {
        this.toys.forEach(t => t.p = 0);
        this.store();
    }

    static allToyClimbers = [];
    static bounds = {y: 0, h: 0};
}
