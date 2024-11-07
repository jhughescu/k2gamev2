document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const clientData = {role: 'admin', activeAdmin: false};
    let teams = null;
    const createSession = () => {
        console.log('create a session');
        socket.emit('createSession', (s) => {
            console.log(`create: ${s}`);
        });
    };
    const getRan = () => {
        return Math.round(Math.random() * 10000);
    };
    const updateTeam = function () {
        let n = parseInt($(this).attr('id').split('_')[2]);
        let id = `t_${n}`;
        let team = Object.values(teams)[n];
//        console.log(team);
        let t = {
            id: id,
            title: team.title,
            team: ['pl1', 'pl3', 'pl7'],
            test: getRan(),
            state: {votes: 10}
        };
//        console.log(t);
        socket.emit('updateTeam', t);
    };
    const getTeams = () => {

        socket.emit('getTeams', (t) => {
            teams = t;
        })
    };
    const buttonCreate = $(`#button_create`);
    buttonCreate.on('click', createSession);
    const buttonTeam = $(`.button_team`);
    buttonTeam.on('click', updateTeam);
//    const buttonTeams = $(`#button_teams`);
//    buttonTeams.on('click', getTeams);
    const onConnect = () => {
        teams = getTeams();
        socket.emit('customDataEvent', clientData);
    };
    socket.on('connect', () => {
//        console.log('admin cnnnect');
        onConnect();
    });
    socket.on('connectedDB', () => {
//        console.log('database ready')
    });
    socket.on('dbReady', (boo) => {
//        console.log(`database ready? ${boo}`)
    });
});
