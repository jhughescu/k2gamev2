class EventStack {
    constructor(data) {
        this.allEvents = data.events;
        this.processEvents();
        this.currentEvent;
        this.nextEvent;
//        this.setCurrentEvent(-1);
        this.events = [];
    }
    initSessionEvents(m) {
        // create a subset of events based on init timing
        // n is time in ms
        const copy = JSON.parse(JSON.stringify(this.allEvents));
        const out = [];
        copy.forEach(e => {
            if (e.time >= m) {
                out.push(e)
            }
        });
        this.events = out;
        console.log(`${this.events.length} event${this.events.length > 1 ? 's' : ''} remaining at ${roundNumber(m, 2)} minute${m > 1 ? 's' : ''}`);
    }
    getNextEvent() {
        let ne = false;
        if (this.events) {
            ne = this.events[0];
        }
//        console.log('getNextEvent', ne);
        return ne;
    }
    setCurrentEvent(n) {
        console.warn(`call to deprecated method (setCurrentEvent)`);
        return;
        this.events.forEach(e => {
            e.current = false,
            e.next = false
        });
        if (n > -1) {
            this.events[n].current = true;
            this.currentEvent = this.events[n];
        }
        if (n < this.events.length) {
            this.events[n + 1].next = true;
            this.nextEvent = this.events[n + 1];
        }
    }
    setCurrentEventFromTime(m) {
        console.warn(`call to deprecated method (setCurrentEventFromTime)`);
        return;
        for (let i = 0; i < this.events.length; i++) {
            const e = this.events[i];
            const ne = this.events[i + 1];
            if (m > e.time && m < ne.time)  {
                this.setCurrentEvent(i);
                break;
            }
        }
    }
    processEvents() {
        this.allEvents.forEach((e, i) => {
            e.next = false;
            e.current = false;
            e.complete = false;
            e.n = i;
        });
    }
    useEvent(cb) {
        // Uses the next event in the stack - removes it from the stack
        // Requires a callback, which sends the event to the calling object
        const e = this.events.shift();
        console.log(`event "${e.event}" used, ${this.events.length} events remaining`);
        if (cb) {
            cb(e);
        } else {
            console.warn(`useEvent (via updateTime) requires a callback`);
        }
    }
    updateTime(m, cb) {
        if (this.events.length) {
            const ne = this.getNextEvent();
            if (ne) {
                if (m > this.getNextEvent().time) {
    //                const e = this.getNextEvent();
                    this.useEvent(cb);
    //                cb(this.ne);
    //                this.setCurrentEvent(this.nextEvent.n);
                }
            } else {
                console.warn('next event not defined')
            }
        } else {
//            console.log('no events pending');
        }
    }
}
