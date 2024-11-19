class State {
    constructor(socket, session) {
        this.elapsedTime = 0;
        this.socket = socket;
        this.session = session;
    }
    storeTime(n) {
        this.elapsedTime = n;
//        console.log(this.socket);
//        console.log('go emit');
//        console.log(n);
        this.socket.emit('updateSession', {time: n, uniqueID: this.session.uniqueID});
    }

}
