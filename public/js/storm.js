class Storm {
    constructor(gameAPI) {
        this.gameAPI = gameAPI;
        this.setupView();
        window.flash = this.flashLightning;
        if (sessionStorage.getItem(this.STORE_TIME)) {
            this.time = JSON.parse(sessionStorage.getItem(this.STORE_TIME));
            this.checkDOM();
        } else {
            this.time = window.clone(this.timeZero);
        }

    }
    STORE_TIME = 'stormTime';
    STORE_CLOUDS = 'cloudSet';
    STORE_LIGHTNING = 'lightningStrikes';
    gameAPI;
    started = false;
    time;
    timeZero = {min: 1000, max: 1800, start: 0, current: 0, elapsed: 0, diff: 0, dec: 0};
    cloudPos = {};
    lightningStrikes;
    adjX = 430;
    adjY = 60;

    viewOverlay;
    viewSky;
    viewCloudsLeft;
    viewCloudsRight;

    start(t) {
        this.reset();
        this.time.start = t;
//        this.time.start = this.time.current;
        this.started = true;
        this.programLightning();
        this.setupClouds();
        this.updateView();
//        console.log(window.clone(this.time));
    };
    stop() {
        this.started = false;
//        console.log('storm stop');
        this.gameAPI.ender(false);
        this.clearStorage();
    };
    resetTime() {
        for (let i in this.time) {
            this.time[i] = this.timeZero[i];
        }
        sessionStorage.setItem(this.STORE_TIME, JSON.stringify(this.time));

//        console.log('onreset', window.clone(this.time));
    }
    reset() {
//        return;
        console.log('reset')
        this.started = false;
        this.resetTime();
        this.updateView();
        this.clearStorage();
//        this.viewSky.hide();
        if (this.viewCloudsLeft) {
            this.viewCloudsLeft.each((i, c) => {
                const w = c.getBoundingClientRect().width;
    //            console.log(w);
//                $(c).css({left: `${0 - w}px`});
            });
            this.viewCloudsRight.each((i, c) => {
                const w = c.getBoundingClientRect().width;
    //            console.log(w);
                $(c).css({right: `${0 - w}px`});
            });
    //        this.viewCloudsRight.css({right: '0px'});
        }
    };
    clearStorage() {
        sessionStorage.removeItem(this.STORE_LIGHTNING);
        sessionStorage.removeItem(this.STORE_TIME);
        sessionStorage.removeItem(this.STORE_CLOUDS);
        sessionStorage.clear();
    };
    checkDOM() {
//        console.log('check the DOM');
        if ($('.stormbg').length === 0) {
            setTimeout(() => {
                this.checkDOM();
            }, 500);
//            console.log('no storm, recheck');
        } else {
//            console.log('starting with', this.time);
//            console.log(this.time);
//            this.start(this.time.current);
            this.start(this.time.start);
//            this.start(this.time.elapsed);
        }
    };
    programLightning() {
        if (sessionStorage.getItem(this.STORE_LIGHTNING)) {
            this.lightningStrikes = sessionStorage.getItem(this.STORE_LIGHTNING).split(',');
        } else {
            this.lightningStrikes = [];
            const ls = Math.ceil(this.time.max / 300);
            const vari = this.time.max;
    //        console.log(`${ls} lightning strikes, one every ${this.time.max / ls}`);
            for (let i = 0; i < ls; i++) {
                const adjFac = this.time.max / ls;
                const adj = (i - ((ls - 1) / 2)) / ((ls - 1) / 2) * -1;
                this.lightningStrikes.push(((i * adjFac) + (Math.random() * (adj * adjFac))));
            }
            sessionStorage.setItem(this.STORE_LIGHTNING, this.lightningStrikes.toString());
        }
//        console.log(this.lightningStrikes);
    };
    flashLightning() {
        const l = $('.lightningzones');
        const flipTarget = $('#lightninggfx');
        const setFlashPattern = [40, 100, 100, 50, 40, 100, 40, 40, 100, 50, 50, 100, 130, 50];
        const flashPattern = setFlashPattern.sort(() => Math.random() - 0.5);

        let flipped = false;
        let totalTime = 0;
        flashPattern.forEach((delayTime, index) => {
            totalTime += delayTime;
            const timeout = setTimeout(() => {
                l.toggle();
                if (Math.random() > 0.75) {
                    flipped = !flipped;
                    flipTarget.toggleClass('flip-horizontal', flipped);
                }
            }, totalTime);
        });
    };


    getPosAdj(dir) {
        const fac = dir === 'x' ? this.adjX : this.adjY;
        return (Math.random() * fac) - (fac / 2);
    }
    setupView() {
//        console.log(`setupView`);
        this.viewOverlay = $('.mountain-overlay');
        this.viewSky = $('.stormbg');
        this.viewCloudsLeft = $('.cloudleft');
        this.viewCloudsRight = $('.cloudright');
        this.viewSky.show();
//        console.log(this.viewOverlay);
//        console.log(this.viewSky);
//        console.log(this.viewCloudsLeft);
//        console.log(this.viewCloudsRight);
    }
    setupClouds() {
        if (!$.isEmptyObject(JSON.parse(sessionStorage.getItem(this.STORE_CLOUDS)))) {
            this.cloudPos = JSON.parse(sessionStorage.getItem(this.STORE_CLOUDS));
        } else {
//            console.log('make new');
            const vw = $(window).width();
            const vh = $(window).height();
            this.viewCloudsLeft.each((i, c) => {
//                console.log(i, c);
                const w = c.getBoundingClientRect().width;
                const y = (i * ((vh / this.viewCloudsLeft.length) * 0.6)) + this.getPosAdj('y');
                this.cloudPos[`left${i}`] = {
                    xStart: 0 - w - (this.getPosAdj('x') * 2) - (this.adjX),
//                    xStart: 0 - w + 20,
                    xEnd: (vw / 2) - (w / 2) + this.getPosAdj('x'),
                    y: (i * ((vh / this.viewCloudsLeft.length) * 0.6)) + this.getPosAdj('y')
                }
            });
            this.viewCloudsRight.each((i, c) => {
//                console.log(i, c);
                const w = c.getBoundingClientRect().width;
                const y = (i * ((vh / this.viewCloudsRight.length) * 0.6)) + this.getPosAdj('y');
                this.cloudPos[`right${i}`] = {
                    xStart: 0 - w - (this.getPosAdj('x') * 2) - (this.adjX),
//                    xStart: 0 - w + 20,
                    xEnd: (vw / 2) - (w / 2) + this.getPosAdj('x'),
                    y: (i * ((vh / this.viewCloudsRight.length) * 0.6)) + this.getPosAdj('y')
                }
            });
            sessionStorage.setItem(this.STORE_CLOUDS, JSON.stringify(this.cloudPos));
        }
    }
    updateView() {
//        console.log('updateView', this.cloudPos);
//        console.log('updateView', this.viewCloudsLeft);
        if (this.viewSky) {
//            console.log('no sky, will not continue');
            this.viewSky.css({opacity: this.time.dec * 0.6});
//            return;
        };
        if ($.isEmptyObject(this.cloudPos)) {
//            console.log('no cp');
            this.setupClouds();
//            console.log(this.cloudPos)
        } else {
//            console.log('yes cp', this.cloudPos, $.isEmptyObject(this.cloudPos))
        }
        this.viewOverlay.css({'background-color': `rgba(0, 0, 0, ${this.time.dec * 0.5})`});
        this.viewCloudsLeft.show();
        this.viewCloudsRight.show();
        this.viewCloudsLeft.each((i, c) => {
            const p = this.cloudPos[`left${i}`];
//            console.log(i, this.time.dec, p);
            const x = p.xStart + ((p.xEnd - p.xStart) * this.time.dec);
//            const x = p ? p.xStart : 0;
            $(c).css({
                top: `${p.y}px`,
                left: `${x}px`
            });

        });
        this.viewCloudsRight.each((i, c) => {
            const p = this.cloudPos[`right${i}`];
            const x = p.xStart + ((p.xEnd - p.xStart) * this.time.dec);
            $(c).css({
                top: `${p.y}px`,
                right: `${x}px`
            });
        });
        if (this.lightningStrikes) {
            if (this.time.elapsed > this.lightningStrikes[0]) {
                this.flashLightning();
                this.lightningStrikes.shift();
                sessionStorage.setItem(this.STORE_LIGHTNING, this.lightningStrikes.toString());
            }
        }
    }
    updateTime(s) {
        if (this.started) {
            const T = this.time;
//            console.log('****************** updateTime ***********************', s);
//            console.log(window.clone(T));
            if (s - T.start > T.max && T.elapsed > 0) {
                // end condition
                s = T.max;
            }
            if (T.current !== 0) {
                T.diff = s - T.current;
            }

            T.elapsed = T.current - T.start;
            T.current = s;
            T.dec = T.elapsed / T.max;
            if (s === T.max) {
//                console.log(`END OF STORM`);
                T.elapsed = T.max;
                T.dec = 1;
                T.diff = 0;
                this.stop();

            }
            this.updateView();
            sessionStorage.setItem(this.STORE_TIME, JSON.stringify(T));
//            console.log(window.clone(T));
        }

    }
}
