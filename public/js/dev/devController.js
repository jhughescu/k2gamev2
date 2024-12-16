class DevController {
    constructor(data) {
//        console.log('devController init');
        this.data = data;
        this.setSessionMax;
//        console.log(this.data);
    }
    showStartup() {
//        alert(`gameTime is currently ${this.data.gameTime} minutes`);

    }
    setupGameTimeSelect() {
        const sub = $(`#gTimeSubmit`);
//        console.log(sub);
        const ob = {base: this, tree: 'pine]'};
        sub.off('click').on('click', (ev, ob) => {
            ev.preventDefault();
            const v = $(`#gTimeVal`).val();
//            console.log(v)
//            console.log(this)
//            console.log(ob)
            this.setSessionMax(parseInt(v));
        })
    }
}
