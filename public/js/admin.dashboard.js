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
    let data;
    let quiz;
    let questions;

    const getData = () => {
//        console.log('getData', socket);
        if (socket.connected) {
            socket.emit('getData', (s) => {
//                console.log('got data');
//                console.log(s);
                data = s;
                data.route.stages = window.getRouteStages(data);
//                console.log(data);
            });
        } else {
            // wait for socket to cnnect, try again
            setTimeout(getData, 200);
        }
    };
    window.getData = getData;
    const getDisplayTime = (t) => {

    };
    const propMap = {
        dateID: `start date/time`,
        dateAccessed: 'last accessed',
        teamRef: `country`
    };
    const getDisplayProp = (p) => {
        //        return p;
        return propMap.hasOwnProperty(p) ? propMap[p] : p;
    };
    const prepClimberForDisplay = (c) => {
        c.status = c.finished || c.currentStage === 0 ? 'at base camp' : c.currentStage < 3 ? 'ascending' : 'descending';
        c.finishTimeDisplay = window.formatTime(c.finishTime * 1000);
        c.currentTimeDisplay = window.formatTime(c.currentTime * 1000);
        c.allDelaysDisplay = c.allDelays
            .split('|')
            .slice(1)
            .map((a, i) => {
                const joined = a.split(',').join('');
                return joined ? `st${i+1}: ${joined} ` : null; // keep index but mark empty as null
              })
            .filter(Boolean) // remove nulls (the zeros)
            .join('');
//        c.totalDelays = c.allDelays.flat().split('|').split(',').reduce((a, b) => a + b, 0);
        c.totalDelays = c.allDelays.split('|')               // split by '|'
            .filter(Boolean)          // remove empty strings
            .flatMap(part => part.split(',').map(Number)) // split by ',' and convert to numbers
            .reduce((a, b) => a + b, 0)
//        console.log(c.totalDelays);
        return c;
    };
    const prepValueForDisplay = (k, v) => {
        let val;
        if (k === 'quiz') {
            val = v.map((a, i) => `${i+1}) ${a.join(',')}`).join(', ');
        } else if (k.includes('date')) {
            const vs = String(v);
            val = `${vs.slice(0,4)}-${vs.slice(4,6)}-${vs.slice(6,8)} ${vs.slice(8,10)}:${vs.slice(10,12)}:${vs.slice(12,14)}`;
        } else if (k === 'teamRef') {
            val = data.teams[v].country;
        } else if (k === 'time') {
            val = window.formatTime(v);
            val = v;
        } else {
            val = v;
        }
        return val;
    };
    const nullFunk = () => {};
    const getQuestion = (index) => {
        return new Promise((resolve, reject) => {
            quiz.getQuestion(index, (q) => {
                resolve(q); // <-- make sure to resolve!
            });
        });
    };
    async function getAllQuestions() {
        const questions = [];
        let index = 0;
        while (true) {
            try {
                const question = await getQuestion(index);
                if (!question) break;
                questions.push(question);
                index++;
            } catch (err) {
                console.error('Error retrieving question:', err);
                break;
            }
        }
        return questions;
    }

    const initQuiz = () => {
        quiz = new Quiz(socket, { nullFunk, nullFunk, nullFunk, nullFunk });
        getAllQuestions().then(allQs => {
//            console.log('Retrieved questions:', allQs);
            questions = allQs;
        });
    };
    const prepSessionForDisplay = (s) => {
        const o = {
            session: {},
            climbers: [],
            answers: []
        };
        // profile stuff
        const profiles = Object.entries(s)
            .filter(([key, value]) => /^profile\d+$/.test(key))
            .map(([key, value]) => value);
        profiles.forEach(p => {
            const conf = {
                gameData: data,
                team: data.teams[s.teamRef],
                summaryString: p.summary.replace(/(_ty:)-?\d+/, '$1-9999')
            };
            const c = new Climber(conf);
            o.climbers.push(prepClimberForDisplay(c));

        });
        // quiz stuff
        s.quiz.forEach((q, i) => {
            let a = `${questions[i].question.substr(0, 30)}...`;
            let ans = [];
            q.forEach(r => {
                ans.push(questions[i].options[r]);
            });
            a += ` ${ans.join(', ')}`;
            o.answers.push(a);
        });
        // everything else
        const excludes = ['profile', '_id', 'type', 'supportTeamRef', '__v', 'quiz']
        Object.entries(s).forEach(([k, v]) => {
            if (!excludes.includes(k) && !/^profile\d+$/.test(k)) {
                o.session[k] = prepValueForDisplay(k, v);
                o.session.timeDisplay = window.formatTime(o.session.time * 1000);
            }
        });
        return o;
    }
    const showSession = (s) => {
//        console.log(s);
        const display = $('#session');
        display.show();
        window.renderTemplate('session', 'admin.dashboard.session', prepSessionForDisplay(s));
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
            //            cons
            const eid = `s_${s._id}`;
            display.append(`<p class='sClick' id='${eid}'>${s.uniqueID}: ${s.name}</p>`);
            const e = $(`#${eid}`);
            e.data('session', s);
            let S = null;
            if (s.quiz) {
                if (s.quiz.length) {
                    S = s;
                }
            }
        });
        display.append(`<p>${sessions.length} sessions found</p>`);
        const sClick = $('.sClick');
        sClick.off('click').on('click', function () {
            sClick.removeClass('clicked');
            $(this).addClass('clicked');
            const id = $(this).attr('id');
            const s = $(this).data('session');
            showSession(s);
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
    const getDateRange = (f = 20250603, t = 20250605, comp = true) => {
        // Return a set of sessions from date f to date t
        // Date format = YYYYMMDD
        // By default only completed sessions are included in returns
        f = Number(f);
        t = Number(t);
//        console.log('range', f, typeof(f), t, typeof(t));
        const display = $('#sessions');
        socket.emit('getAllSessions', dbName, collectionName, (err, r) => {
            if (err === null) {
                r.forEach(e => {
                    e.dateStart = Number(String(e.dateID).substr(0, 8));
                    e.dateLast = Number(String(e.dateAccessed || e.dateID).substr(0, 8));
                });
                let range = r.filter(obj => obj.dateStart >= f && obj.dateStart <= t);
                if (comp) {
                    range = range.filter(s => s.state.includes('completed'))
                }
//                console.log(`${range.length} out of ${r.length} records matched:`);
//                console.log(range);
                sessions = range;
                r.map(e => delete e.dateStart);
                r.map(e => delete e.dateLast);
//                console.log(r);
                showSessions();
            } else {
                display.html('no completed sessions found for date range');
                console.warn(err);
            }
        });
    };

    // form stuff
    function checkDates() {
        if ($('#dateFrom').val() && $('#dateTo').val()) {
            $('#bSubmit').prop('disabled', false);
        } else {
            $('#bSubmit').prop('disabled', true);
        }
    }
    $('#dateFrom, #dateTo').on('change', checkDates);
    $('#dateFrom').on('change', function () {
        sessionStorage.setItem('dateFrom', $(this).val());
        checkDates();
    });

    $('#dateTo').on('change', function () {
        sessionStorage.setItem('dateTo', $(this).val());
        checkDates();
    });
    $('#bSubmit').on('click', function () {
        const dateFrom = $('#dateFrom').val().replace(/-/g, '');
        const dateTo = $('#dateTo').val().replace(/-/g, '');
        const onlyComp = $('#onlyComplete').is(':checked');
        getDateRange(dateFrom, dateTo, onlyComp);
    });
    const savedFrom = sessionStorage.getItem('dateFrom');
    const savedTo = sessionStorage.getItem('dateTo');

    if (savedFrom) $('#dateFrom').val(savedFrom);
    if (savedTo) $('#dateTo').val(savedTo);

    checkDates();  // Update button state
    // end form stuff
    const setupInterface = () => {
        const bAll = $('#showAll');
        bAll.off('click').on('click', getAllSessions)
    };

    //    window.getDateRange = getDateRange;
    const generateQR = () => {
        socket.emit('createQR', (err, ob) => {
            if (err === null) {

                $('#qrCodes').html(`<img src='../${ob.img}' />`)
            } else {
                console.warn(err);
            }
        });
    }
    const init = () => {
        getData();
        generateQR();
        initQuiz();
        setupInterface();

//        getAllSessions();
    };
    init();
});
