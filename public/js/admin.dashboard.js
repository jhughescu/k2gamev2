document.addEventListener('DOMContentLoaded', function () {
    const socket = io('', {
        query: {
            role: 'admin.dashboard'
        }
    });


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
    const enableButton = (b, a = true) => {
        const $b = $(`#${b}`);
        if ($b.length > 0) {
            $b.prop('disabled', !a);
        } else {
            console.warn(`button #${b} does not exist`);
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
//        console.log(c);
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
        c.totalDelays = c.calculateDelayTotal();
        c.endTime = window.formatTime(c.calculateEndTime() * 1000);
        c.splitTime= c.endTime.split(':').map(e => e = parseFloat(e));
        if (c.splitTime.length === 2) {
            c.splitTime.unshift(0);
        }
        c.totalTimeFormat = c.splitTime.map((n, i) => i === 0 ? n : (n < 10 ? `0${n}` : n)).join(':');
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
            session: {totalTime: [0, 0, 0]},
            climbers: [],
            questionSummaries: [],
            answers: {}
        };
        // profile stuff
        const profiles = Object.entries(s)
            .filter(([key, value]) => /^profile\d+$/.test(key))
            .map(([key, value]) => value);
        profiles.forEach((p, i) => {
            if (p.blank) {
                // cannot add blank climbers - just leave them out?
                console.log(`profile ${i} is blank`);
            } else {
                const conf = {
                    gameData: data,
                    team: data.teams[s.teamRef],
                    summaryString: p.summary.replace(/(_ty:)-?\d+/, '$1-9999')
                };
                const c = new Climber(conf);
                o.climbers.push(prepClimberForDisplay(c));
                // make this \/ a common method??

                c.splitTime.forEach((e, i) => {
                    o.session.totalTime[i] += e;
                    if (o.session.totalTime[i] >= 60) {
                        o.session.totalTime[i] -= 60;
                        o.session.totalTime[i - 1] += 1;
                    }
                });
            }

        });
        o.session.totalTime = window.formatSplitTime(o.session.totalTime);
        // quiz stuff
        s.quiz.forEach((q, i) => {
            let a = `${questions[i].question.substr(0, 30)}...`;
            let ans = [];
            o.answers[`q${i + 1}`] = [];
            q.forEach(r => {
                o.answers[`q${i + 1}`].push(questions[i].options[r]);
                ans.push(questions[i].options[r]);
            });
            a += ` ${ans.join(', ')}`;
            o.questionSummaries.push(a);
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
    };
    const prepSessionForDownload = (s) => {
        let o = {};
        const required = ['session', 'climbers', 'answers'];
        const allPresent = required.every(field =>
            Object.prototype.hasOwnProperty.call(s, field)
        );
        if (allPresent) {
            // session configured correctly
            const props = {
                session: ['uniqueID', 'name', 'dateID', 'teamRef', 'state', 'totalTime'],
                climbers: [],
                answers: []
            };
            for (let i in props) {
                props[i].forEach(p => o[p] = s[i][p]);
            }
            // force uniqueID to string so Excel will render it correctly in output
            o.uniqueID = `id:${o.uniqueID}`;
            // climbers
            s.climbers.forEach((c, i) => {
//                console.log(c);
                const n = i + 1;
                o[`profile${n}`] = c.nameFirst;
                o[`p${n} time`] = c.endTime;
                o[`p${n} delays`] = c.delayTotal;
            });
            // answers
            Object.values(s.answers).forEach((a, i) => {
                o[`q${i + 1}`] = a.toString();
            });
        } else {
            // return null, throw, or handle the bad config
        }
//        console.log(o);
        return o;
    };

    const showSession = (s) => {
        const display = $('#session');
        display.show();
        const sesh = prepSessionForDisplay(s);
        const output = prepSessionForDownload(sesh);
        window.renderTemplate('session', 'admin.dashboard.session', sesh, () => {
            display.find('#closer').off('click').on('click', () => {
                closeSession();
            });
            display.find('#delete').off('click').on('click', () => {
                deleteSession(s._id);
            });
        });
    };
    const closeSession = () => {
        const display = $('#session');
        display.hide();
        display.html('');
        $('.sClick').removeClass('clicked');
    };
    const saveSessionSummaries = () => {
        let output = [];
        const ts = window.getTimestamp().replace(/[ :]/g, '');
        sessions.forEach(s => {
            const pre = prepSessionForDisplay(s);
            const post = prepSessionForDownload(pre);
            output.push(post);
        });
        socket.emit('createCsv', output, `sessionSummaries${ts}`, (err, msg) => {
            if (err) {
                alert('Error creating CSV:', err);
            } else {
                alert(msg);
            }
        });
    };
    const downloadSessionSummaries = () => {
        let output = [];
        const ts = window.getTimestamp().replace(/[ :]/g, '');
        sessions.forEach(s => {
            const pre = prepSessionForDisplay(s);
            const post = prepSessionForDownload(pre);
            output.push(post);
        });

        const filename = `sessionSummaries${ts}.csv`;

        fetch('/download-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: output, filename })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to download CSV');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Error downloading CSV:', error);
        });
    };

    const deleteSession = (id) => {
//        console.log(`try to delete ${id}`);
        const go = confirm('This will permanently delete the session data, are you sure you want to continue?');
        if (go) {
            socket.emit('deleteSession', {_id: id}, (err, msg) => {
                if (err === null) {
//                    console.log(msg);
                    closeSession();
                    $(`#s_${id}`).remove();
                } else {
                    alert(err);
                    console.warn(err);
                }
            });
        }
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
        });
        enableButton('bDownload', sessions.length > 0);
        enableButton('bClear', sessions.length > 0);
    }
    const getAllSessions = () => {
//        socket.emit('getAllSessions', dbName, collectionName, (err, r) => {
        socket.emit('getAllSessions', (err, r) => {
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
//        socket.emit('getAllSessions', dbName, collectionName, (err, r) => {
        socket.emit('getAllSessions', (err, r) => {
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
    const clearSessions = () => {
        sessions = [];
        showSessions();
    };

    // form stuff
    function checkDates() {
        enableButton('bSubmit', $('#dateFrom').val() && $('#dateTo').val());
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
    $('#bDownload').off('click').on('click', function () {
//        saveSessionSummaries();
        downloadSessionSummaries();
    });
    $('#bClear').off('click').on('click', function () {
        clearSessions();
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
        setTimeout(() => {
//            $(`.sClick`)[$(`.sClick`).length - 1].click();
        }, 3000);
    };
    init();
});
