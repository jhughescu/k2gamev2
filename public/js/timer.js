class GameTimer {
    constructor() {
        this.startTime = null;
        this.elapsedTime = 0;
        this.interval = null;
        this.isRunning = false;
        this.hasStarted = false;
        this.hour = 3600000;
        this.minute = 60000;
        this.int = 1000;
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

    startTimer() {
        if (this.isRunning) return; // Prevent multiple intervals
//        console.log('####################### startTimer')
        this.startTime = Date.now();
        this.elapsedTime = 0;
        this.hasStarted = true;
        this.isRunning = true;

        this.interval = setInterval(() => {
            const currentTime = Date.now();
            this.elapsedTime = currentTime - this.startTime;
            this.updateDisplay(this.elapsedTime);
        }, this.int); // Update every 100ms or as needed
    }

    pauseTimer() {
        if (!this.isRunning) return;

        clearInterval(this.interval);
        this.isRunning = false;

        const currentTime = Date.now();
        this.elapsedTime = currentTime - this.startTime;
    }

    resumeTimer() {
        if (this.isRunning) return; // Prevent multiple intervals

        this.startTime = Date.now() - this.elapsedTime;
        this.isRunning = true;
        this.hasStarted = true;
        this.interval = setInterval(() => {
            const currentTime = Date.now();
            this.elapsedTime = currentTime - this.startTime;
            this.updateDisplay(this.elapsedTime);
        }, this.int); // Update every 100ms or as needed
//        console.log(`resumeTimer`, this)
    }

    resetTimer() {
        clearInterval(this.interval);
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
