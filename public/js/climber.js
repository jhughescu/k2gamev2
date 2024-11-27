class Climber {
//    static allClimbers = [];
    constructor(init) {
//        console.log(`new climber, type of init: ${typeof(init)}`);
//        console.log(`new climber, from string? ${init.hasOwnProperty('summaryString')}`);
//        if (typeof(init) === 'string') {
//            init = this.unpackStorageSummary(init);
//        }

        if (init.hasOwnProperty('summaryString')) {
            const gd = init.gameData;
            init = this.unpackStorageSummary(init.summaryString);
            init.gameData = gd;

        }

        this.gameData = init.gameData;
        this.profile = init.profile;
        const stored = Object.assign({position: init.position, currentTime: 0}, this.unpackStorageSummary(this.getStoredSummary()));
//        console.log(this.getStoredSummary());
//        console.log(init);
//        console.log(stored);
        this.type = init.type;
        this.capacity = init.capacity;
        this.t1 = init.t1;
        this.t2 = init.t2;
        this.currentSpeed = 0;
        this.oxygen = 0;
        this.sustenance = 0;
        this.rope = 0;
        this.position = stored.position > 0 ? stored.position : 0;
        this.currentTime = stored.currentTime > 0 ? stored.currentTime : 0;
        this.currentStage = 0;
        this.view = null;
//        console.log('init', init);
//        console.log(this);
        this.calculateClimbRate();
        Climber.allClimbers.push(this);
//        console.log('climber added');
//        console.log(this.getStorageSummary());
//        this.updateView();
    }

    static resetAll() {
        Climber.allClimbers.forEach(c => {
            c.reset();
        })
    }
    static setBounds(y, h) {
        Climber.bounds.h = h;
//        console.log(Climber.bounds);
    }
    static updateViews(s) {
        Climber.allClimbers.forEach(c => {
            c.updateViewFromTime(s);
        });
    }
    static test() {
//        console.log(`test`);
//        console.log(Climber.allClimbers[0].gameData.timer);
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
    // sets
    setProperty(p, v) {
        if (typeof(v) === 'number') {
            this[p] = v;
        } else {
            const name = `set${p.substr(0, 1).toUpperCase()}${p.substr(1)}`;
            console.warn(`${name} requires a argument of type number`);
        }
    }
    setOxygen(n) {
        this.setProperty('oxygen', n);
    }
    setRope(n) {
        this.setProperty('rope', n);
    }
    setSustenance(n) {
        this.setProperty('sustenance', n);
    }
    setPosition(n) {
        this.setProperty('position', n);
    }
    setCurrentSpeed(n) {
        this.setProperty('currentSpeed', n);
    }
    // storage/summarising
    storeSummary() {
        localStorage.setItem(`${this.gameData.storeID}-c${this.profile}`, this.getStorageSummary());
    }
    getStoredSummary() {
        const s = `${this.gameData.storeID}-c${this.profile}`;
//        console.log(s);
        return localStorage.getItem(s);
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
        this.setCurrentSpeed(rate);
//        console.log(`p: ${this.profile}, timeM: ${tm}, timeS: ${ts}, currentStage: ${cs}, stage: ${stage}, rate: ${rate}`);
        this.currentStage += 1;
    }
    updatePosition(t, cb) {
        const d = t - this.currentTime;
        const step = d * this.currentSpeed;
//        this.log(`updatePosition, t(input): ${t}, currentTime(internal): ${this.currentTime}, d: ${d}, step: ${step}`);
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
    updateViewFromTime(s) {
        this.updatePosition(s);
//        this.log(`time (${s}) sets pos: ${this.position}`);
        this.updateView();
    }
    updateView() {
//        this.log(`updateView, pos: ${this.position}, elapsed: ${this.gameData.timer.elapsedTime}`);
        const H = Climber.bounds.h;
        let pos = (H / 50) * this.position;
        if (this.position > 50) {
            pos = H - (pos - H);
        }
        this.view.css({bottom: `${pos}px`});
        this.storeSummary();
    }
    setView(jq) {
        this.view = $(jq[this.profile]);
        this.view.show();
        this.updateView();
    }
    reset() {
        this.setPosition(0);
        this.currentTime = 0;
        this.currentStage = 0;
        this.setCurrentSpeed(0);
        this.calculateClimbRate();
        this.updatePosition(0);
    }

    static allClimbers = [];
    static bounds = {y: 0, h: 0};
}
