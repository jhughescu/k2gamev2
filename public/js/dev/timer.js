class DevTimer {
    constructor() {
        this.viewReal;
        this.viewGame;
        this.viewSession;
        this.setViews();
    }
    setViews() {
        this.viewReal = $(`#timereal`);
        this.viewGame = $(`#timegame`);
        this.viewSession = $(`#timesession`);
        this.viewMinutes = $('#minutesgame');
    }
    padNum(n) {
        return n < 10 ? `0${n}` : n;
    }
    updateTime(cs) {
//        console.log(cs);
        const realSecAdj = cs.realtime.s - (Math.floor(cs.realtime.m) * 60);
        const seshSecAdj = cs.sessiontime.s - (Math.floor(cs.sessiontime.m) * 60);
        const p = this.padNum;
        this.viewReal.html(`${p(Math.floor(cs.realtime.m))}:${p(Math.floor(realSecAdj))}`);
        this.viewSession.html(`${p(Math.floor(cs.sessiontime.m))}:${p(Math.floor(seshSecAdj))}`);
        this.viewGame.html(cs.gametimeDisplay);
        this.viewMinutes.html(roundNumber(cs.gametime.m, 2));
    }
}
