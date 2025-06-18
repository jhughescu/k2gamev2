document.addEventListener('DOMContentLoaded', function () {
    let session;
    let gameData;
    let devtoolsWin;
    let devtoolsCheck;
    const launchToolkit = () => {
        devtoolsWin = window.open(
            `devtools?uniqueID=${session.uniqueID}&name=${session.name}`,
            `devtools`,
            'width=600,height=400'
        );
        sessionStorage.setItem('devtoolsWindow', 'devTools');
        clearInterval(devtoolsCheck);
        devtoolsCheck = setInterval(checkForToolkit, 1000);
    };
    const setup = (sesh, gData) => {
//        console.log(`setup`, sesh);
//        console.log(`gameData`, gameData);
        session = sesh;
        gameData = gData;
        let isMouseDownOnElement = false;
        let T;
        const $el = $('#teamflag');
        $el.on('dragstart', function (ev) {
            ev.preventDefault();
        });
        $el.on('mousedown', function () {
            isMouseDownOnElement = true;
            T = Date.now();
        });
        $(document).on('mouseup', function (e) {
            if (isMouseDownOnElement && !$(e.target).closest($el).length) {
                const t = ((Date.now() - T) / 1000) > 2;
                if (t) {
                    launchToolkit();
                }
            }
            isMouseDownOnElement = false; // always reset
        });

        // Keyboard listener: Ctrl + T + K
        const pressedKeys = new Set();

        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 't') {
                e.preventDefault(); // Optional: prevent any default behavior
                launchToolkit();
            }
        });
        document.addEventListener('keyup', (e) => {
            pressedKeys.delete(e.key.toLowerCase());
        });
        devtoolsOnInit();
    };
    const checkForToolkit = () => {
//        console.log(devtoolsWin);
        if (devtoolsWin) {
            if (devtoolsWin.closed) {
                sessionStorage.removeItem('devtoolsWindow');
                clearInterval(devtoolsCheck);
            }
        }
    };
    const devtoolsOnInit = () => {
        const winName = sessionStorage.getItem('devtoolsWindow');
        if (winName) {
            devtoolsWin = window.open(
                `devtools?uniqueID=${session.uniqueID}&name=${session.name}`,
                `devtools`,
                'width=600,height=400'
            );
            clearInterval(devtoolsCheck);
            devtoolsCheck = setInterval(checkForToolkit, 1000);
            if (devtoolsWin && !devtoolsWin.closed) {
//                devtoolsWin.postMessage({
//                    type: 'session',
//                    content: JSON.stringify(session)
//                }, '*');
            } else {
//                console.log('Debug window is closed or unavailable');
            }
        }

    };
    const toolkitClosed = () => {
//        console.log('toolkit closed');
        sessionStorage.removeItem('devtoolsWindow');
    };
    const init = () => {

        window.tools = {
            setup: setup,
            toolkitClosed: toolkitClosed
        };
//        devtoolsOnInit();
    };
    const onToolkitRequest = (id) => {
//        console.log(id);
//        console.log(session);
//        console.log(window.getToolkitInfo());
        let r = {};
        if (session) {
            r = id === session.uniqueID ? session : {};

            Object.assign(r, window.getToolkitInfo());
            r.gameData = gameData;
        }
        console.log(r);
        return r;
    };
    window.requestToolkitInfo = onToolkitRequest;
    init();
});
