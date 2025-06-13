document.addEventListener('DOMContentLoaded', function () {
    let session;
    let devtoolsWin;
    let devtoolsCheck;
    const setup = (sesh) => {
//        console.log(`setup`, sesh);
        session = sesh;
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
                    devtoolsWin = window.open(
                        `devtools?uniqueID=${session.uniqueID}&name=${session.name}`,
                        `devtools`,
                        'width=600,height=400'
                    );
                    sessionStorage.setItem('devtoolsWindow', 'devTools');
                    clearInterval(devtoolsCheck);
                    devtoolsCheck = setInterval(checkForToolkit, 1000);
                }
            }
            isMouseDownOnElement = false; // always reset
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
        }
        return r;
    };
    window.requestToolkitInfo = onToolkitRequest;
    init();
});
