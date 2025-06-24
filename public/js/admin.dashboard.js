document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'admin.dashboard'
        }
    });

//    const documentId = '6763417558a5471d1c0f12ea';
//    const uri = process.env.MONGODB_URI;
    const dbName = "k2gamedevv2local";
    const collectionName = "sessions";

    let sessions = null;

    const getData = () => {
        socket.emit('getData', (s) => {
            //            console.log('got data');
            //            console.log(s);
            data = s;

        });
    };


    const showSession = (id) => {
        socket.emit('getSession', dbName, collectionName, id, (err, msg) => {
            if (err === null) {
                console.log(msg);
//                getAllSessions();
            } else {
                console.warn(err);
            }
        })
    }
    const deleteSession = (id) => {
        // add some sort of warning!
        socket.emit('deleteSession', dbName, collectionName, id, (err, msg) => {
            if (err === null) {
                console.log(msg);
                getAllSessions();
            } else {
                console.warn(err);
            }
        })
    }
    const showSessions = () => {
        const display = $('#sessions');

        display.html('');
        sessions.forEach(s => {
            const eid = `s_${s._id}`;
            display.append(`<p class='sClick' id='${eid}'>${s.uniqueID}: ${s.name}</p>`);
            const e = $(`#${eid}`);
            e.data('session', s);
//            console.log(s.quiz.length > 0);
            let S = null;
            if (s.quiz) {
                if (s.quiz.length) {
                    S = s;
                } else {
                    console.log(`${s.uniqueID} has no quiz scores`);
                }
            } else {
                console.log(`${s.uniqueID} has no quiz`);
            }
            if (S) {
                console.log(S);
            }
        });
        const sClick = $('.sClick');
        sClick.off('click').on('click', function () {
            const id = $(this).attr('id');
//            console.log(`show session ${id}`);
//            showSession(id);
            console.log($(this).data('session').state);
            console.log($(this).data('session'));
        })
    }
    const getAllSessions = () => {
        socket.emit('getAllSessions', dbName, collectionName, (err, r) => {
            if (err === null) {
//                console.log('got', r);
                sessions = r;
                showSessions();
            } else {
                console.warn(err);
            }
        });
    }

    const init = () => {
        getAllSessions();
    };
    init();
});
