document.addEventListener('DOMContentLoaded', function () {
    let session;
    let gameData;
    let devtoolsWin;
    let devtoolsCheck;
    let toolkitOpen = false;
    const launchToolkit = () => {
        devtoolsWin = window.open(
            `devtools?uniqueID=${session.uniqueID}&name=${session.name}`,
            `devtools`,
            'width=600,height=400'
        );
        toolkitOpen = true;
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
//            console.log(e.shiftKey);
//            console.log(e.key.toLowerCase());
            if (e.shiftKey && e.key.toLowerCase() === 't') {
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
        toolkitOpen = false;
        sessionStorage.removeItem('devtoolsWindow');
    };
    const bringToFront = (selector) => {
        let maxZ = 0;
        $('*').each(function() {
            const z = parseInt($(this).css('z-index'), 10);
            if (!isNaN(z)) {
                maxZ = Math.max(maxZ, z);
            }
        });
        $(selector).css('z-index', maxZ + 1);
    };

    const hideSessionID = () => {
        const panelName = 'idpanel';
        $(`#${panelName}`).remove();
    };
    const showSessionID = () => {
        const panelName = 'idpanel';
        const idString = `ID: ${session.uniqueID}`;
//        console.log(idString);
        if ($(`#${panelName}`).length === 0) {
            $('body').append(`<div class='fullscreen debugPanel' id='idpanel' style='display: none;'>${idString}<i class="fa fa-copy"></i><i class="fa fa-close"></i></div>`);
            $(`#${panelName}`).delay(1000).fadeIn();
            bringToFront(`#${panelName}`);
            $('.fa-close').off('click').on('click', () => {
                hideSessionID();
            });
            $('.fa-copy').off('click').on('click', () => {
                navigator.clipboard.writeText(session.uniqueID)
                    .then(() => {
                        const ret = $(`#${panelName}`).css('height');
                        $(`#${panelName}`).animate({height: '55px'}, 300);
                        setTimeout(() => {
                            $(`#${panelName}`).append(`<div id='note'><p>Copied to clipboard</p></div>`);
                            setTimeout(() => {
                                $(`#${panelName}`).animate({height: ret}, 300);
                                $(`#${panelName}`).find('#note').remove();
                            }, 2000);
                        }, 300);
                    })
                    .catch(err => {
                        console.error('Could not copy text: ', err);
                    });
            });
        }
    };
    const waitForSession = () => {
        // used in dev, shows session ID when available
        if (session) {
            showSessionID();
        } else {
            setTimeout(waitForSession, 100);
        }
    };
    const init = () => {
        window.tools = {
            setup: setup,
            toolkitClosed: toolkitClosed,
            toolkitOpen: toolkitOpen,
            showSessionID: showSessionID,
            hideSessionID: hideSessionID,
        };
//        waitForSession();
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
//        console.log(r);
        return r;
    };
    window.requestToolkitInfo = onToolkitRequest;
    init();
});
