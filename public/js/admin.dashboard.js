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
    let downloadFilter;

    // controls
    let $bAll;
    let $dateFrom;
    let $dateTo;
    let $onlyComplete;
    let $bSubmit;
    let $bDownload;
    let $bDownloadSel;
    let $bDeleteSel;
    let $bClear;
    let $bSeshClose;
//
    const getData = () => {
        if (socket.connected) {
            socket.emit('getData', (s) => {
                data = s;
                data.route.stages = window.getRouteStages(data);
            });
        } else {
            // wait for socket to cnnect, try again
            setTimeout(getData, 200);
        }
    };
    const enableButton = (b, a = true) => {
        const $b = b instanceof jQuery ? b : $(`#${b}`);
//        if (b instanceof)
        if ($b.length > 0) {
            $b.prop('disabled', !a);
            $b.css({opacity: a ? 1 : 0.5});
        } else {
            console.warn(`button #${b} does not exist`);
        }
    };
    const propMap = {
        dateID: `start date/time`,
        dateAccessed: 'last accessed',
        teamRef: `country`
    };
    const getDisplayProp = (p) => {
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
        c.totalDelays = c.calculateDelayTotal();
        c.endTime = window.formatTime(c.calculateEndTime() * 1000);
        c.splitTime = window.createSplitTime(c.endTime);
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
            questions = allQs;
        });
    };
    const prepSessionForDisplay = (s) => {
//        console.log(`prepSessionForDisplay:`);
//        console.log(s);
        const o = {
            session: {totalTime: [0, 0, 0]},
            climbers: [],
            questionSummaries: [],
            answers: {},
            answersIndex: []
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
                // make this \/ a common method?? - add to Climber
                c.splitTime.forEach((e, i) => {
                    o.session.totalTime[i] += e;
                    if (o.session.totalTime[i] >= 60) {
                        o.session.totalTime[i] -= 60;
                        o.session.totalTime[i - 1] += 1;
                    }
                });
            }

        });
        const ta = o.session.totalTime;
        o.session.totalTimeNum = ta[0] * 3600 + ta[1] * 60 + ta[2];
        o.session.totalTime = window.formatSplitTime(o.session.totalTime);
        if (s.playTime) {
            o.session.playTimeNum = s.playTime;
            o.session.playTime = window.formatSplitTime(window.createSplitTime(window.formatTime(s.playTime)));
        }
        s.quiz.forEach((q, i) => {
            let a = `${questions[i].question.substr(0, 30)}...`;
            let ans = [];
            o.answersIndex[i] = q;
            o.answers[`q${i + 1}`] = [];
            q.forEach(r => {
                o.answers[`q${i + 1}`].push(questions[i].options[r]);
                ans.push(questions[i].options[r]);
            });
            a += ` ${ans.join(', ')}`;
            o.questionSummaries.push(a);
        });
//        console.log(o.answers)

        // ANSWERS TO 1 AND 3 SEEM TO BE RENDERING INCORRECTLY, SORT THIS OUT


        // everything else
        const excludes = ['profile', '_id', 'type', 'supportTeamRef', '__v', 'quiz', 'complete', 'playTime', 'playTimeNum', 'events']
        Object.entries(s).forEach(([k, v]) => {
            if (!excludes.includes(k) && !/^profile\d+$/.test(k)) {
                o.session[k] = prepValueForDisplay(k, v);
                o.session.timeDisplay = window.formatTime(o.session.time * 1000);

//                console.log(`include ${k}`);
            } else {
//                console.log(` * * exclude ${k}`);
            }

        });

        console.log(o)
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
        return o;
    };
    const getNestedProperty = (obj, path) => {
        const np =  path.split('.').reduce((acc, part) => acc && acc[part], obj);
//        console.log('np', path, np);
        return np;
    };
    const setNestedProperty = (obj, path, value) => {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => acc && acc[part], obj);
        if (target && last) {
            target[last] = value;
        }
    };
    const makeComparitives = (arr, comps) => {
        comps.forEach(c => {
            const values = arr
                .map(d => getNestedProperty(d, c))
                .filter(v => typeof v === 'number' && !isNaN(v));

            const maxValue = values.length > 0 ? Math.max(...values) : 0;

//            console.log(c, maxValue);

            arr.forEach(obj => {
                const prop = getNestedProperty(obj, c);
                if (typeof prop === 'number' && !isNaN(prop) && maxValue > 0) {
                    const perc = (prop / maxValue) * 100;
                    const newPropPath = c + 'Perc';
                    setNestedProperty(obj, newPropPath, perc);
                }
            });
        });
        return arr;
    };

    const showComparison = (arr) => {
        const rOb = {quizSummary: {}, quizPerc: {}, quizPercAcc: {}, pieStrings: {}};
        const zone = $('#detailPanel');
        const displayID = 'session';
        const display = $(`#${displayID}`);
        const checkedSessions = getCheckedSessions();
        // arr includes only checked sessions so no need to use the checkedSessions array here (although it IS used later)
        let S = arr.map(i => sessions[i]).map(i => prepSessionForDisplay(i));
        S = makeComparitives(S, ['session.playTimeNum', 'session.totalTimeNum']);
        zone.show();
        display.show();
        S.map(s => delete s.climbers);
        questions.forEach((q, i) => rOb.quizSummary[`q${i}`] = new Array(q.options.length).fill(0));
        S.forEach(s => {
            s.answersIndex.forEach((a, i) => {
                a.forEach((r, j) => {
                    rOb.quizSummary[`q${i}`][r] += 1;
                });
            });
        });
        Object.entries(rOb.quizSummary).forEach((s, i) => {
            const total = s[1].reduce((a, b) => a + b, 0);
            const colours = ['#4CAF50', '#FF9800', '#2196F3', '#e200ff', '#9af321'];
            let cum = 0;
            rOb.quizPerc[s[0]] = s[1].map(value => (value / total) * 100);
            rOb.quizPercAcc[s[0]] = rOb.quizPerc[s[0]].map((p, idx) => {
              cum += p;
              if (idx === 0) {
                // First color: just add stop at cumulative
                return `${colours[idx]} ${cum}%`;
              } else {
                // Other colors: 'color 0 cumulative%'
                return `${colours[idx]} 0 ${cum}%`;
              }
            });
            rOb.pieStrings[s[0]] = {
                grad: `${rOb.quizPercAcc[s[0]].join(', ')}`,
                options: questions[i].options.map((o, i) => ({str: o, count: s[1][i], colour: colours[i]})),
                question: questions[i].question
            };
//            console.log(s[1]);
        });
        rOb.sessions = S;
        const totalTimeMax = Math.max(...S.map(s => s.session).map(s => s.totalTimeNum || 0));
        rOb.barChartTotalTime = {
            maxVal: totalTimeMax,
            range: [1, 0.75, 0.5, 0.25].map(e => window.formatTime(e * totalTimeMax)),
            sessions: rOb.sessions.map(s => {
                return {
                    name: s.session.name,
                    metric: s.session.totalTimeNumPerc
                }
            })
        };
        const playTimeMax = Math.max(...S.map(s => s.session).map(s => s.playTimeNum || 0));
        rOb.barChartPlayTime = {
            maxVal: playTimeMax,
            range: [1, 0.75, 0.5, 0.25].map(e => window.formatTime(e * playTimeMax )),
            sessions: rOb.sessions.map(s => {
                return {
                    name: s.session.name,
                    metric: s.session.playTimeNumPerc || 0
                }
            })
        };
//        console.log(rOb);
        window.removeTemplate(displayID, () => {
            window.renderTemplate(displayID, 'admin.dashboard.comparison', rOb, () => {
//                console.log('render complete');
                $('.chart-container').css({
                    width: '350px',
                    height: '200px'
                });
                const sBar = $('.bar');
                const charts = $('.chart');
                const pies = $('.pie-chart');
                charts.each(function (i, e) {
                    const B = $(e).find('.bar');
                    B.each(function (j, b) {
                        // when appying data only include checked sessions
                        $(b).data('session', checkedSessions[j]);
                    });
                });
                sBar.on('mouseover', function () {
                    const s = $(this).data('session');
                    highlightSession(s);
                });
                sBar.on('mouseout', function () {
                    unhighlightSession();
                });
                pies.each((i, p) => {
                    //
                });
            });
        });
    };
    const clearComparison = (arr) => {
        const zone = $('#detailPanel');
        const displayID = 'session';
        const display = $(`#${displayID}`);

        window.removeTemplate(displayID, () => {
            zone.hide();
            display.hide();
        });
    };
    const reduceSession = (s) => {
        // final reduction of session data prior to rendering
        const excludes = ['profile', '_id', 'type', 'supportTeamRef', '__v', 'quiz', 'playTimeNum', 'totalTimeNum', 'time']
//        delete s.session.playTimeNum;
        Object.entries(s.session).forEach(([k, v]) => {
            if (excludes.includes(k)) {
                delete s.session[k];
            }
        });
        return s;
    };
    const showSession = (s) => {
        const zone = $('#detailPanel');
        const displayID = 'sessionPanel';
        if ($(`#${displayID}`).length === 0) {
            zone.append(`<div id='${displayID}'></div>`);
        }
//        const displayID = 'session';
        const display = $(`#${displayID}`);
        zone.show();
        display.hide().fadeIn();
        const sesh = window.clone(prepSessionForDisplay(s));
        const output = prepSessionForDownload(sesh);
        console.log(s);
        console.log(sesh);
        const miniSesh = reduceSession(window.clone(sesh));
        window.renderTemplate(displayID, 'admin.dashboard.session', miniSesh, () => {
            display.find('#download').off('click').on('click', () => {
                downloadSingleSummary(s);
            });
            display.find('#delete').off('click').on('click', () => {
                deleteSession(s._id);
            });
            display.find('#closer').off('click').on('click', () => {
                closeSession();
            });
        });
    };
    const showSessionv1 = (s) => {
        const zone = $('#detailPanel');
        const panelID = 'sessionPanel';
        if ($(`#${panelID}`).length === 0) {
            zone.append(`<div id='${panelID}'></div>`);
        }
        const displayID = 'session';
        const display = $(`#${displayID}`);
        zone.show();
        display.hide().fadeIn();
        const sesh = prepSessionForDisplay(s);
        const output = prepSessionForDownload(sesh);
        window.renderTemplate(displayID, 'admin.dashboard.session', sesh, () => {
            display.find('#download').off('click').on('click', () => {
                downloadSingleSummary(s);
            });
            display.find('#delete').off('click').on('click', () => {
                deleteSession(s._id);
            });
        });
    };
    const closeSession = () => {
        const zone = $('#detailPanel');
        const display = $('#sessionPanel');
//        zone.hide();
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
    const downloadSessionSummaries = (filter) => {
        const ts = window.getTimestamp().replace(/[ :]/g, '');
        const filename = `k2SessionSummaries${ts}.csv`;
        const S = filter ? filter.map(i => sessions[i]) : sessions;
        downloadData(S, filename);
    };
    const downloadSingleSummary = (s) => {
        const ts = window.getTimestamp().replace(/[ :]/g, '');
        const filename = `k2SessionSummary${s.uniqueID}.csv`;
        downloadData(s, filename);
    };
    const downloadData = (data, filename) => {
        let output = [];
        if (!Array.isArray(data)) {
            data = [data];
        }
        data.forEach(s => {
            const pre = prepSessionForDisplay(s);
            const post = prepSessionForDownload(pre);
            output.push(post);
        });
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

    const findOnlyComplete = () => {
        const oc = $onlyComplete.is(':checked');
        console.log(oc);
        return oc;
    };
    const getFilterComplete = () => {
        const f = findOnlyComplete() ? {state: { $ne: 'incomplete' }} : {};
        console.log(f);
        return f;
    };

    const deleteSession = (id) => {
        const go = confirm('This will permanently delete the session data, are you sure you want to continue?');
        if (go) {
            socket.emit('deleteSession', {_id: id}, (err, msg) => {
                if (err === null) {
                    closeSession();
                    $(`#s_${id}`).remove();
                } else {
                    alert(err);
                    console.warn(err);
                }
            });
        }
    };
    const deleteSessions = () => {
        const idArr = downloadFilter.map(i => sessions[i]._id);
        if (idArr.length) {
            const ok = confirm(`Are you absolutely sure you want to delete ${idArr.length} session${idArr.length > 1 ? 's' : ''}? This cannot be undone.`);
            if (ok) {
                socket.emit('deleteSessions', idArr, (err, msg) => {
                    if (err) {
                        console.warn('deletion not possible');
                    } else {
                        closeSession();
                        idArr.forEach(id => {
                            $(`#s_${id}`).remove();
                        });
                        downloadFilter.length = 0;
                    }
                });
            }
        } else {
            alert('no sessions selected');
        }
    };

    let sessionRenderInt;
    const highlightSession = (s) => {
        // bar charts
        $('.bar').removeClass('highlight');
        $(`.chartbar_${s.name}`).addClass('highlight');
    };
    const unhighlightSession = () => {
        $('.bar').removeClass('highlight');
    };
    const sessionRenderComplete = () => {
        // called when session list has finished rendering to DOM
        const ca = $('#checkAll');
        if (ca) {
            ca.prop('checked', true).trigger('change');
        }
        //$($(`.sClick`)[$(`.sClick`).length - 1]).find('.sClicker').click();
    };
    const showSessions = () => {
        const zone = $('#resultsPanel');
        const display = $('#sessions');
        zone.hide();
        zone.show();
        display.html('');
        sessions.map(s => s.complete = s.state.includes('completed'));
        display.append(`<p>${sessions.length} sessions found</p>`);
        const sCount = sessions.length;
        const sPlural = sessions.length !== 1;
        window.removeTemplate('sessions', () => {
            if (sessions.length) {
                window.renderTemplate('sessions', 'admin.dashboard.sessionlist', { sessions, sCount, sPlural }, () => {
                let el = 0;
                clearInterval(sessionRenderInt);
                sessionRenderInt = setInterval(() => {
                    const elNow = $($('.sClick')[el++]);
                    if (elNow.length > 0) {
                        elNow.fadeIn(300, function () {
                            const stack = $(this).parent().children();
                            if ($(this).attr('id') === $(stack[stack.length - 1]).attr('id')) {
                                sessionRenderComplete();
                            }
                        });
                    } else {
                        clearInterval(sessionRenderInt);
                    }
                }, 50);
                $(el).fadeIn();
    //            return;
                const sBar = $('.sClick');
                sBar.each(function (i) {
                    $(this).data('session', sessions[i]);
                });
                const sClick = $('.sClick').find('.sClicker');
                sClick.off('click').on('click', function () {
                    $('.sClick').removeClass('clicked');
                    $(this).parent().addClass('clicked');
                    const s = $(this).parent().data('session');
                    showSession(s);
                });
                sClick.on('mouseover', function () {
                    const s = $(this).parent().data('session');
                    highlightSession(s);
                });
                sClick.on('mouseout', function () {
                    unhighlightSession();
                });
                const sCheck = $('.sClick').find('input');
                let checkTO;
                sCheck.on('change', function () {
                    const any = sCheck.filter(':checked');
                    enableButton($bDownloadSel, any.length !== 0);
                    enableButton($bDeleteSel, any.length !== 0);
                    const chk = any.map(function() {
                        return sCheck.index(this);
                    }).get();
                    downloadFilter = chk;
                    clearTimeout(checkTO);
                    if (chk.length > 1) {
                        // use a delay to avoid multiple calls

                        clearComparison();
                        checkTO = setTimeout(() => {
                            showComparison(chk);
                        }, 500);
                    }
                });
                $('#checkAll').on('change', function () {
                    const chk = $(this).is(':checked');
                    $('.sClick').find('input[type="checkbox"]').each((i, e) => {
                        $(e).prop('checked', chk).trigger('change');
                    });
                });
            });
            }
        });
        enableButton($bDownload, sessions.length > 0);
        enableButton($bClear, sessions.length > 0);
        closeSession();
    }
    const getAllSessions = () => {
        const filter = getFilterComplete();
        console.log(filter)
        socket.emit('getSessions', filter, (err, r) => {
            if (err === null) {
                sessions = r;
                showSessions();
            } else {
                console.warn(err);
            }
        });
    }
    const getDateRange = (f = 20250603, t = 20250605, comp = true) => {
        // Return a set of sessions from date f to date t
        // Date format = YYYYMMDDhhmmss
        // Multiply input date by 1000000 to convert date to time
        f = Number(f) * 1000000;
        t = (Number(t) * 1000000) + 235959; /* force To to one second before midnight */
        const display = $('#sessions');
        const filter = getFilterComplete();
        const dateRange = {dateID: { $gte: f, $lte: t }};
        Object.assign(filter, dateRange);
        console.log(`getDateRange`, filter);
        socket.emit('getSessions', filter, (err, r) => {
            if (err === null) {
                sessions = r;
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
    const getCheckedSessions = () => {
        var ids = $(".sClick").filter(function() {
            return $(this).find(".sessionCheck:checked").length > 0;
        }).map(function() {
            return this.id.replace('s_', '');  // or $(this).attr('id')
        }).get();
        const sel = sessions.filter(obj => ids.includes(obj._id));
        return sel;
//        console.log(ids);
//        console.log(sessions);
//        console.log(sel);
    };

    // form stuff
    const checkDates = () => {
        enableButton('bSubmit', $('#dateFrom').val() && $('#dateTo').val());
    };
    const clearDates = () => {
        $dateFrom.val('').trigger('change');
        $dateTo.val('').trigger('change');
    };
    window.clearDates = clearDates;
    // end form stuff

    const setupInterface = () => {
        $bAll = $('#showAll');
        $dateFrom = $('#dateFrom');
        $dateTo = $('#dateTo');
        $onlyComplete = $('#onlyComplete');
        console.log($onlyComplete)
        $bSubmit = $('#bSubmit');
        $bDownload = $('#bDownload');
        $bDownloadSel = $('#bDownloadSel');
        $bDeleteSel = $('#bDeleteSel');
        $bClear = $('#bClear');
        $bSeshClose = $('#closeDetail');
        //
        $bAll.off('click').on('click', (ev) => {
            ev.preventDefault();
            getAllSessions();
        });
        $dateFrom.add($dateTo).on('change', checkDates);
        $dateFrom.on('change', function (ev) {
            ev.preventDefault();
            sessionStorage.setItem('dateFrom', $(this).val());
            checkDates();
        });
        $dateTo.on('change', function (ev) {
            ev.preventDefault();
            sessionStorage.setItem('dateTo', $(this).val());
            checkDates();
        });
        $onlyComplete.on('change', function (ev) {
//            ev.preventDefault();
            sessionStorage.setItem('compSelected', $(this).is(':checked'));
        });
        $bSubmit.on('click', function (ev) {
            ev.preventDefault();
            const dateFrom = $dateFrom.val().replace(/-/g, '');
            const dateTo = $dateTo.val().replace(/-/g, '');
            const onlyComp = $onlyComplete.is(':checked');
            getDateRange(dateFrom, dateTo, onlyComp);
        });
        $bDownload.off('click').on('click', function (ev) {
            ev.preventDefault();
            downloadSessionSummaries();
        });
        $bDownloadSel.off('click').on('click', function (ev) {
            ev.preventDefault();
            downloadSessionSummaries(downloadFilter);
        });
        $bDeleteSel.off('click').on('click', function (ev) {
            ev.preventDefault();
            deleteSessions(downloadFilter);
        });
        $bClear.off('click').on('click', function (ev) {
            ev.preventDefault();
            clearSessions();
        });
        $bSeshClose.off('click').on('click', closeSession);
        //
        const savedFrom = sessionStorage.getItem('dateFrom');
        const savedTo = sessionStorage.getItem('dateTo');
        const compSelected = sessionStorage.getItem('compSelected');
        //
        if (savedFrom) $dateFrom.val(savedFrom);
        if (savedTo) $dateTo.val(savedTo);
        if (compSelected !== null) {
            $onlyComplete.prop('checked', compSelected === 'true');
        }
        checkDates();  // Update button state
    };
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
        ///*
        if ($dateFrom.val() && $dateTo.val()) {
            $bSubmit.click();
        } else {
            getAllSessions();
        }
        //*/
    };
    init();
});
