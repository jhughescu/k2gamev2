class EventStack {
    constructor(data) {
        this.gameData = data;
        this.allEvents = data.events;
        this.eventSummary = data.session.events;

        this.triggers = {};
        this.processEvents();
//        console.log(this.triggers);
//        console.log('eventStack init:');
//        console.log(window.clone(this.gameData));
//        console.log(window.clone(this.eventSummary));
        this.currentEvent;
        this.nextEvent;
        this.events = [];
        this.cMin = -1;
    }
    setEventSummary(es) {
        // called from main code when eventSummary is ready (can also occur at init)
        this.eventSummary = es;
        this.processEvents();
        this.initSessionEvents(0);
    }
    initSessionEvents(m) {
        // create a subset of events based on init timing
        // n is time in ms
        const copy = JSON.parse(JSON.stringify(this.allEvents));
        const out = [];
        copy.forEach((e, i)=> {
            if (e.time >= m) {
                out.push(e);
            }
        });
        this.events = out;
//        console.log(`${this.events.length} event${this.events.length > 1 ? 's' : ''} remaining at ${roundNumber(m, 2)} minute${m > 1 ? 's' : ''}`);
//        console.log(this.events);
        const active = out.filter(e => e.active);
//        console.log(`${active.length} active event${active.length > 1 ? 's' : ''} remaining at ${roundNumber(m, 2)} minute${m > 1 ? 's' : ''}`);
//        console.log(active);

    }
    getNextEvent() {
        let ne = false;
        if (this.events) {
            ne = this.events[0];
        }
//        console.log('getNextEvent', ne);
        return ne;
    }
    getCurrentEvent() {
        return this.currentEvent;
    }
    processMetrics(m) {
        if (m.hasOwnProperty('results')) {
            m.results.forEach(r => {
//                console.log(r)
                Object.entries(r).forEach(p => {
                    if ($.isArray(p[1])) {
//                        console.log(r.penalties);
                        !r.penalties ? r.penalties = {} : '';
                        r.penalties[p[0]] = p[1];
                    }
                });
            });
        }
        if (m.hasOwnProperty('results')) {
//            console.log(m);
        }
        return m;
    }
    processEvents() {
        const r = this.gameData.activeEventRange;
        if (this.allEvents) {
            this.allEvents.forEach((e, i) => {
                e.active = i >= r[0] && i <= r[1];
                e.next = false;
                e.current = false;
                e.complete = false;
                e.template = e.method === 'profileEvent' ? 'profile_event' : null;
                e.n = i;
                if (e.hasOwnProperty('metrics')) {
                    e.metrics = this.processMetrics(e.metrics)
                }
                this.triggers[`t${e.time}`] = e;
            });
        } else {
            console.warn(`cannot process events; data model incomplete`);
        }
    }
    useEvent(cb) {
        // Uses the next event in the stack - removes it from the stack
        // Requires a callback, which sends the event to the calling object
        const e = this.events.shift();
//        console.log(`event "${e.event}" used, ${this.events.length} events remaining`);
        if (cb) {
            cb(e);
        } else {
            console.warn(`useEvent (via updateTime) requires a callback`);
        }
        return e;
    }
    updateSummary(ev, v) {
        // called from main game code
//        console.log(`updateSummary`, ev, v);
        this.eventSummary[ev.n] = v;
//        console.log(`eventSummary: ${this.eventSummary}`);
        return this.eventSummary;
    }
    updateTime(o, cb) {
        // receives a time object
//        console.log(`updateTime: OK to run? ${Boolean(this.events.length)}`);
        if (this.events.length) {
            const m = o.gametime.m;
            let e = false;
            e = this.triggers[`t${roundNumber(m, 1)}`];
            if (e) {
                if (this.eventSummary[e.n] < 2) {
                    this.currentEvent = e;
                    if (cb) {
                        cb(e);
                    }
                    return e;
                } else {
                    console.warn(`event ${e.event} has been called previously, cannot call again`);
                }
            }
            this.cMin = Math.floor(m);
        }
    }
    resetEvents() {
        this.eventSummary = new Array(this.events.length).fill(0);
//        console.log(this.eventSummary);
        return this.eventSummary;
    }
    getEvents() {
        return this.events;
    }
}
