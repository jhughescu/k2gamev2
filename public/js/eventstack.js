class EventStack {
    constructor(data) {
        this.gameData = data;
        this.allEvents = data.events;
        this.eventSummary = data.session.events;

        this.triggers = {};
        // this.processRandomEvents();
        this.processEvents();
        this.currentEvent;
        this.nextEvent;
        this.events = [];
        this.cMin = -1;
    }
    
    setEventSummary(es) {
        // called from main code when eventSummary is ready (can also occur at init)
        this.eventSummary = es;
        console.log('eventSummary set externally', this.eventSummary);
        this.processEvents();
        this.initSessionEvents(0);
        console.log(this.events);
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
    getEvent(n) {
        return this.allEvents[n];
    }
    getEvents() {
        // console.log(`getting ${this.allEvents.length} events`);
        // return 'foo';
        return this.allEvents;
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
    createEvent(e, i, r) {
        // create an individual event object
        const eCopy = JSON.parse(JSON.stringify(e));
        if (!r) {
            // no active event range specified, create a dummy range which includes all events
            r = Array(1000).fill(1);
        }
        e.active = e.hasOwnProperty('active') ? e.active : (i >= r[0] && i <= r[1]);
        e.next = false;
        e.current = false;
        e.complete = false;
        e.template = e.method === 'profileEvent' ? 'profile_event' : e.template ? e.template : null;
        e.noModal = !e.hasOwnProperty('noModal') ? false : e.noModal;
        e.n = i;
        e.eventTitle = e.hasOwnProperty('eventTitle') ? e.eventTitle : e.event.replace(/\d/g, '').replace(/^./, c => c.toUpperCase());
        if (e.event === 'photo') {
            e.modalIcon = e.type === 'storm' ? 'KillerStorm' : 'Camera';
        }
        if (e.hasOwnProperty('metrics')) {
            e.metrics = this.processMetrics(e.metrics)
        }
        // console.log(`event created: ${e}`, e.hasOwnProperty('probability') ? `with probability ${e.probability}` : '');
        return e;
    }
    processEvents() {
        // console.log('THIS IS PROCESS EVENTS', JSON.parse(JSON.stringify(this.gameData.session)));
        const r = this.gameData.activeEventRange;
        const re = this.getRandomEvents();
        // console.log(`processEvents: processing events with activeEventRange ${r} and random events`, re);
        if (this.allEvents) {
            // console.log(this.allEvents.length, 'events to process');
            // console.log(this.getRandomEvents().length, 'random events to process');
            // this.allEvents = this.allEvents.concat(this.getRandomEvents());
            this.allEvents.forEach((e, i) => {
                
                if (!e.hasOwnProperty('excludeFromGame')) {
                // if (!e.hasOwnProperty('excludeFromGame') && e.hasOwnProperty('probability')) {
                    // console.log(JSON.parse(JSON.stringify(e)));
                    e = this.createEvent(e, i, r);
                    this.triggers[`t${e.time}`] = e;
                } else {
                    this.allEvents.splice(i, 1);
                }
                if (re.length) {
                    const myRe = re.filter(re => re.n === e.n);
                    if (myRe.length) {
                        e.time = myRe[0].time;
                        e.active = myRe[0].active;
                    }
                }
            });
        } else {
            console.warn(`cannot process events; data model incomplete`);
        }
        // console.log('\n\n * * events processed', this.allEvents);
    }
    processAllEvents() {
        const re = this.processRandomEvents();
        const ae = this.processEvents();
        return ae;
    };
    processRandomEvents() {
        // console.log(`%cprocessRandomEvents: processing random events`, 'background-color: black; color: orange;');
        const re = this.allEvents.filter(e => e.probability);
        return re.map((e, i) => {
        //     console.log(i, JSON.parse(JSON.stringify(e)));
            let n = e.probability > Math.random();
            n = 1;
            const o = {
                active: n,
                time: 3 + (i * 5),
                // time: n ? Math.round(e.range[0] + Math.random() * (e.range[1] - e.range[0])) : -1
            };
            if (e.result.hasOwnProperty('good') && e.result.hasOwnProperty('bad')) {
                o.resultString = Math.random() > 0.5 ? `good` : `bad`;
            } else {
                o.resultString = 'good';
            }
            e = Object.assign(e, o);
            // console.log(JSON.parse(JSON.stringify(e)));
            return e;
        });
    };
    processRandomEventsV1() {
        // process any random events set in game data
        // CALLED BY scriptegame.js at session init, and the timings are stored in session data for use in getRandomEvents
        const re = this.gameData.randomEvents;
        let a = [];
        re.forEach(e => {
            e.probability = 1;
            const eTimes = this.allEvents.map(ev => ev.time);
            for (let t = e.range[0]; t <= e.range[1]; t += 0.5) {
                if (eTimes.includes(t)) {
                    // potential event clash
                    const ev = this.allEvents.find(ev => ev.time === t);
                    if (ev.noModal) {
                        // this is ok as the event will not trigger a modal, so can coexist with another event at the same time
                    } else {
                        console.warn(`random event "${e.event}" cannot be processed due to time conflict with another event at t=${t} minutes`);
                        console.log(ev);
                        return;
                    }
                    
                }            
            }
            const t = Math.round(e.range[0] + ((e.range[1] - e.range[0]) * Math.random()));
            const active = e.probability > Math.random();
            // console.log(`random event "${e.event}" processed with probability ${e.probability}, assigned time ${t} minutes, active: ${active}`);
            a.push({
                time: t,
                active: active,
            });
        });
        console.log('random events processed', a, this.gameData);
        return a;
    }
    getRandomEvents() {
        // NOTE: the session.eventsRandom data is derived from scriptgame.js as this script can set database properties. See the implementation of the updateSession method.
        // console.log(`getRandomEvents: getting random events from session data`);
        // return a set of the random events which includes the timings set in the processRandomEvents method, which should be called at session init and stored in the session data
        const re = this.gameData.randomEvents || [];
        const ret = this.gameData.session.eventsRandom || [];
        // console.log(`random events in game data`, re, JSON.parse(JSON.stringify(ret)));
        let out = [];
        if (ret.length) {
            for (let i = 0; i < ret.length; i++) {
                const ob = {
                    n: ret[i].n,
                    time: ret[i].time,
                    active: ret[i].active,
                    resultString: ret[i].resultString
                };
                const outEv = ob;
                if (re[i]) {
                    Object.assign(outEv, re[i]);
                }
                out.push(outEv);
            }
            
        }
        return out;
    }
    getRandomEventsV1() {
        console.log(`getRandomEvents: getting random events from session data`);
        // return a set of the random events which includes the timings set in the processRandomEvents method, which should be called at session init and stored in the session data
        const re = this.gameData.randomEvents || [];
        const ret = this.gameData.session.eventsRandom || [];
        console.log(`random events in game data`, re, ret);
        let out = [];
        if (ret.length) {
            for (let i = 0; i < ret.length; i++) {
                const ob = {
                    time: ret[i].time,
                    active: ret[i].active
                };
                const outEv = this.createEvent(Object.assign(re[i], ob), i);
                out.push(outEv);
            }
            
        }
        return out;
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
        if (parseInt(v) > parseInt(this.eventSummary[ev.n])) {
            this.eventSummary[ev.n] = v;
//            console.log(`updateSummary`, ev.n, v, this.eventSummary.toString());
        } else {
            console.warn(`cannot decrease event value`);
        }

//        console.log(`eventSummary: ${this.eventSummary}`);
        return this.eventSummary;
    }
    updateTime(o, cb) {
        // receives a time object AND a callback (eventTrigger) from main game code, checks if an event is triggered at that time, and if so sends it to the callback
//        console.log(`updateTime: OK to run? ${Boolean(this.events.length)}`);
        if (this.events.length) {
            const m = o.gametime.m;
            let e = false;
            e = this.triggers[`t${roundNumber(m, 1)}`];
            if (e) {
                // console.log(`eventSummary: ${this.eventSummary}`);
                if (this.eventSummary[e.n] < 2) {
                    this.currentEvent = e;
                    if (cb) {
                        cb(e);
                    }
                   console.log(`event ${e.event} CAN be called`);
                   console.log(e);
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
        console.log('resetEvents', this.eventSummary);
        return this.eventSummary;
    }
    onGameInterrupt(evArr) {
        this.clearCurrent();
        console.log('onGameInterrupt', evArr);
        this.eventSummary = evArr;
    }
    clearCurrent() {
        this.currentEvent = null;
    }
    getEventsNONONO() {
        return this.events;
    }
}
