document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'logdisplay'
        }
    });
    //
    let data = null;
    let session = null;
    //
    const storeID = 'cuk2gamelogdisplay';
    const buttonStates = {};
    //
    const processList = (o) => {
        return o;
    };
    const renderList = () => {
        const d = Object.values(data).filter(r => r.id === session);
        const o = window.clone(processList({list: d, displaying: buttonStates}));
        const ao = {list: window.clone(d).filter(r => buttonStates[r.type])};
        window.renderTemplate('updatezone', 'dev.updates.list', ao, () => {});
    };
    const renderSessionButtonV1= (values) => {
        window.renderTemplate('menuzone', 'dev.updates.menu', {sessions: values}, () => {
            const bm = $('#menuzone').find('button');
            bm.off('click').on('click', function () {
                const s = $(this).html();
                session = s;
                renderList();
            })
            if (bm.length === 1) {
                $(bm[0]).click();
            }
        });
    };
    const renderSessionButtons = (values) => {
    window.renderTemplate('menuzone', 'dev.updates.menu', { sessions: values }, () => {
        const bm = $('#menuzone').find('button');

        // Restore button states from localStorage
        const savedStates = restoreState().buttonStates || {};

        bm.each(function () {
            const s = $(this).html();
            const key = `session_${s}`;

            // Load saved state if available, otherwise default to false
            buttonStates[key] = savedStates.hasOwnProperty(key) ? savedStates[key] : false;

            // Apply visual state based on saved state
            $(this).toggleClass('active', buttonStates[key]);

            $(this).off('click').on('click', function () {
                session = s;

                // Reset all session buttons to inactive state
                bm.removeClass('active');
                Object.keys(buttonStates).forEach(k => {
                    if (k.startsWith('session_')) {
                        buttonStates[k] = false;
                    }
                });

                // Activate the clicked button
                buttonStates[key] = true;
                $(this).addClass('active');

                storeState(); // Save state after change
                renderList();
            });
        });

        // Restore the previously active session (if one exists)
        const activeSession = Object.keys(buttonStates).find(key => buttonStates[key] && key.includes('cuk2'));
        console.log(buttonStates, activeSession)
        if (activeSession) {
            const matchingButton = bm.filter((_, btn) => `session_${$(btn).html()}` === activeSession);
            if (matchingButton.length) {
                matchingButton.click();
            }
        } else if (bm.length === 1) {
            $(bm[0]).click();
        }
    });
};



    const findSessions = () => {
        const values = [];
        Object.values(data).forEach(d => {
            if (!values.includes(d.id)) {
                values.push(d.id);
            }
        });
        renderSessionButtons(values);
    };
    const processData = (d) => {
        Object.values(d).forEach(e => {
            e.date = e.timestamp.split('-')[0];
            e.time = e.timestamp.split('-')[1];
        });
        return d;
    };
    const getData = () => {
        socket.emit('getUpdateLogs', (d) => {
            data = processData(JSON.parse(d));
            if ($.isEmptyObject(data)) {
                $('#menuzone').html('No sessions found');
            } else {
                findSessions();
                setup();
            }
        })
    };
    const storeState = () => {
        localStorage.setItem(storeID, JSON.stringify({ buttonStates }));
    };
    const restoreState = () => {
        const storedState = localStorage.getItem(storeID);
        return storedState ? JSON.parse(storedState) : { buttonStates: {} };
    };

    const setup = () => {
        const bc = $('#clear');
        const ba = $('#archive');

        // Set up click event for "Clear" button
        bc.off('click').on('click', () => {
            socket.emit('resetUpdates', () => {});
        });

        // Set up click event for "Archive" button
        ba.off('click').on('click', () => {
            socket.emit('archiveUpdates', (msg, err) => {
                alert(msg);
                if (err) {
                    console.log(err);
                }
            });
        });

        // Restore state from localStorage (ensuring buttonStates is always an object)
        const savedStates = restoreState().buttonStates || {};

        $("[id^='filter_']").each(function () {
            const key = this.id.replace("filter_", "");

            // Load saved state if available, otherwise default to true
            buttonStates[key] = savedStates.hasOwnProperty(key) ? savedStates[key] : true;

            // Apply visual state based on saved state
            $(this).toggleClass("active", buttonStates[key]);

            // Set up click event for each button
            $(this).on("click", function () {
                buttonStates[key] = !buttonStates[key]; // Toggle state
                $(this).toggleClass("active", buttonStates[key]); // Toggle visual state
                renderList();
                storeState(); // Save state after change
            });
        });
    };

    const init = () => {

        getData();
    };
    init();
});
