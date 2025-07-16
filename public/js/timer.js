class GameTimer {
    constructor() {
        this.startTime = null;
        this.elapsedTime = 0;
        this.interval = null;
        this.isRunning = false;
        this.hasStarted = false;
        this.hour = 3600000;
        this.minute = 60000;
//        this.int = 50;
        this.storageTimer = {funk: null, int: 1000}
        this.assessor = {funk: null, int: 1000};
        this.assessReport = {};
        this.rate = {min: 50, max: 500, step: 5, int: 80, test: 80, zero: 0, now: 0, diff: 0, diffMin: 99999999, diffMax: 0};
    }

    getHourInMilli(n) {
//        console.log(n, this.hour);
        return this.hour * n;
    }
    getHoursFromMilli(n) {
        return n / this.hour;
    }
    getMinutesFromMilli(n) {
        return n / this.minute;
    }
    storageUpdater() {
        // hooked by other classes
    };
    assessInterval() {
        // tests the interval rate and applies
        const currentTime = Date.now();
        const r = this.rate;
        const l = 20; /* number of values for diff to average over */
        if (!r.diffHis) {
            r.diffHis = [];
        }
        r.diff = currentTime - r.zero;
        if (r.test > r.min) {
            // keep attempting to drive the interval to the minimum
            r.test = r.test / 1.01;
            if (r.test < (r.int - r.step)) {
                // at an integer restart the interval with reduced value
//                console.log(`%ctry to speed up the interval, change to ${Math.round(r.test)}, ${this.isRunning}`, 'color: yellow;');
                r.int = Math.round(r.test);
                if (this.isRunning) {
                    this.startIntervals();
                }
            }
        }
        if (r.diff < r.diffMin) {
            r.diffMin = r.diff;
        }
        if (r.diff > r.diffMax && r.diff < (r.int * 5)) {
            r.diffMax = r.diff;
        }
        if (r.diff < r.int * 10) {
            // ignore any very large values caused by pauses/restarts etc:
            r.diffHis.push(r.diff);
        }
        if (r.diffHis.length > l) {
            r.diffHis.shift();
        }
        r.diffAv = r.diffHis.reduce((s, v) => s + v, 0) / r.diffHis.length;
        if (r.diffAv > r.int * 2) {
            r.int = r.test = Math.round(r.int + r.step);
//            console.warn(`average rate has dropped to ${r.diffAv}, adjust it by ${r.step} to ${r.int}`);
            r.diffHis.length = 0;
            if (this.isRunning) {
                this.startIntervals();
            }
//            clearInterval(this.interval);
//            this.interval = setInterval(() => {
//                this.intervalMethod();
//            }, this.rate.int);
        }

        this.assessReport = JSON.stringify({int: r.int, test: r.test, min: r.diffMin, max: r.diffMax, av: Math.round(r.diffAv)});
        r.zero = currentTime;
    }
    intervalMethod() {
        const currentTime = Date.now();
        this.elapsedTime = currentTime - this.startTime;
        this.updateDisplay(this.elapsedTime);
        //
        this.assessInterval();
    }
    startIntervals() {
//        console.warn(`startIntervals`);
        this.rate.test = this.rate.int;
        clearInterval(this.interval);
        this.interval = setInterval(() => {
            this.intervalMethod();
        }, this.rate.int);
//        console.log(`start the intervals with int ${this.rate.int}`);
        // write the report on a slower interval (& remove later, only required for dev)
        clearInterval(this.assessor.funk);
        this.assessor.funk = setInterval(() => {
            localStorage.setItem('gameUpdateInt', this.assessReport);
        }, this.assessor.int);
        // interval for updating localStorage - this will replace any localStorage setting on faster intervals
        clearInterval(this.storageTimer.funk);
        this.storageTimer.funk = setInterval(() => {
            this.storageUpdater();
        }, this.storageTimer.int);
    }
    stopIntervals() {
//        console.warn(`stopIntervals`);
        clearInterval(this.interval);
        clearInterval(this.assessor.funk);
        clearInterval(this.storageTimer.funk);
    }
    startTimer() {
        if (this.isRunning) return; // Prevent multiple intervals
        console.log('%C####################### startTimer', 'color: yellow;');
        this.startTime = Date.now();
        this.elapsedTime = 0;
        this.hasStarted = true;
        this.isRunning = true;
        this.startIntervals();
//        this.interval = setInterval(() => {
//            this.intervalMethod();
//        }, this.rate.int); // Update every 100ms or as needed
    }
    pauseTimer() {
        if (!this.isRunning) return;
        this.stopIntervals();
//        clearInterval(this.interval);
        this.isRunning = false;

        const currentTime = Date.now();
        this.elapsedTime = currentTime - this.startTime;
//        console.log('pause success', window.clone(this));
    }
    resumeTimer() {
        console.log('%c####################### RESUME TIMER', 'color: yellow;');
        if (this.isRunning) return; // Prevent multiple intervals

        this.startTime = Date.now() - this.elapsedTime;
        this.isRunning = true;
        this.hasStarted = true;
        this.startIntervals();
//        this.interval = setInterval(() => {
//            this.intervalMethod();
//        }, this.rate.int);
    }
    resetTimer() {
        this.stopIntervals();
//        clearInterval(this.interval);
        this.startTime = null;
        this.elapsedTime = 0;
        this.isRunning = false;
        this.hasStarted = false;
        this.updateDisplay(this.elapsedTime); // Reset display to 0
    }
    setTimer(n) {
        this.elapsedTime = n;
    }
    updateDisplay(time) {
        // Implement this to update your timer display in the UI
//        console.log(`Elapsed Time: ${time} ms`);
    }
    getSummary() {
        return {
            startTime: this.startTime,
            elapsedTime: this.elapsedTime,
            interval: this.interval ? "Active" : "Not Active",
            isRunning: this.isRunning,
            hasStarted: this.hasStarted
        }
    }
}
