document.addEventListener('DOMContentLoaded', function () {
    //    return;
    const socket = io('', {
        query: {
            role: 'player'
        }
    });
    socket.on('disconnect', () => {

    });
    socket.on('handshakeCheck', (str) => {
//        console.log('please wait, checking connection', str);
        handshake = str;
        setTimeout(() => {
            checkSession();

        }, 100);
    });
    let handshake = null;

    const bContinue = $('#bContinue');
    const bNew = $('#bNew');
    const bHow = $('#bHow');

    const checkSession = () => {
        const gid = getStoreID();
        const lid = localStorage.getItem(gid);
        const continuing = Boolean(lid);
        bNew.fadeIn();
        bHow.fadeIn();
        if (continuing) {
            bContinue.fadeIn();
        }
    };
    const getStoreID = () => {
        const fudgeQ = window.getQuery('fudge');
        const fudgeID = fudgeQ ? `-${fudgeQ}` : '';
//        console.log(`fudgeID`, fudgeID);
        return `${handshake}${fudgeID}-id${getIdAdj()}`;
    };
    const getIdAdj = () => {
        const q = window.location.search;
        let a = '';
        if (q) {
            if (q.includes('fake')) {
                a = `-${q.replace('?', '').split('&').filter(s => s.includes('fake'))[0].split('=')[1]}`;
            }
        }
        return a;
    };
    const init = () => {
        bNew.off('click').on('click', (ev) => {
//            ev.preventDefault();
            localStorage.clear();
        });
    };
    init();
});
