document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'session.admin'
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


    const deleteSession = (id) => {
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
        console.log('##################')
        display.html('');
        sessions.forEach(s => {
            display.append(`<p class='sClick' id='${s._id}'>${s.name}</p>`);
        });
        const sClick = $('.sClick');
        sClick.off('click').on('click', function () {
            const id = $(this).attr('id');
            console.log(`try to delete ${id}`);
            deleteSession(id);
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
        console.log('he er');
        getAllSessions();
    };
    init();
});
