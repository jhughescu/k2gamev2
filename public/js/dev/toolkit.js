document.addEventListener('DOMContentLoaded', function () {
    let initObj;
    let socket;
    let info;
    let checkInt;
    const ins = $('#insertion');
    //
    const bToggleAutoRes = $('#toggleAutoResource');
    const bToggleCheating = $('#toggleCheating');
    const bStart = $('#startNew');
    const bID = $('#idGame');
    const bPlay = $('#playPause');
    const bResetTime = $('#resetTime');
    const bStartStorm = $('#startStorm');
    const bResetStorm = $('#resetStorm');
    const bToggleDebug = $('#toggleDebug');
    const bClearConsole = $('#clearConsole');
    const bRefreshGame = $('#refreshGame');
    const bTestClimbers = $('#testClimbers');
    const bToggleLocal = $('#toggleLocal');
    const setTimeHoursInput = $('#setTimeHours');
    const setTimeMinutesInput = $('#setTimeMinutes');
    const bInterruptGame = $('#interruptGame');
    const bShowEvents = $('#showEvents');
    const TOOLKIT_STORAGE_KEY = 'k2.dev.toolkit.formState';
    const EVENT_REPORT_REQUEST = 'k2:event-report:request';
    const EVENT_REPORT_RESPONSE = 'k2:event-report:response';
    const TOOLKIT_EVENTS_UPDATED = 'k2:toolkit:events-updated';
    const EVENT_REPORT_PATH = '/flat/event-report.html';
    const EVENT_REPORT_WINDOW_NAME = 'k2-event-report-window';
    const EVENT_REPORT_WINDOW_FEATURES = 'width=960,height=720';
    let eventReportWindowRef = null;
    let eventReportRefreshTimer = null;
    console.log('toolkit loaded', bInterruptGame);
    //
    const setupSocket = () => {
        socket.on('gameFound', (g) => {
            console.log('we have a game', g);
        });
    };
    const initControls = () => {
        bToggleAutoRes.off('click').on('click', toggleAutoResource);
        bToggleCheating.off('click').on('click', toggleCheating);
        bStart.off('click').on('click', startNew);
        bID.off('click').on('click', idGame);
        bPlay.off('click').on('click', playPause);
        bResetTime.off('click').on('click', resetTime);
        bStartStorm.off('click').on('click', startStorm);
        bResetStorm.off('click').on('click', resetStorm);
        bToggleDebug.off('click').on('click', toggleDebug);
        bClearConsole.off('click').on('click', clearConsole);
        bRefreshGame.off('click').on('click', refreshGameWin);
        bTestClimbers.off('click').on('click', testClimbers);
        bToggleLocal.off('click').on('click', toggleLocal);
        bInterruptGame.off('click').on('click', interruptGame);
        bShowEvents.off('click').on('click', showEvents);

        setupSetTimeInputs();
    };
    const clampToRange = (value, min, max, fallback) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    };
    const loadToolkitFormState = () => {
        try {
            const raw = sessionStorage.getItem(TOOLKIT_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            console.warn('Unable to read toolkit form state from sessionStorage', err);
            return {};
        }
    };
    const saveToolkitFormState = (nextState) => {
        try {
            sessionStorage.setItem(TOOLKIT_STORAGE_KEY, JSON.stringify(nextState));
        } catch (err) {
            console.warn('Unable to save toolkit form state to sessionStorage', err);
        }
    };
    const bindPersistedInput = (input, fieldName) => {
        if (input.length === 0) return;
        const state = loadToolkitFormState();
        if (Object.prototype.hasOwnProperty.call(state, fieldName)) {
            input.val(state[fieldName]);
        }
        const persist = () => {
            const latest = loadToolkitFormState();
            latest[fieldName] = String(input.val());
            saveToolkitFormState(latest);
        };
        input.off('change.persist').on('change.persist', persist);
        input.off('input.persist').on('input.persist', persist);
    };
    const setupSetTimeInputs = () => {
        if (setTimeHoursInput.length > 0) {
            bindPersistedInput(setTimeHoursInput, 'setTimeHours');
            const enforceHours = () => {
                const next = clampToRange(setTimeHoursInput.val(), 5, 6, 5);
                setTimeHoursInput.val(next);
                const latest = loadToolkitFormState();
                latest.setTimeHours = String(next);
                saveToolkitFormState(latest);
            };
            setTimeHoursInput.off('input').on('input', enforceHours);
            setTimeHoursInput.off('blur').on('blur', enforceHours);
            enforceHours();
        }

        if (setTimeMinutesInput.length > 0) {
            bindPersistedInput(setTimeMinutesInput, 'setTimeMinutes');
            const enforceMinutes = () => {
                const next = clampToRange(setTimeMinutesInput.val(), 0, 59, 0);
                setTimeMinutesInput.val(next);
                const latest = loadToolkitFormState();
                latest.setTimeMinutes = String(next);
                saveToolkitFormState(latest);
            };
            setTimeMinutesInput.off('input').on('input', enforceMinutes);
            setTimeMinutesInput.off('blur').on('blur', enforceMinutes);
            enforceMinutes();
        }
    };
    const closedown = () => {
//        socket.emit('toolkitClosed', { gameID: initObj.uniqueID });
    };
    const init = () => {
        const q = window.getQueries();
        initObj = Object.assign({}, q);
        socket = io('', {
            query: {
                role: 'toolkit',
                gameID: initObj.uniqueID,
                gameName: initObj.name
            }
        });
        initControls();
        window.addEventListener('beforeunload', closedown);
        window.addEventListener('message', onMessageFromReportWindow);
        window.addEventListener('load', () => {
            if (window.opener) {
                info = window.opener.requestToolkitInfo(window.getQueries().uniqueID);
                console.log('loaded', info);
                if (info.hasOwnProperty('autoResource')) {
                    renderArButton(info.autoResource);
                }
                if (info.hasOwnProperty('cheating')) {
                    renderCheatButton(info.cheating);
                }
            }
        });
        clearInterval(checkInt);
        checkInt = setInterval(openerChecker, 2000);
    };
    const testClimbers = () => {
        // create climbers for testing (do not store, i.e. set type to -9999)
//        console.log('testClimbers');
//        console.log(info.gameData.teams);
        if (info.gameData) {
            let cCount = 0;
            let str = '<div class="grid-container">';
            info.gameData.teams.forEach(t => {
                console.log(`${t.adjective} team:`)
                Object.values(t.profiles).forEach((p, i) => {
//                    console.log(p);
                    const clOb = {
                        profile: i,
                        type: -9999,
                        team: t,
                        teamID: t.id,
                        gameData: info.gameData
                    }
                    const c = new Climber(clOb);
//                    console.log(clOb);
//                    console.log(c);
                    cCount++;
                    str += `<div class="grid-item">`;
                    str += `<img src='assets/profiles/profileimages_${c.filename}.png'>`;
                    str += `<p>${c.name}</p>`;
                    str += `<p>${c.filename}.png</p>`;
                    str += `<p>${c.team.country}</p>`;
                    str += `</div>`;
                });
            });
            str += '</div>';
            $('#insertion').html(str);
//            console.log(`${cCount} climbers created`);
        }
        /*
        const clOb = {
            profile: i,
            type: -9999,
            team: t,
            teamID: t.id,
            gameData: gameData
        }
        const c = createClimber(clOb);
        */
    };
    window.testClimbers = testClimbers;
//    control actions
    const renderArButton = (res) => {
        const b = bToggleAutoRes;
        const t = b.text().replace(/\s*\(on\)|\s*\(off\)/i, '');
        b.text(`${t} (${res ? 'on' : 'off'})`);
    };
    const renderCheatButton = (res) => {
        const b = bToggleCheating;
        const t = b.text().replace(/\s*\(on\)|\s*\(off\)/i, '');
        b.text(`${t} (${res ? 'on' : 'off'})`);
    };
    const toggleAutoResource = () => {
        socket.emit('toggleAutoResource', { gameID: initObj.uniqueID });
        // Listen for the response
        socket.once('toggleAutoResourceResponse', (res) => {
            renderArButton(res);
        });
    };
    const toggleCheating = () => {
        socket.emit('toggleCheating', { gameID: initObj.uniqueID });
        // Listen for the response
        socket.once('toggleCheatingResponse', (res) => {
            console.log('tc res');
            renderCheatButton(res);
        });
    };
    const toggleLocal = () => {
        socket.emit('toggleLocalAccess', () => {

        });
    }
    const startNew = () => {
        socket.emit('startNew', { gameID: initObj.uniqueID });
    };
    const idGame = () => {
//        console.log('I will ID');
        socket.emit('idGame', { gameID: initObj.uniqueID });
    };
    const playPause = () => {
        socket.emit('playPause', { gameID: initObj.uniqueID });
    };
    const resetTime = () => {
        socket.emit('resetTime', { gameID: initObj.uniqueID });
    };
    const interruptGame = () => {
        const hours = parseInt($('#setTimeHours').val());
        const minutes = parseInt($('#setTimeMinutes').val());
        // alert('IG');
        socket.emit('interruptGame', { gameID: initObj.uniqueID, hours, minutes });
    };
    const registerPartialsForReport = async () => {
        const response = await fetch('/partials');
        if (!response.ok) {
            throw new Error(`Unable to fetch partials (${response.status})`);
        }
        const data = await response.json();
        const partials = data && data.partials ? data.partials : {};
        Object.keys(partials).forEach((name) => {
            Handlebars.registerPartial(name, partials[name]);
        });
        // Allow either partial name to be used while templates are evolving.
        if (partials.event_report && !Handlebars.partials.event_summary) {
            Handlebars.registerPartial('event_summary', partials.event_report);
        }
        if (partials.event_summary && !Handlebars.partials.event_report) {
            Handlebars.registerPartial('event_report', partials.event_summary);
        }
    };
    const fetchTemplateSource = async (templateName) => {
        const response = await fetch(`/getTemplate?template=${encodeURIComponent(templateName)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        if (!response.ok) {
            throw new Error(`Unable to fetch template ${templateName} (${response.status})`);
        }
        return response.text();
    };
    const ensureRequiredPartials = async (templateSource) => {
        const matches = Array.from(templateSource.matchAll(/{{>\s*([a-zA-Z0-9_-]+)\s*}}/g));
        const required = [...new Set(matches.map((m) => m[1]).filter(Boolean))];
        for (const partialName of required) {
            if (Handlebars.partials && Handlebars.partials[partialName]) {
                continue;
            }
            try {
                const partialSource = await fetchTemplateSource(`partials/${partialName}`);
                Handlebars.registerPartial(partialName, partialSource);
            } catch (err) {
                throw new Error(`Missing required partial: ${partialName}`);
            }
        }
    };
    const writeEventReportWindow = (reportWindow, renderedBodyHtml, statusText = '') => {
        const applyContent = () => {
            if (reportWindow.closed) {
                return;
            }
            const doc = reportWindow.document;
            const content = doc.getElementById('eventReportContent');
            const status = doc.getElementById('eventReportStatus');
            if (content) {
                content.innerHTML = renderedBodyHtml;
            }
            if (status) {
                status.textContent = statusText;
            }
        };

        try {
            const ready = reportWindow.document.readyState;
            if (ready === 'complete' || ready === 'interactive') {
                applyContent();
            } else {
                reportWindow.addEventListener('load', applyContent, { once: true });
            }
        } catch (err) {
            console.warn('Failed to update report window content', err);
        }
    };
    const buildEventReportPayload = async (questions = []) => {
        // console.log(getInfo());
        if (!getInfo() || !getInfo().gameData) {
            throw new Error('Game data not available, cannot request event report');
        }
        const session = await new Promise((resolve) => {
            socket.emit('getSession', { uniqueID: initObj.uniqueID }, (s) => resolve(s));
        });
        if (!session || typeof session !== 'object') {
            throw new Error('No session data returned for event report');
        }
        // console.log(getInfo());
        // console.log(session);
        const evs = JSON.parse(JSON.stringify(getInfo().gameData.allEvents || []));
        console.log(`toolkit receives ${evs.length} events for report generation`);
        const quizAnswers = Array.isArray(session.quiz) ? session.quiz : [];
        const completionSummary = Array.isArray(session.events) ? session.events : [];
        const randomSummary = Array.isArray(session.eventsRandom) ? session.eventsRandom : [];
        const getQuestionEntry = (eventObj) => {
            if (!eventObj || !Number.isInteger(eventObj.question) || !Array.isArray(questions) || questions.length === 0) {
                return null;
            }

            const direct = questions[eventObj.question];
            return (direct && typeof direct === 'object') ? direct : null;
        };
        const getMappedQuestionText = (eventObj) => {
            const questionEntry = getQuestionEntry(eventObj);
            return questionEntry && typeof questionEntry.question === 'string' ? questionEntry.question : null;
        };
        const getMappedQuestionRef = (eventObj) => {
            const questionEntry = getQuestionEntry(eventObj);
            if (!questionEntry || !questionEntry.hasOwnProperty('ref')) {
                return null;
            }
            const refValue = questionEntry.ref;
            return (typeof refValue === 'string' || typeof refValue === 'number') ? String(refValue) : null;
        };
        const getAnswerOptionsForDisplay = (eventObj, isComplete) => {
            if (!eventObj || !Number.isInteger(eventObj.question)) {
                return [];
            }

            const questionEntry = getQuestionEntry(eventObj);
            const options = questionEntry && Array.isArray(questionEntry.options) ? questionEntry.options : [];
            if (options.length === 0) {
                return [];
            }

            const selectedAnswers = isComplete && Array.isArray(quizAnswers[eventObj.question])
                ? quizAnswers[eventObj.question]
                : [];
            const selectedSet = new Set(selectedAnswers.filter((answerIndex) => Number.isInteger(answerIndex)));

            return options.map((optionText, optionIndex) => {
                return {
                    text: String(optionText),
                    selected: selectedSet.has(optionIndex)
                };
            });
        };
        console.log('building event report with', { evs, completionSummary, randomSummary, session });

        evs.forEach((e, i) => {
            e.n = typeof e.n === 'number' ? e.n : i;
            e.complete = Number(completionSummary[i]) > 1;
            e.current = Number(completionSummary[i]) === 1;
            e.isRandom = e.hasOwnProperty('probability');
            e.randomState = randomSummary[i] === undefined ? null : randomSummary[i];
            e.questionText = getMappedQuestionText(e);
            e.questionRef = getMappedQuestionRef(e);
            e.answerOptions = getAnswerOptionsForDisplay(e, e.complete);
        });
        console.log('events for render', evs.sort((a, b) => a.time - b.time));
        const source = await fetchTemplateSource('dev.events.summary');
        await registerPartialsForReport();
        await ensureRequiredPartials(source);
        const reportData = {
            events: evs,
            session,
            questions,
            generatedAt: new Date().toISOString()
        };
        console.log('report data', reportData);
        const template = Handlebars.compile(source);
        const rendered = template(reportData);
        return {
            data: reportData,
            html: rendered,
            status: `Generated ${new Date().toLocaleString()}`
        };
    };
    const logEventReportRawData = (rawData) => {
        console.log('Event report raw data:', rawData);
    };
    const respondWithEventReport = async (targetWindow, requestedQuestions = null) => {
        if (!targetWindow || targetWindow.closed) {
            return;
        }
        try {
            const questions = (Array.isArray(requestedQuestions) && requestedQuestions.length > 0)
                ? requestedQuestions
                : ((targetWindow && !targetWindow.closed && Array.isArray(targetWindow.questions)) ? targetWindow.questions : []);
            const payload = await buildEventReportPayload(questions);
            const messagePayload = {
                type: EVENT_REPORT_RESPONSE,
                html: payload.html,
                status: payload.status
            };
            logEventReportRawData(payload.data);
            targetWindow.postMessage(messagePayload, window.location.origin);
            writeEventReportWindow(targetWindow, payload.html, payload.status);
        } catch (err) {
            const msg = err && err.message ? err.message : 'Unknown error';
            console.error('Failed to render event report:', msg);
            const fallbackHtml = '<p>Could not render event report. See console for details.</p>';
            const messagePayload = {
                type: EVENT_REPORT_RESPONSE,
                html: fallbackHtml,
                status: `Report failed: ${msg}`
            };
            targetWindow.postMessage(messagePayload, window.location.origin);
            writeEventReportWindow(targetWindow, fallbackHtml, 'Report failed');
        }
    };
    const onMessageFromReportWindow = (ev) => {
        if (!ev || ev.origin !== window.location.origin) {
            return;
        }
        if (!ev.data || !ev.data.type) {
            return;
        }
        if (ev.data.type === TOOLKIT_EVENTS_UPDATED) {
            if (!eventReportWindowRef || eventReportWindowRef.closed) {
                return;
            }
            clearTimeout(eventReportRefreshTimer);
            eventReportRefreshTimer = setTimeout(() => {
                if (eventReportWindowRef && !eventReportWindowRef.closed) {
                    respondWithEventReport(eventReportWindowRef);
                }
            }, 120);
            return;
        }
        if (ev.data.type !== EVENT_REPORT_REQUEST) {
            return;
        }
        const requestedQuestions = Array.isArray(ev.data.questions) ? ev.data.questions : [];
        eventReportWindowRef = ev.source;
        respondWithEventReport(ev.source, requestedQuestions);
    };
    const showEvents = async () => {
        // Always target a named popup so only one event report window can exist,
        // even if this toolkit window has been reloaded and local refs were lost.
        const reportWindow = window.open('', EVENT_REPORT_WINDOW_NAME, EVENT_REPORT_WINDOW_FEATURES);
        if (!reportWindow) {
            console.error('Failed to render event report: Popup blocked');
            alert('Popup blocked. Please allow popups for this site and try again.');
            return;
        }

        try {
            const onReportPage = reportWindow.location.pathname === EVENT_REPORT_PATH;
            if (!onReportPage) {
                reportWindow.location.href = EVENT_REPORT_PATH;
            }
        } catch (err) {
            console.warn('Unable to check event report window URL, forcing navigation', err);
            try {
                reportWindow.location.href = EVENT_REPORT_PATH;
            } catch (navErr) {
                console.warn('Unable to navigate event report window', navErr);
            }
        }

        try {
            reportWindow.focus();
        } catch (err) {
            console.warn('Unable to focus event report window', err);
        }

        eventReportWindowRef = reportWindow;
        writeEventReportWindow(reportWindow, '', 'Building event report...');
        await respondWithEventReport(reportWindow);
    };

    const startStorm = () => {
        socket.emit('startStorm', { gameID: initObj.uniqueID });
    };
    const resetStorm = () => {
        socket.emit('resetStorm', { gameID: initObj.uniqueID });
    };
    const toggleDebug = () => {
        socket.emit('toggleDebug', { gameID: initObj.uniqueID });
    };
    const clearConsole = () => {
        socket.emit('clearConsole', { gameID: initObj.uniqueID });
    };
    const refreshGameWin = () => {
        socket.emit('refreshWin', { gameID: initObj.uniqueID });
    };
    const getInfo = () => {
        if (window.opener) {
            return window.opener.requestToolkitInfo(window.getQueries().uniqueID);
        } else {
            return null;
        }
    }
    const openerChecker = () => {
        if (!window.opener) {
            console.warn('No window.opener found - toolkit may not function correctly');
            alert('opener lost, try reloading');
        }
    };
    window.showInfo = () => {
        console.log(info);
    };
    init();
});
