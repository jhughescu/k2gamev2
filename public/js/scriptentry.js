document.addEventListener('DOMContentLoaded', function () {
    //    return;
    window.addEventListener('pageshow', function (event) {
        const isLandingPath = window.location.pathname === '/' || window.location.pathname === '/entry';
        if (isLandingPath && event.persisted) {
            window.location.reload();
        }
    });

    const isLegacyEntryPath = window.location.pathname === '/entry';
    if (isLegacyEntryPath) {
        const canonicalLandingUrl = `/${window.location.search}${window.location.hash}`;
        window.history.replaceState(window.history.state, '', canonicalLandingUrl);
    }
    const isEntryFallbackPage = isLegacyEntryPath || window.location.pathname === '/';

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
        bNew.fadeIn(300, ()  => {
            const T = window.getQueries().team;
//            console.log(T);
            if (T) {
//                console.log(`game?team=${T}`);
                bNew.find('a').attr('href', `game?team=${T}`);
            }
        });
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
//            console.log('the click');
            localStorage.clear();
        });
        if (window.getCheatState() && !isEntryFallbackPage) {
            setTimeout(() => {
//                console.log('auto go now');
                bNew.click();
                window.location.assign('/game');
            }, 2000);
        }
    };
    init();
});
