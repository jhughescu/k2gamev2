document.addEventListener('DOMContentLoaded', async () => {
    const EVENT_REPORT_REQUEST = 'k2:event-report:request';
    const EVENT_REPORT_RESPONSE = 'k2:event-report:response';
    const DEFAULT_QUIZ_BANK = 'k2questionbank2';

    const statusEl = document.getElementById('eventReportStatus');
    const contentEl = document.getElementById('eventReportContent');
    let questions = [];
    let quizStatusHint = '';

    const setReport = (html, status) => {
        // console.log('setting report', { html, status });
        if (contentEl) {
            contentEl.innerHTML = html || '';
        }
        if (statusEl) {
            statusEl.textContent = status || '';
        }
    };

    const loadQuizQuestions = async () => {
        const resolveQuestionBank = async () => {
            try {
                const response = await fetch('/access/gamedata', {
                    headers: {
                        Accept: 'application/json'
                    }
                });
                if (!response.ok) {
                    return DEFAULT_QUIZ_BANK;
                }
                const gameData = await response.json();
                return (gameData && typeof gameData.questionBank === 'string' && gameData.questionBank.trim())
                    ? gameData.questionBank.trim()
                    : DEFAULT_QUIZ_BANK;
            } catch (err) {
                return DEFAULT_QUIZ_BANK;
            }
        };

        const questionBank = await resolveQuestionBank();
        try {
            const res = await fetch(`/access/quiz/${encodeURIComponent(questionBank)}`, {
                headers: {
                    Accept: 'application/json'
                }
            });
            if (res.status === 401 || res.status === 403) {
                console.warn('Quiz questions unavailable for event report due to auth:', res.status);
                quizStatusHint = 'Quiz questions unavailable (authentication required)';
                return [];
            }
            if (!res.ok) {
                console.warn('Failed to load quiz questions for event report:', res.status);
                quizStatusHint = `Quiz questions unavailable (HTTP ${res.status})`;
                return [];
            }
            const data = await res.json();
            quizStatusHint = '';
            return Array.isArray(data) ? data : [];
        } catch (err) {
            console.warn('Failed to load quiz questions for event report:', err && err.message ? err.message : err);
            quizStatusHint = 'Quiz questions unavailable (network error)';
            return [];
        }
    };

    const requestReport = () => {
        if (!window.opener || window.opener.closed) {
            setReport('<p>Could not request report because the source window is unavailable.</p>', 'Source window unavailable');
            return;
        }
        window.opener.postMessage({
            type: EVENT_REPORT_REQUEST,
            questions
        }, window.location.origin);
    };

    window.addEventListener('message', (ev) => {
        if (!ev || ev.origin !== window.location.origin) {
            return;
        }
        const data = ev.data || {};
        // console.log('received message', { data });
        if (data.type !== EVENT_REPORT_RESPONSE) {
            return;
        }
        const combinedStatus = quizStatusHint
            ? `${data.status || ''} | ${quizStatusHint}`.replace(/^\s*\|\s*/, '')
            : data.status;
        setReport(data.html, combinedStatus);
    });

    questions = await loadQuizQuestions();
    window.questions = questions;
    requestReport();
});
