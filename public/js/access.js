const API_BASE = '/access';
const doc = (id) => document.getElementById(id);
const STORAGE_KEY = 'facilitator_dashboard_state';
const FACILITATOR_QUIZ_BANK = 'k2questionbank2';

// Global fetch wrapper that handles session expiration (401/403)
async function secureApiCall(url, options = {}) {
    try {
        // Ensure Accept header is set for JSON
        const headers = options.headers || {};
        if (!headers['Accept']) {
            headers['Accept'] = 'application/json';
        }
        
        const response = await fetch(url, { ...options, headers });
        
        // Handle session expiration / unauthorized access
        if (response.status === 401 || response.status === 403) {
            try {
                const errorData = await response.json();
                if (errorData.loginUrl) {
                    // Session expired - redirect to login
                    console.warn(`Session expired (${response.status}). Redirecting to login...`);
                    showError('Your session has expired. Redirecting to login...');
                    setTimeout(() => {
                        window.location.href = errorData.loginUrl + '?redirect=' + encodeURIComponent(window.location.pathname);
                    }, 1500);
                    return { ok: false, expired: true, status: response.status };
                }
            } catch (e) {
                // If response isn't JSON, still redirect
                console.warn(`Auth error (${response.status}). Redirecting to login...`);
                showError('Your session has expired. Redirecting to login...');
                setTimeout(() => {
                    window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
                }, 1500);
                return { ok: false, expired: true, status: response.status };
            }
        }
        
        return response;
    } catch (err) {
        console.error('API call failed:', err);
        throw err;
    }
}

let currentAccess = null;
let sessions = [];
let selectedSessionIds = new Set();
let savedSelectionIds = new Set();
let gameData = null;
let questions = [];
let currentPage = 1;
const sessionsPerPage = 5;
let dateFromFilter = null;
let dateToFilter = null;
let facilitatorSocket = null;
let refreshTimer = null;
let loginOptions = null;
let ttlInfo = null;
let sessionDetailsMode = 'summary';
let activeSessionDetails = null;
let courseLaunchUrlsCollapsed = false;
let activeCourseQr = null;
let pendingDeactivateWarningResolver = null;

function renderRestoreReport(summary) {
    const summaryEl = doc('restoreReportSummary');
    const detailsEl = doc('restoreReportDetails');
    if (!summaryEl || !detailsEl) return;

    const total = Number(summary && summary.total) || 0;
    const restored = Number(summary && summary.restored) || 0;
    const skipped = Number(summary && summary.skipped) || 0;
    const failed = Number(summary && summary.failed) || 0;
    summaryEl.textContent = `Total: ${total} | Restored: ${restored} | Skipped: ${skipped} | Failed: ${failed}`;

    const details = Array.isArray(summary && summary.details) ? summary.details : [];
    if (details.length === 0) {
        detailsEl.innerHTML = '<div style="color: #666;">No per-session details were returned.</div>';
        return;
    }

    const rows = details.map((entry) => {
        const result = String(entry && entry.result ? entry.result : '').toLowerCase();
        let color = '#6b7280';
        if (result === 'restored') color = '#2e7d32';
        if (result === 'skipped') color = '#a16207';
        if (result === 'failed') color = '#b71c1c';
        return `
            <tr>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top;">${escapeHtml(entry && entry.session ? entry.session : '')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; color: ${color}; font-weight: 600;">${escapeHtml(result || 'unknown')}</td>
                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top;">${escapeHtml(entry && entry.reason ? entry.reason : '')}</td>
            </tr>
        `;
    }).join('');

    detailsEl.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <thead>
                <tr>
                    <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; width: 25%;">Session</th>
                    <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; width: 15%;">Result</th>
                    <th style="text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd;">Reason</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function openRestoreReportModal(summary) {
    const modal = doc('restoreReportModal');
    if (!modal) return;
    renderRestoreReport(summary || {});
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeRestoreReportModal() {
    const modal = doc('restoreReportModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function resolveDeactivateWarning(result) {
    const modal = doc('deactivateWarningModal');
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (pendingDeactivateWarningResolver) {
        const resolver = pendingDeactivateWarningResolver;
        pendingDeactivateWarningResolver = null;
        resolver(Boolean(result));
    }
}

function closeDeactivateWarningModal() {
    resolveDeactivateWarning(false);
}

function openDeactivateWarningModal(message, activeUserCount = 0) {
    const modal = doc('deactivateWarningModal');
    const messageEl = doc('deactivateWarningMessage');
    const titleEl = doc('deactivateWarningTitle');
    if (!modal || !messageEl) {
        return Promise.resolve(window.confirm(message || 'Are you sure?'));
    }

    // If another confirmation is pending, cancel it before opening a new one.
    if (pendingDeactivateWarningResolver) {
        pendingDeactivateWarningResolver(false);
        pendingDeactivateWarningResolver = null;
    }

    if (titleEl) {
        const count = Number(activeUserCount) || 0;
        if (count > 0) {
            titleEl.textContent = count === 1
                ? 'Confirm Course Deactivation (1 Active User)'
                : `Confirm Course Deactivation (${count} Active Users)`;
        } else {
            titleEl.textContent = 'Confirm Course Deactivation';
        }
    }

    messageEl.textContent = message || 'Are you sure you want to set this course inactive?';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    return new Promise((resolve) => {
        pendingDeactivateWarningResolver = resolve;
    });
}

function updateCourseQrDownloadLink(course) {
    const downloadBtn = doc('courseQrDownloadBtn');
    if (!downloadBtn) return;
    if (!course || !course.qrDataUrl) {
        downloadBtn.dataset.qrUrl = '';
        downloadBtn.dataset.filename = 'course-qr.png';
        return;
    }

    const safeName = String(course.name || course.slug || 'course').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'course';
    downloadBtn.dataset.qrUrl = course.qrDataUrl;
    downloadBtn.dataset.filename = `${safeName}-qr.png`;
}

// Attach QR code download button handler once after DOMContentLoaded
// This ensures the handler is only attached once and always uses the latest activeCourseQr

document.addEventListener('DOMContentLoaded', () => {
    const courseQrDownloadBtn = doc('courseQrDownloadBtn');
    if (courseQrDownloadBtn) {
        courseQrDownloadBtn.addEventListener('click', () => {
            if (!activeCourseQr || !activeCourseQr.qrDataUrl) return;
            const filename = courseQrDownloadBtn.dataset.filename || 'course-qr.png';
            const link = document.createElement('a');
            link.href = activeCourseQr.qrDataUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }
});


async function copyCourseQrToClipboard(course) {
    if (!course || !course.qrDataUrl) {
        throw new Error('Missing QR image data');
    }

    // Convert data URL to Blob without fetch (avoids CSP connect-src restriction)
    const dataUrl = course.qrDataUrl;
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });

    if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
            new ClipboardItem({ [mime]: blob })
        ]);
        return;
    }

    throw new Error('Clipboard image copy is not supported in this browser');
}

async function pickRestorePackageFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', () => {
            const file = input.files && input.files.length ? input.files[0] : null;
            document.body.removeChild(input);
            resolve(file);
        }, { once: true });

        input.click();
    });
}

function formatRestoreSummary(summary) {
    if (!summary || typeof summary !== 'object') return 'Restore completed.';
    const restored = Number(summary.restored) || 0;
    const skipped = Number(summary.skipped) || 0;
    const failed = Number(summary.failed) || 0;
    return `Restore complete: ${restored} restored, ${skipped} skipped, ${failed} failed`;
}

async function importCourseSessionsFromBackup(courseSlug) {
    const normalizedCourseSlug = String(courseSlug || '').toLowerCase().trim();
    if (!normalizedCourseSlug) {
        showError('Missing target course for import');
        return;
    }

    const file = await pickRestorePackageFile();
    if (!file) return;

    try {
        const rawText = await file.text();
        let packageData = null;
        try {
            packageData = JSON.parse(rawText);
        } catch (parseErr) {
            showError('Selected file is not valid JSON');
            return;
        }

        const res = await secureApiCall(`${API_BASE}/import-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetCourseSlug: normalizedCourseSlug,
                packageData
            })
        });

        if (!res || res.expired) return;

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            showError(payload.error || 'Restore failed');
            return;
        }

        const summary = payload.summary || {};
        showSuccess(formatRestoreSummary(summary));
        openRestoreReportModal(summary);

        const failedCount = Number(summary.failed) || 0;
        if (failedCount > 0) {
            const details = Array.isArray(summary.details) ? summary.details : [];
            const failedDetails = details.filter((entry) => entry && entry.result === 'failed').slice(0, 3);
            if (failedDetails.length > 0) {
                const sample = failedDetails
                    .map((entry) => `${entry.session || 'session'}: ${entry.reason || 'failed'}`)
                    .join(' | ');
                showError(`Restore completed with errors. ${sample}`);
            }
        }
    } catch (err) {
        console.error('Import restore error:', err);
        showError('Failed to import restore package');
    }
}

function openCourseQrModal(course) {
    const modal = doc('courseQrModal');
    if (!modal || !course) return;

    activeCourseQr = course;

    const title = doc('courseQrModalTitle');
    const subtitle = doc('courseQrModalSubtitle');
    const image = doc('courseQrModalImage');
    const url = doc('courseQrModalUrl');

    if (title) title.textContent = `${course.name || course.slug || 'Course'} QR Code`;
    if (subtitle) subtitle.textContent = 'Scan this code to open the course-specific game launch page.';
    if (image) image.src = course.qrDataUrl || '';
    if (url) url.textContent = course.url || '';
    updateCourseQrDownloadLink(course);

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeCourseQrModal() {
    const modal = doc('courseQrModal');
    if (!modal) return;
    activeCourseQr = null;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

const SESSION_DETAILS_BASIC_EXCLUDE = new Set(['__v', '_id', 'eventsRandom', 'supportTeamRef', 'teamRef', 'ttl', 'lastAccessedAt', 'expiresAt', 'time', 'type', 'playTime', 'uniqueID']);

function scheduleRealtimeRefresh(delayMs = 300) {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        await loadSessions();
    }, delayMs);
}

function connectFacilitatorSocket() {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO client not available for facilitator realtime updates');
        return;
    }
    if (facilitatorSocket && facilitatorSocket.connected) {
        return;
    }

    facilitatorSocket = io('', {
        query: { role: 'facilitator' }
    });

    facilitatorSocket.on('connect', () => {
        console.log('Facilitator realtime socket connected');
    });

    facilitatorSocket.on('facilitatorQuizAnswer', () => {
        scheduleRealtimeRefresh();
    });

    facilitatorSocket.on('facilitatorSessionCreated', () => {
        scheduleRealtimeRefresh();
    });

    facilitatorSocket.on('facilitatorPlayerCount', (payload = {}) => {
        const countEl = doc('launchPlayerCount');
        const playerCount = Number.isFinite(payload.playerCount) ? payload.playerCount : 0;
        if (countEl) {
            countEl.textContent = `Players connected: ${playerCount}`;
        }

        // Update the in-progress count for the specific course in real-time
        const courseSlug = payload.courseSlug;
        if (courseSlug) {
            const inProgressEl =
                doc(`inProgressCount-${courseSlug}`) ||
                document.querySelector(`.courseInProgressLabel[data-course-slug="${courseSlug}"]`);
            if (inProgressEl) {
                const count = Number.isFinite(payload.playerCount) ? payload.playerCount : 0;
                const label = count === 1 ? '1 in progress' : `${count} in progress`;
                inProgressEl.textContent = label;
                // Update color based on whether there are players in progress
                inProgressEl.style.color = count > 0 ? '#b45309' : '#4b5563';
            }
        }

        // Keep the session-limit "remaining" summary in sync with realtime activity.
        if (currentAccess && Number.isInteger(currentAccess.sessionLimit) && currentAccess.sessionLimit > 0) {
            scheduleRealtimeRefresh();
        }
    });

    facilitatorSocket.on('authError', (data) => {
        console.warn('Facilitator socket authentication failed:', data && data.message ? data.message : 'unknown reason');
    });

    facilitatorSocket.on('disconnect', () => {
        console.log('Facilitator realtime socket disconnected');
    });
}

function disconnectFacilitatorSocket() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }
    if (facilitatorSocket) {
        facilitatorSocket.disconnect();
        facilitatorSocket = null;
    }
}

function loadSavedState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const state = JSON.parse(raw);
        if (state && Array.isArray(state.selectedSessionIds)) {
            selectedSessionIds = new Set(state.selectedSessionIds);
        }
        if (state && Array.isArray(state.savedSelectionIds)) {
            savedSelectionIds = new Set(state.savedSelectionIds);
        }
        if (state && typeof state.completionFilter === 'string') {
            const select = doc('completionFilter');
            if (select) select.value = state.completionFilter;
        } else {
            // Fallback for old saved state with showCompletedOnly
            if (state && typeof state.showCompletedOnly === 'boolean') {
                const select = doc('completionFilter');
                if (select) select.value = state.showCompletedOnly ? 'completed' : 'all';
            }
        }
        if (state && state.dateFromFilter) {
            dateFromFilter = state.dateFromFilter;
            const input = doc('dateFrom');
            if (input) input.value = dateFromFilter;
        }
        if (state && state.dateToFilter) {
            dateToFilter = state.dateToFilter;
            const input = doc('dateTo');
            if (input) input.value = dateToFilter;
        }
        if (state && typeof state.courseFilter === 'string') {
            const select = doc('courseFilter');
            if (select) select.value = state.courseFilter;
        }
        if (state && typeof state.courseLaunchUrlsCollapsed === 'boolean') {
            courseLaunchUrlsCollapsed = state.courseLaunchUrlsCollapsed;
        }
        updateClearDatesButtonState();
    } catch (err) {
        console.warn('Failed to load saved state:', err);
    }
}

function saveState() {
    try {
        const select = doc('completionFilter');
        const dateFromInput = doc('dateFrom');
        const dateToInput = doc('dateTo');
        const courseSelect = doc('courseFilter');
        const state = {
            completionFilter: select ? select.value : 'all',
            courseFilter: courseSelect ? courseSelect.value : 'all',
            courseLaunchUrlsCollapsed,
            selectedSessionIds: Array.from(selectedSessionIds),
            savedSelectionIds: Array.from(savedSelectionIds),
            dateFromFilter: dateFromInput ? dateFromInput.value : null,
            dateToFilter: dateToInput ? dateToInput.value : null
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn('Failed to save state:', err);
    }
}

function updateCourseLaunchUrlsCollapseButton() {
    const button = doc('courseLaunchUrlsToggleBtn');
    const body = doc('courseLaunchUrlsBody');
    if (!button || !body) return;
    button.textContent = courseLaunchUrlsCollapsed ? 'Expand' : 'Collapse';
    body.style.display = courseLaunchUrlsCollapsed ? 'none' : 'block';
}

function setCourseLaunchUrlsCollapsed(isCollapsed) {
    courseLaunchUrlsCollapsed = Boolean(isCollapsed);
    updateCourseLaunchUrlsCollapseButton();
    saveState();
}

function applyCompletionFilter(sessionsArray, filterValue) {
    if (!filterValue || filterValue === 'all') {
        return sessionsArray;
    }
    if (filterValue === 'incomplete') {
        return sessionsArray.filter(s => s.state === 'incomplete');
    }
    if (filterValue === 'completed') {
        return sessionsArray.filter(s => s.state && (s.state === 'completed:good' || s.state === 'completed:bad'));
    }
    if (filterValue === 'completed:good') {
        return sessionsArray.filter(s => s.state === 'completed:good');
    }
    if (filterValue === 'completed:bad') {
        return sessionsArray.filter(s => s.state === 'completed:bad');
    }
    return sessionsArray;
}

function applyCourseFilter(sessionsArray, filterValue) {
    if (!filterValue || filterValue === 'all') {
        return sessionsArray;
    }
    return sessionsArray.filter(s => s.course === filterValue);
}

function updateClearDatesButtonState() {
    const dateFromInput = doc('dateFrom');
    const dateToInput = doc('dateTo');
    const clearBtn = doc('clearDatesBtn');
    if (!clearBtn) return;

    const hasDate = (dateFromInput && dateFromInput.value) || (dateToInput && dateToInput.value);
    clearBtn.disabled = !hasDate;
    clearBtn.style.opacity = hasDate ? '1' : '0.5';
    clearBtn.style.cursor = hasDate ? 'pointer' : 'not-allowed';
}

function showError(message) {
    const el = doc('errorMsg');
    if (el) {
        el.textContent = message;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 5000);
    }
}

function showSuccess(message) {
    const el = doc('successMsg');
    el.textContent = message;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 3000);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatQuizAnswersPlainEnglish(quizValue) {
    const quizText = getQuizAnswersPlainText(quizValue);
    if (!quizText) {
        return '<span style="color: #777;">No quiz answers</span>';
    }

    return `<div style="white-space: pre-wrap; font-size: 12px; line-height: 1.5;">${escapeHtml(quizText)}</div>`;
}

function getQuizAnswersPlainText(quizValue) {
    if (!Array.isArray(quizValue) || quizValue.length === 0) {
        return '';
    }

    const lines = quizValue.map((answersForQuestion, questionIndex) => {
        const questionNumber = questionIndex + 1;
        const selected = Array.isArray(answersForQuestion) ? answersForQuestion : [];
        const question = Array.isArray(questions) ? questions[questionIndex] : null;
        const options = question && Array.isArray(question.options) ? question.options : [];

        if (selected.length === 0) {
            return `${questionNumber}) (no answer)`;
        }

        const answerLabels = selected.map((answerIndex) => {
            if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length) {
                return options[answerIndex];
            }
            return String(answerIndex);
        });

        return `${questionNumber}) ${answerLabels.join(', ')}`;
    });

    return lines.join('\n');
}

function getQuizAnswerPlainTextForQuestion(quizValue, questionIndex) {
    if (!Array.isArray(quizValue) || questionIndex < 0 || questionIndex >= quizValue.length) {
        return '';
    }

    const selected = Array.isArray(quizValue[questionIndex]) ? quizValue[questionIndex] : [];
    if (selected.length === 0) {
        return '';
    }

    const question = Array.isArray(questions) ? questions[questionIndex] : null;
    const options = question && Array.isArray(question.options) ? question.options : [];

    const answerLabels = selected.map((answerIndex) => {
        if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length) {
            return options[answerIndex];
        }
        return String(answerIndex);
    });

    return answerLabels.join(', ');
}

function formatSecondsToHHMM(value) {
    const secs = Number(value);
    if (!Number.isFinite(secs) || secs < 0) {
        return null;
    }
    const totalMinutes = Math.floor(secs / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDateTimeForSummary(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8) {
        const year = digits.slice(0, 4);
        const monthNumber = Number(digits.slice(4, 6));
        const monthText = monthNumber >= 1 && monthNumber <= 12
            ? monthNames[monthNumber - 1]
            : digits.slice(4, 6).padStart(2, '0');
        const day = digits.slice(6, 8).padStart(2, '0');
        const hour = (digits.length >= 10 ? digits.slice(8, 10) : '00').padStart(2, '0');
        const minute = (digits.length >= 12 ? digits.slice(10, 12) : '00').padStart(2, '0');
        const second = (digits.length >= 14 ? digits.slice(12, 14) : '00').padStart(2, '0');
        return `${day} ${monthText} ${year}, ${hour}:${minute}:${second}`;
    }

    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;

    const day = String(dt.getDate()).padStart(2, '0');
    const monthText = monthNames[dt.getMonth()];
    const year = String(dt.getFullYear());
    const hour = String(dt.getHours()).padStart(2, '0');
    const minute = String(dt.getMinutes()).padStart(2, '0');
    const second = String(dt.getSeconds()).padStart(2, '0');
    return `${day} ${monthText} ${year}, ${hour}:${minute}:${second}`;
}

function formatSessionPropertyValue(value, keyName = '') {
    const normalizedKey = String(keyName).toLowerCase();

    if (value === null || value === undefined) {
        return '<span style="color: #777;">null</span>';
    }

    if (sessionDetailsMode === 'summary' && (normalizedKey === 'completiontime' || normalizedKey === 'completedtime')) {
        const hhmm = formatSecondsToHHMM(value);
        if (hhmm) {
            return `<span style="font-family: monospace;">${escapeHtml(hhmm)}</span>`;
        }
    }

    if (sessionDetailsMode === 'summary' && (normalizedKey === 'dateid' || normalizedKey === 'dateaccessed')) {
        const formattedDateTime = formatDateTimeForSummary(value);
        if (formattedDateTime) {
            return `<span style="font-family: monospace;">${escapeHtml(formattedDateTime)}</span>`;
        }
    }

    if (normalizedKey === 'quiz' && sessionDetailsMode === 'summary') {
        return formatQuizAnswersPlainEnglish(value);
    }

    // Keep events/quiz values on one logical line while allowing wraps on narrow screens.
    if ((normalizedKey === 'events' || normalizedKey === 'quiz') && typeof value === 'object') {
        return `<span style="display: inline-block; white-space: normal; overflow-wrap: anywhere; word-break: break-word; font-family: monospace; font-size: 12px; line-height: 1.4;">${escapeHtml(JSON.stringify(value))}</span>`;
    }

    if (typeof value === 'object') {
        return `<pre style="margin: 0; white-space: pre-wrap; font-size: 12px; line-height: 1.4;">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    }
    return `<span>${escapeHtml(value)}</span>`;
}

function getSessionDetailsKeys(session, mode = sessionDetailsMode) {
    const allKeys = Object.keys(session).sort((a, b) => a.localeCompare(b));
    if (mode === 'full') {
        return allKeys;
    }
    const SUMMARY_ORDER = ['name', 'dateID', 'dateAccessed', 'institution', 'course', 'teamCountry', 'state', 'events', 'quiz'];
    const filtered = allKeys.filter((key) => {
        const lowerKey = String(key).toLowerCase();
        if (SESSION_DETAILS_BASIC_EXCLUDE.has(key)) return false;
        if (lowerKey.includes('profile')) return false;
        return true;
    });
    const ordered = SUMMARY_ORDER.filter((k) => filtered.includes(k));
    const rest = filtered.filter((k) => !SUMMARY_ORDER.includes(k));
    return [...ordered, ...rest];
}

function formatSessionPropertyValueForCsv(value, keyName = '') {
    const normalizedKey = String(keyName).toLowerCase();

    if (value === null || value === undefined) {
        return 'null';
    }

    if (normalizedKey === 'completiontime' || normalizedKey === 'completedtime') {
        const hhmm = formatSecondsToHHMM(value);
        if (hhmm) return hhmm;
    }

    if (normalizedKey === 'dateid' || normalizedKey === 'dateaccessed') {
        const formattedDateTime = formatDateTimeForSummary(value);
        if (formattedDateTime) return formattedDateTime;
    }

    if (normalizedKey === 'quiz') {
        const quizText = getQuizAnswersPlainText(value);
        return quizText || 'No quiz answers';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

function updateSessionDetailsModeButton() {
    const modeBtn = doc('sessionDetailsModeBtn');
    if (!modeBtn) return;
    modeBtn.textContent = sessionDetailsMode === 'summary' ? 'View: Summary' : 'View: Full';
}

function renderSessionDetailsModal(session) {
    const content = doc('sessionDetailsContent');
    if (!content || !session) return;

    const rows = getSessionDetailsKeys(session)
        .map((key) => `
            <tr>
                <td style="vertical-align: top; font-weight: 600; width: 220px; padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(key)}</td>
                <td style="vertical-align: top; padding: 8px; border-bottom: 1px solid #eee;">${formatSessionPropertyValue(session[key], key)}</td>
            </tr>
        `)
        .join('');

    content.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tbody>
                ${rows || '<tr><td style="padding: 8px; color: #777;">No properties found.</td></tr>'}
            </tbody>
        </table>
    `;
}

function openSessionDetailsModal(session) {
    const modal = doc('sessionDetailsModal');
    if (!modal || !session) return;

    activeSessionDetails = session;
    updateSessionDetailsModeButton();

    const sessionName = session.name || session.uniqueID || 'Session';
    const title = doc('sessionDetailsTitle');
    if (title) {
        title.textContent = `Session Details: ${sessionName}`;
    }

    renderSessionDetailsModal(session);

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeSessionDetailsModal() {
    const modal = doc('sessionDetailsModal');
    if (!modal) return;
    activeSessionDetails = null;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function initThemeToggle() {
    const THEME_KEY = 'dashboard_theme';
    const themeBtn = doc('themeToggleBtn');
    
    if (!themeBtn) return;

    const syncThemeButton = () => {
        const isDark = document.body.classList.contains('theme-dark');
        themeBtn.textContent = isDark ? '☀' : '🌙';
        themeBtn.title = isDark ? 'Disable dark mode' : 'Enable dark mode';
        themeBtn.setAttribute('aria-label', themeBtn.title);
    };

    themeBtn.style.display = 'none';
    
    // Restore theme preference on load
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.body.classList.add('theme-dark');
    }
    syncThemeButton();
    
    // Toggle theme on button click
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('theme-dark');
        const isDark = document.body.classList.contains('theme-dark');
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
        syncThemeButton();
    });
}

function setSelectOptions(selectEl, options, placeholderText) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholderText;
    selectEl.appendChild(placeholderOption);

    for (const option of options) {
        const item = document.createElement('option');
        item.value = option.slug;
        item.textContent = option.name;
        selectEl.appendChild(item);
    }

    selectEl.value = '';
}

function populateCourseOptions() {
    const type = doc('accessType').value;
    const institutionSlug = doc('institutionSlug').value;
    const courseSelect = doc('courseSlug');
    if (!courseSelect) return;

    if (type !== 'course' || !institutionSlug || !loginOptions) {
        setSelectOptions(courseSelect, [], 'Select course');
        courseSelect.disabled = true;
        return;
    }

    const courseOptionsByInstitution = loginOptions.courseOptionsByInstitution || {};
    const courseOptions = courseOptionsByInstitution[institutionSlug] || [];
    setSelectOptions(courseSelect, courseOptions, 'Select course');
    courseSelect.disabled = courseOptions.length === 0;
}

function handleInstitutionChange() {
    populateCourseOptions();
}

function handleAccessTypeChange() {
    if (doc('accessType')) {
        const type = doc('accessType').value;    
        const institutionSelect = doc('institutionSlug');
        if (!institutionSelect) return;

        const institutions = type === 'course'
            ? (loginOptions && loginOptions.courseTypeInstitutions) || []
            : (loginOptions && loginOptions.institutionTypeInstitutions) || [];

        setSelectOptions(institutionSelect, institutions, 'Select institution');
        populateCourseOptions();
    }
}

async function loadAccessLoginOptions() {
    try {
        const res = await secureApiCall(`${API_BASE}/login-options`);
        if (!res || res.expired || !res.ok) {
            throw new Error('Failed to load login options');
        }
        loginOptions = await res.json();
    } catch (err) {
        console.error('Login options load failed:', err);
        showError('Unable to load login options');
        loginOptions = {
            institutionTypeInstitutions: [],
            courseTypeInstitutions: [],
            courseOptionsByInstitution: {}
        };
    }
}

function getSafeRedirectPath() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '';
    if (!redirect.startsWith('/')) {
        return null;
    }
    if (redirect.startsWith('//')) {
        return null;
    }
    return redirect;
}

function updateLaunchLimitsInfo() {
    const limitsEl = doc('launchLimitsInfo');
    if (!limitsEl) return;

    const parts = [];
    if (Number.isInteger(currentAccess && currentAccess.sessionLimit) && currentAccess.sessionLimit > 0) {
        const remaining = Math.max(0, currentAccess.sessionLimit - sessions.length);
        parts.push(`Session limit: ${currentAccess.sessionLimit} (${remaining} remaining)`);
    }

    if (currentAccess && currentAccess.endDate) {
        const parsed = new Date(currentAccess.endDate);
        if (!Number.isNaN(parsed.getTime())) {
            parts.push(`Session end date: ${parsed.toLocaleDateString()}`);
        }
    }

    if (parts.length === 0) {
        limitsEl.textContent = '';
        limitsEl.style.display = 'none';
        return;
    }

    limitsEl.textContent = parts.join(' | ');
    limitsEl.style.display = 'block';
}

async function login(event) {
    if (event) event.preventDefault();

    const type = doc('accessType').value;
    const institutionSlug = doc('institutionSlug').value.trim().toLowerCase();
    const courseSlug = doc('courseSlug').value.trim().toLowerCase();
    const password = doc('password').value;

    if (!institutionSlug || !password) {
        showError('Institution and password are required');
        return;
    }

    if (type === 'course' && !courseSlug) {
        showError('Course is required for course access');
        return;
    }

    const payload = { type, institutionSlug, password };
    if (type === 'course') {
        payload.courseSlug = courseSlug;
    }

    try {
        const res = await secureApiCall(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            showError(err.message || 'Invalid credentials');
            return;
        }

        const data = await res.json();
        currentAccess = data.access;
        showSuccess('Logged in');
        const redirectPath = getSafeRedirectPath();
        if (redirectPath) {
            window.location.assign(redirectPath);
            return;
        }
        showSessionsSection();
        // Update browser URL to facilitator
        window.history.pushState({ page: 'facilitator' }, 'Facilitator Dashboard', '/facilitator');
        loadSessions();
    } catch (err) {
        showError('Login failed: ' + err.message);
    }
}

function populateCourseFilter() {
    const filterLabel = doc('courseFilterLabel');
    const filterSelect = doc('courseFilter');
    
    // Only show course filter for institution-level access
    if (!currentAccess || currentAccess.type !== 'institution' || !filterSelect) {
        if (filterLabel) filterLabel.style.display = 'none';
        return;
    }
    
    // Build a course-name lookup for the active institution so labels can use full names.
    const institutionSlug = String(currentAccess.institutionSlug || '').toLowerCase();
    const courseOptionsByInstitution = (loginOptions && loginOptions.courseOptionsByInstitution) || {};
    const configuredCourses = courseOptionsByInstitution[institutionSlug] || [];
    const courseNameBySlug = new Map(
        configuredCourses
            .map((course) => [String(course.slug || '').toLowerCase(), course.name || course.slug || ''])
            .filter(([slug]) => Boolean(slug))
    );

    // Get unique course values from sessions and derive best-available labels.
    const courseLabelByValue = new Map();
    sessions.forEach(s => {
        const courseValue = s.course || s.courseSlug;
        if (!courseValue) return;

        const normalizedValue = String(courseValue).toLowerCase();
        const bestLabel =
            (s.courseName && String(s.courseName).trim()) ||
            courseNameBySlug.get(normalizedValue) ||
            String(courseValue);

        courseLabelByValue.set(courseValue, bestLabel);
    });
    
    // Sort by display label (full course name when available)
    const courseList = Array.from(courseLabelByValue.keys()).sort((a, b) => {
        const aLabel = courseLabelByValue.get(a) || String(a);
        const bLabel = courseLabelByValue.get(b) || String(b);
        return aLabel.localeCompare(bLabel);
    });

    // Populate the dropdown with "all" plus all courses.
    filterSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'all';
    filterSelect.appendChild(allOption);

    courseList.forEach((course) => {
        const option = document.createElement('option');
        option.value = course;
        option.textContent = courseLabelByValue.get(course) || String(course);
        filterSelect.appendChild(option);
    });
    
    // Restore previously selected course
    let savedCourseFilter = 'all';
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.courseFilter === 'string') {
                savedCourseFilter = parsed.courseFilter;
            }
        }
    } catch (err) {
        console.warn('Failed to restore saved course filter:', err);
    }

    if (savedCourseFilter && courseList.includes(savedCourseFilter)) {
        filterSelect.value = savedCourseFilter;
    } else {
        filterSelect.value = 'all';
    }
    
    // Show the course filter
    if (filterLabel) filterLabel.style.display = 'flex';
}

function showSessionsSection() {
    if (doc('loginSection')) {
        doc('loginSection').style.display = 'none';
        doc('sessionsSection').style.display = 'block';
        doc('logoutBtn').style.display = 'block';
    }

    console.log('showSessionsSection - currentAccess:', currentAccess);

    const accessTitle = doc('accessTitle');
    const accessSubtitle = doc('accessSubtitle');
    const accessFacilitator = doc('accessFacilitator');

    const institutionLabel = currentAccess.institutionName || currentAccess.institutionSlug || 'Institution';
    let courseLabel = 'All courses';
    if (currentAccess.type === 'course') {
        courseLabel = currentAccess.courseName || currentAccess.courseSlug || 'Course';
    }

    if (accessTitle) accessTitle.textContent = institutionLabel;
    if (accessSubtitle) accessSubtitle.textContent = `Course: ${courseLabel}`;
    
    // Display facilitator name if available
    if (accessFacilitator) {
        const firstName = currentAccess.firstName || '';
        const surname = currentAccess.surname || '';
        const facilitatorName = `${firstName} ${surname}`.trim();
        accessFacilitator.textContent = facilitatorName ? `Facilitator: ${facilitatorName}` : '';
    }

    connectFacilitatorSocket();

        // Hide delete button if this key has a session limit — deleting sessions would
        // circumvent the cap, so the option is removed entirely for such keys.
        const deleteBtn = doc('deleteSelectedBtn');
        if (deleteBtn) {
            deleteBtn.style.display = (currentAccess.sessionLimit > 0) ? 'none' : '';
        }
    
    // Load game data for quiz display
    loadGameData();

    updateLaunchLimitsInfo();

    // Load course/game URLs for the current institution or course access scope
    loadCourseLaunchUrls();
    
    // Populate course filter for institution-level access
    populateCourseFilter();
    
    // Add radio button listeners for select mode (after sessions section is visible)
    const radioButtons = document.querySelectorAll('input[name="selectMode"]');
    if (radioButtons.length > 0 && !radioButtons[0].dataset.listenerAdded) {
        radioButtons[0].dataset.listenerAdded = 'true';
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const completionFilter = doc('completionFilter') ? doc('completionFilter').value : 'all';
                let filteredSessions = applyCompletionFilter(sessions, completionFilter);
                
                // Apply course filter (institution-level access only)
                const courseFilter = doc('courseFilter') ? doc('courseFilter').value : 'all';
                filteredSessions = applyCourseFilter(filteredSessions, courseFilter);
                
                // Apply date range filter
                const dateFromInput = doc('dateFrom');
                const dateToInput = doc('dateTo');
                const dateFrom = dateFromInput ? dateFromInput.value : null;
                const dateTo = dateToInput ? dateToInput.value : null;
                
                if (dateFrom || dateTo) {
                    filteredSessions = filteredSessions.filter(s => {
                        if (!s.dateAccessed) return false;
                        const da = String(s.dateAccessed).padStart(12, '0');
                        const sessionDate = `${da.slice(0,4)}-${da.slice(4,6)}-${da.slice(6,8)}`;
                        
                        if (dateFrom && sessionDate < dateFrom) return false;
                        if (dateTo && sessionDate > dateTo) return false;
                        return true;
                    });
                }
                
                if (e.target.value === 'all') {
                    // Select all visible sessions
                    filteredSessions.forEach(s => {
                        if (s.uniqueID) selectedSessionIds.add(s.uniqueID);
                    });
                } else if (e.target.value === 'thispage') {
                    // Select only sessions on current page
                    const startIdx = (currentPage - 1) * sessionsPerPage;
                    const endIdx = startIdx + sessionsPerPage;
                    const pageSessionions = filteredSessions.slice(startIdx, endIdx);
                    
                    selectedSessionIds.clear();
                    pageSessionions.forEach(s => {
                        if (s.uniqueID) selectedSessionIds.add(s.uniqueID);
                    });
                } else if (e.target.value === 'none') {
                    // Deselect all
                    selectedSessionIds.clear();
                } else if (e.target.value === 'selection') {
                    // Restore saved selection
                    selectedSessionIds = new Set(savedSelectionIds);
                }
                
                renderSessions();
                updateSelectedSessionsPanel();
                saveState();
            });
        });
    }
}

async function loadCourseLaunchUrls() {
    const card = doc('courseLaunchUrlsCard');
    const list = doc('courseLaunchUrlsList');
    const title = doc('courseLaunchUrlsTitle');
    const description = doc('courseLaunchUrlsDescription');
    const toggleBtn = doc('courseLaunchUrlsToggleBtn');
    if (!card || !list) return;

    if (!currentAccess || !currentAccess.institutionSlug) {
        card.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    try {
        const res = await secureApiCall(`${API_BASE}/course-launch-urls`);
        if (!res || res.expired || !res.ok) {
            card.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        const data = await res.json();
        const courses = Array.isArray(data.courses) ? data.courses : [];
        const heading = currentAccess.type === 'course' ? 'Course Game URL' : 'Course Game URLs';
        if (title) title.textContent = heading;
        if (description) {
            description.textContent = currentAccess.type === 'course'
                ? 'This dashboard shows the launch link for the active course.'
                : 'Each course below includes a direct game launch URL.';
        }

        if (courses.length === 0) {
            list.innerHTML = '<div style="color: #666; font-size: 13px;">No launchable courses found.</div>';
            card.style.display = 'block';
            updateCourseLaunchUrlsCollapseButton();
            return;
        }

        list.innerHTML = courses.map((course) => {
            const stateLabel = course.active ? 'Active' : 'Inactive';
            const stateColor = course.active ? '#2e7d32' : '#b71c1c';
            const toggleLabel = course.active ? 'Set Inactive' : 'Set Active';
            const inProgressCount = Number(course.inProgressCount) || 0;
            const inProgressLabel = inProgressCount === 1 ? '1 in progress' : `${inProgressCount} in progress`;
            const inProgressColor = inProgressCount > 0 ? '#b45309' : '#4b5563';
            const importButtonHtml = course.active
                ? ''
                : `<button type="button" class="courseLaunchImportBtn" data-course-slug="${escapeHtml(course.slug)}"
                        style="padding: 8px 14px; background: #6d4c41; color: white; border: 1px solid #5d4037; border-radius: 3px; cursor: pointer; font-size: 13px; white-space: nowrap;">Import</button>`;
            return `
            <div style="padding: 10px 12px; border: 1px solid #d7e1ee; border-radius: 4px; background: #fff;" data-course-slug="${escapeHtml(course.slug)}">
                <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
                    <div style="font-weight: 600; color: #173a5e;">
                        ${escapeHtml(course.name)}
                        <span style="font-weight: 500; color: #5f6b7a;">(${Number(course.sessionCount) || 0} session${Number(course.sessionCount) === 1 ? '' : 's'} found)</span>
                        <span id="inProgressCount-${escapeHtml(course.slug)}" class="courseInProgressLabel" data-course-slug="${escapeHtml(course.slug)}" style="font-weight: 600; color: ${inProgressColor}; margin-left: 8px;">${escapeHtml(inProgressLabel)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 12px; color: ${stateColor}; font-weight: 600;">${stateLabel}</span>
                        <button type="button" class="courseToggleActiveBtn" data-course-slug="${escapeHtml(course.slug)}" data-active="${course.active ? '1' : '0'}" data-in-progress-count="${inProgressCount}"
                            style="padding: 4px 10px; background: #eee; color: #222; border: 1px solid #bbb; border-radius: 3px; cursor: pointer; font-size: 12px;">${toggleLabel}</button>
                        <div style="font-size: 12px; color: #6b7280; margin-left: 10px;">${escapeHtml(course.slug)}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="text" readonly value="${escapeHtml(course.url)}" aria-label="Game URL for ${escapeHtml(course.name)}"
                        style="flex: 1; min-width: 260px; padding: 8px 10px; border: 1px solid #b0c8e8; border-radius: 3px; font-size: 12px; background: #fdfdfd; font-family: monospace;">
                    <button type="button" class="courseLaunchCopyBtn" data-course-url="${escapeHtml(course.url)}"
                        style="padding: 8px 14px; background: #0050a8; color: white; border: 1px solid #003f85; border-radius: 3px; cursor: pointer; font-size: 13px; white-space: nowrap;">Copy</button>
                    <button type="button" class="courseLaunchQrBtn" data-course-name="${escapeHtml(course.name)}" data-course-url="${escapeHtml(course.url)}" data-course-qr="${escapeHtml(course.qrDataUrl)}"
                        style="padding: 8px 14px; background: #2e7d32; color: white; border: 1px solid #1b5e20; border-radius: 3px; cursor: pointer; font-size: 13px; white-space: nowrap;">QR</button>
                    <button type="button" class="courseLaunchBackupBtn" data-course-name="${escapeHtml(course.name)}" data-course-slug="${escapeHtml(course.slug)}"
                        style="padding: 8px 14px; background: #757575; color: white; border: 1px solid #616161; border-radius: 3px; cursor: pointer; font-size: 13px; white-space: nowrap;">Backup</button>
                    ${importButtonHtml}
                </div>
            </div>
        `; }).join('');
        card.querySelectorAll('.courseToggleActiveBtn').forEach((button) => {
            button.addEventListener('click', async () => {
                const courseSlug = button.getAttribute('data-course-slug');
                const currentlyActive = button.getAttribute('data-active') === '1';
                const inProgressCount = Number(button.getAttribute('data-in-progress-count')) || 0;
                if (currentlyActive && inProgressCount > 0) {
                    const warningMessage = inProgressCount === 1
                        ? 'There is currently 1 active user in this course. Are you sure you want to set this course inactive?'
                        : `There are currently ${inProgressCount} active users in this course. Are you sure you want to set this course inactive?`;
                    const confirmed = await openDeactivateWarningModal(warningMessage, inProgressCount);
                    if (!confirmed) {
                        return;
                    }
                }
                button.disabled = true;
                button.textContent = 'Updating...';
                try {
                    const res = await secureApiCall(`${API_BASE}/course-toggle-active`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ courseSlug, active: !currentlyActive })
                    });
                    if (res.ok) {
                        showSuccess('Course state updated');
                        await loadCourseLaunchUrls();
                    } else {
                        const err = await res.json().catch(() => ({}));
                        showError(err.error || 'Failed to update course state');
                    }
                } catch (err) {
                    showError('Failed to update course state');
                } finally {
                    button.disabled = false;
                }
            });
        });

        card.style.display = 'block';

        if (toggleBtn && !toggleBtn.dataset.listenerAdded) {
            toggleBtn.dataset.listenerAdded = 'true';
            toggleBtn.addEventListener('click', () => {
                setCourseLaunchUrlsCollapsed(!courseLaunchUrlsCollapsed);
            });
        }

        updateCourseLaunchUrlsCollapseButton();

        card.querySelectorAll('.courseLaunchCopyBtn').forEach((button) => {
            button.addEventListener('click', async () => {
                const url = button.getAttribute('data-course-url') || '';
                try {
                    await navigator.clipboard.writeText(url);
                    button.textContent = 'Copied';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 1200);
                } catch (err) {
                    console.warn('Failed to copy course URL:', err);
                }
            });
        });
        card.querySelectorAll('.courseLaunchQrBtn').forEach((button) => {
            button.addEventListener('click', () => {
                openCourseQrModal({
                    name: button.getAttribute('data-course-name') || '',
                    url: button.getAttribute('data-course-url') || '',
                    qrDataUrl: button.getAttribute('data-course-qr') || ''
                });
            });
        });
        card.querySelectorAll('.courseLaunchBackupBtn').forEach((button) => {
            button.addEventListener('click', async () => {
                const courseSlug = button.getAttribute('data-course-slug') || '';
                const originalText = button.textContent;
                button.disabled = true;
                button.textContent = 'Creating...';
                try {
                    await downloadAccessData(courseSlug);
                } finally {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            });
        });
        card.querySelectorAll('.courseLaunchImportBtn').forEach((button) => {
            button.addEventListener('click', async () => {
                const courseSlug = button.getAttribute('data-course-slug') || '';
                const originalText = button.textContent;
                button.disabled = true;
                button.textContent = 'Importing...';
                try {
                    await importCourseSessionsFromBackup(courseSlug);
                } finally {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            });
        });
    } catch (err) {
        console.warn('Failed to load course launch URLs:', err);
        card.style.display = 'none';
        list.innerHTML = '';
    }
}

async function loadSessions() {
    try {
        const res = await secureApiCall(`${API_BASE}/sessions`);
        
        // Check for session expiration
        if (res.expired) {
            return;
        }
        
        if (!res.ok) {
            showError('Failed to load sessions');
            return;
        }
        const data = await res.json();
        sessions = data.sessions || [];
        ttlInfo = data.ttlInfo || null;
        populateCourseFilter();
        updateLaunchLimitsInfo();
        renderSessions();
    } catch (err) {
        showError('Failed to load sessions: ' + err.message);
    }
}

function formatTtlStatus(session) {
    const ttl = session && session.ttl ? session.ttl : null;
    if (!ttl || !ttl.expiresAt) {
        return {
            label: 'TTL not set',
            color: '#6b7280',
            bg: '#f3f4f6'
        };
    }

    if (ttl.isOverdueDeletion) {
        return {
            label: 'Pending deletion',
            color: '#7f1d1d',
            bg: '#fee2e2'
        };
    }

    const daysLeft = Number(ttl.daysUntilDeletion);
    if (!Number.isFinite(daysLeft)) {
        return {
            label: 'Deletion date unknown',
            color: '#6b7280',
            bg: '#f3f4f6'
        };
    }

    if (daysLeft <= 1) {
        return {
            label: 'Expires in < 24h',
            color: '#7f1d1d',
            bg: '#fee2e2'
        };
    }

    if (ttl.isNearDeletion) {
        return {
            label: `Expires in ${daysLeft} days`,
            color: '#7c2d12',
            bg: '#ffedd5'
        };
    }

    return {
        label: `Expires in ${daysLeft} days`,
        color: '#14532d',
        bg: '#dcfce7'
    };
}

function updateFacilitatorTtlSummary(totalShown) {
    const subtitle = doc('accessSubtitle');
    if (!subtitle) return;

    const warningWindowDays = ttlInfo && Number.isInteger(ttlInfo.warningWindowDays)
        ? ttlInfo.warningWindowDays
        : 14;
    const nearDeletionCount = ttlInfo && Number.isInteger(ttlInfo.nearDeletionCount)
        ? ttlInfo.nearDeletionCount
        : 0;

    if (totalShown <= 0) {
        subtitle.textContent = `No sessions currently visible.`;
        return;
    }

    subtitle.textContent = `Sessions close to deletion (next ${warningWindowDays} days): ${nearDeletionCount} of ${totalShown}`;
}

async function loadGameData() {
    try {
        const res = await secureApiCall(`${API_BASE}/gamedata`);
        
        if (res.expired) {
            return;
        }
        
        if (!res.ok) {
            console.warn('Failed to load gamedata');
            return;
        }
        gameData = await res.json();
        console.log('GameData loaded:', gameData);
        
        // Load quiz questions from the active facilitator bank.
        try {
            console.log('Fetching quiz questions from:', `${API_BASE}/quiz/${FACILITATOR_QUIZ_BANK}`);
            const quizRes = await secureApiCall(`${API_BASE}/quiz/${FACILITATOR_QUIZ_BANK}`);
            
            if (quizRes.expired) {
                return;
            }
            
            console.log('Quiz response status:', quizRes.status);
            
            if (quizRes.ok) {
                
                questions = await quizRes.json();
                console.log('Quiz questions loaded, count:', questions.length);
                console.log('First question:', questions[0]);
                if (selectedSessionIds.size > 0) {
                    updateSelectedSessionsPanel();
                }
            } else {
                console.warn('Failed to load quiz questions, status:', quizRes.status);
                const errorText = await quizRes.text();
                console.warn('Error response:', errorText);
            }
        } catch (err) {
            console.warn('Failed to load quiz questions:', err.message);
        }
    } catch (err) {
        console.warn('Failed to load gamedata:', err.message);
    }
}

function renderSessions() {
    const container = doc('sessionsContainer');
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="muted">No sessions.</p>';
        return;
    }

    console.log('=== SESSIONS DATA ===');
    console.log(`Total sessions: ${sessions.length}`);
    
    // Filter sessions based on completion filter dropdown
    const completionFilter = doc('completionFilter') ? doc('completionFilter').value : 'all';
    let filteredSessions = applyCompletionFilter(sessions, completionFilter);
    
    // Filter sessions based on course filter dropdown (institution-level access only)
    const courseFilter = doc('courseFilter') ? doc('courseFilter').value : 'all';
    filteredSessions = applyCourseFilter(filteredSessions, courseFilter);
    
    // Apply date range filter
    const dateFromInput = doc('dateFrom');
    const dateToInput = doc('dateTo');
    const dateFrom = dateFromInput ? dateFromInput.value : null;
    const dateTo = dateToInput ? dateToInput.value : null;
    
    if (dateFrom || dateTo) {
        filteredSessions = filteredSessions.filter(s => {
            if (!s.dateAccessed) return false;
            // Convert dateAccessed (YYYYMMDDHHMM) to YYYY-MM-DD for comparison
            const da = String(s.dateAccessed).padStart(12, '0');
            const sessionDate = `${da.slice(0,4)}-${da.slice(4,6)}-${da.slice(6,8)}`;
            
            if (dateFrom && sessionDate < dateFrom) return false;
            if (dateTo && sessionDate > dateTo) return false;
            return true;
        });
    }
    
    console.log(`Filtered sessions: ${filteredSessions.length} (completionFilter: ${completionFilter}, courseFilter: ${courseFilter})`);
    
    // Update sessions count
    const countSpan = doc('sessionsCount');
    if (countSpan) {
        countSpan.textContent = `[${filteredSessions.length} found]`;
    }

    if (filteredSessions.length === 0) {
        updateFacilitatorTtlSummary(0);
        container.innerHTML = '<p class="muted">No sessions match the filter.</p>';
        return;
    }

    updateFacilitatorTtlSummary(filteredSessions.length);
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const startIdx = (currentPage - 1) * sessionsPerPage;
    const endIdx = startIdx + sessionsPerPage;
    const pageSessionions = filteredSessions.slice(startIdx, endIdx);
    
    // Render paginated sessions
    let html = pageSessionions.map((s, index) => {
        // Log each session's full data
        // console.log(`\nSession ${startIdx + index + 1}:`, s);
        // console.log('  Fields:', Object.keys(s));
        
        // Format date - dateAccessed is a number like dateID (YYYYMMDDHHMM format)
        let dateStr = 'N/A';
        if (s.dateAccessed) {
            const da = String(s.dateAccessed).padStart(12, '0');
            dateStr = `${da.slice(0,4)}-${da.slice(4,6)}-${da.slice(6,8)} ${da.slice(8,10)}:${da.slice(10,12)}`;
        }
        
        const state = s.state || 'unknown';
        // Team country - enriched from gameData on backend
        const teamStr = s.teamCountry ? `Team: ${s.teamCountry}` : (s.teamRef ? `Team Ref: ${s.teamRef}` : 'Team: N/A');
        const isChecked = s.uniqueID && selectedSessionIds.has(s.uniqueID) ? 'checked' : '';
        const ttlBadge = formatTtlStatus(s);
        const expiryDateText = s.ttl && s.ttl.expiresAt
            ? new Date(s.ttl.expiresAt).toLocaleDateString()
            : 'unknown';
        
        return `
            <div class="institution-item" data-session-id="${s.uniqueID}">
                <div class="institution-header">
                    <div>
                        <h3>${s.name || s.uniqueID}</h3>
                        <span class="institution-slug">${state}</span>
                    </div>
                    <div>${dateStr}</div>
                </div>
                <div style="color: #666; font-size: 0.9em;">
                    <div>${teamStr}</div>
                    <div>ID: ${s.uniqueID}</div>
                    <div>
                        <span style="display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; color: ${ttlBadge.color}; background: ${ttlBadge.bg};">${ttlBadge.label}</span>
                        <span style="margin-left: 8px; color: #555; font-size: 12px;">Delete on: ${expiryDateText}</span>
                    </div>
                </div>
                <div style="position: absolute; right: 10px; bottom: 10px;">
                    <input type="checkbox" class="sessionSelect" data-id="${s.uniqueID}" aria-label="Select session ${s.name || s.uniqueID}" ${isChecked}>
                </div>
            </div>
        `;
    }).join('');
    
    // Add pagination controls
    if (totalPages > 1) {
        const prevDisabled = currentPage === 1 ? 'disabled' : '';
        const nextDisabled = currentPage === totalPages ? 'disabled' : '';
        html += `
            <div style="display: flex; justify-content: center; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
                <button id="prevPageBtn" class="pagination-btn" ${prevDisabled} style="padding: 6px 12px; background: #0050a8; color: white; border: 1px solid #003f85; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; opacity: ${currentPage === 1 ? '0.5' : '1'};">← Prev</button>
                <span style="display: flex; align-items: center; padding: 6px 12px; font-size: 13px; color: #666;">Page ${currentPage} of ${totalPages}</span>
                <button id="nextPageBtn" class="pagination-btn" ${nextDisabled} style="padding: 6px 12px; background: #0050a8; color: white; border: 1px solid #003f85; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; opacity: ${currentPage === totalPages ? '0.5' : '1'};">Next →</button>
            </div>
        `;
    }
    
    container.innerHTML = html;

    // Remove selections that are not in the filtered list
    const filteredIds = new Set(filteredSessions.map(s => s.uniqueID).filter(Boolean));
    if (filteredIds.size > 0) {
        selectedSessionIds.forEach(id => {
            if (!filteredIds.has(id)) {
                selectedSessionIds.delete(id);
            }
        });
    } else {
        selectedSessionIds.clear();
    }
    updateSelectedCountText();
    saveState();

    // Attach checkbox handlers
    container.querySelectorAll('.sessionSelect').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!id) return;
            if (e.target.checked) {
                selectedSessionIds.add(id);
            } else {
                selectedSessionIds.delete(id);
            }
            updateSelectedSessionsPanel();
            updateSelectAllCheckbox();
            updateSelectedCountText();
            saveState();
        });
    });

    // Hovering a session title should highlight the matching completion-time bar.
    container.querySelectorAll('.institution-item .institution-header h3').forEach((titleEl) => {
        const sessionTile = titleEl.closest('.institution-item');
        if (!sessionTile) return;
        const sessionId = sessionTile.getAttribute('data-session-id');
        if (!sessionId) return;

        titleEl.addEventListener('mouseenter', () => {
            const barRow = document.querySelector(`.time-bar-row[data-session-id="${sessionId}"]`);
            if (!barRow) return;
            const barFill = barRow.querySelector('.time-bar-fill');

            barRow.style.backgroundColor = '#f0f0f0';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #003f85, #002f63)';
                barFill.style.transform = 'scaleY(1.1)';
            }
        });

        titleEl.addEventListener('mouseleave', () => {
            const barRow = document.querySelector(`.time-bar-row[data-session-id="${sessionId}"]`);
            if (!barRow) return;
            const barFill = barRow.querySelector('.time-bar-fill');

            barRow.style.backgroundColor = '';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #0050a8, #003f85)';
                barFill.style.transform = '';
            }
        });
    });

    // Hovering a session tile highlights itself (same style as bar-to-tile highlight).
    container.querySelectorAll('.institution-item').forEach((sessionTile) => {
        const sessionId = sessionTile.getAttribute('data-session-id');
        if (!sessionId) return;

        sessionTile.addEventListener('mouseenter', () => {
            sessionTile.style.backgroundColor = '#e3f2fd';
            sessionTile.style.borderColor = '#0050a8';
            sessionTile.style.boxShadow = '0 2px 8px rgba(0, 80, 168, 0.3)';
        });

        sessionTile.addEventListener('mouseleave', () => {
            sessionTile.style.backgroundColor = '';
            sessionTile.style.borderColor = '';
            sessionTile.style.boxShadow = '';
        });
    });

    // Clicking a session tile opens the full session details modal.
    container.querySelectorAll('.institution-item').forEach((sessionTile) => {
        sessionTile.addEventListener('click', (event) => {
            if (event.target.closest('input, button, a, label')) {
                return;
            }

            const sessionId = sessionTile.getAttribute('data-session-id');
            if (!sessionId) return;
            const session = sessions.find((s) => String(s.uniqueID) === String(sessionId));
            if (!session) return;
            openSessionDetailsModal(session);
        });
    });
    
    // Attach pagination handlers
    const prevBtn = doc('prevPageBtn');
    const nextBtn = doc('nextPageBtn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderSessions();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderSessions();
            }
        });
    }

    updateSelectedSessionsPanel();
    updateSelectAllCheckbox();
    updateSelectedCountText();
}

function updateSelectAllCheckbox() {
    // Get filtered sessions count
    const completionFilter = doc('completionFilter') ? doc('completionFilter').value : 'all';
    let filteredSessions = applyCompletionFilter(sessions, completionFilter);
    
    // Apply course filter (institution-level access only)
    const courseFilter = doc('courseFilter') ? doc('courseFilter').value : 'all';
    filteredSessions = applyCourseFilter(filteredSessions, courseFilter);
    
    // Apply date range filter
    const dateFromInput = doc('dateFrom');
    const dateToInput = doc('dateTo');
    const dateFrom = dateFromInput ? dateFromInput.value : null;
    const dateTo = dateToInput ? dateToInput.value : null;
    
    if (dateFrom || dateTo) {
        filteredSessions = filteredSessions.filter(s => {
            if (!s.dateAccessed) return false;
            const da = String(s.dateAccessed).padStart(12, '0');
            const sessionDate = `${da.slice(0,4)}-${da.slice(4,6)}-${da.slice(6,8)}`;
            
            if (dateFrom && sessionDate < dateFrom) return false;
            if (dateTo && sessionDate > dateTo) return false;
            return true;
        });
    }
    
    // Update radio button states
    const radioButtons = document.querySelectorAll('input[name="selectMode"]');
    radioButtons.forEach(radio => {
        radio.disabled = false;
    });
    
    if (filteredSessions.length === 0) {
        radioButtons.forEach(radio => radio.disabled = true);
        return;
    }
    
    // Calculate current page sessions
    const startIdx = (currentPage - 1) * sessionsPerPage;
    const endIdx = startIdx + sessionsPerPage;
    const pageSessionions = filteredSessions.slice(startIdx, endIdx);
    
    // Check if all filtered sessions are selected
    const allSelected = filteredSessions.every(s => s.uniqueID && selectedSessionIds.has(s.uniqueID));
    const noneSelected = selectedSessionIds.size === 0;
    
    // Check if only current page is selected
    const currentPageSelected = pageSessionions.length > 0 && 
        pageSessionions.every(s => s.uniqueID && selectedSessionIds.has(s.uniqueID)) &&
        selectedSessionIds.size === pageSessionions.length;
    
    // Check current selection state and set radio button
    if (allSelected) {
        document.querySelector('input[name="selectMode"][value="all"]').checked = true;
    } else if (noneSelected) {
        document.querySelector('input[name="selectMode"][value="none"]').checked = true;
    } else if (currentPageSelected) {
        document.querySelector('input[name="selectMode"][value="thispage"]').checked = true;
    } else {
        document.querySelector('input[name="selectMode"][value="selection"]').checked = true;
    }
    
    // Save current selection as the "saved selection" if not all/none/thispage
    if (!allSelected && !noneSelected && !currentPageSelected) {
        savedSelectionIds = new Set(selectedSessionIds);
    }
    
    // Disable "selection" radio if no saved selection exists
    const selectionRadio = document.querySelector('input[name="selectMode"][value="selection"]');
    if (savedSelectionIds.size === 0) {
        selectionRadio.disabled = true;
    }
}

function updateSelectedCountText() {
    const selectedCountEl = doc('selectedSessionsCount');
    const selectedCount = selectedSessionIds.size;

    if (selectedCountEl) {
        selectedCountEl.textContent = `(${selectedCount} selected)`;
    }

    const downloadSessionDetailsBtn = doc('downloadSessionDetailsBtn');
    if (downloadSessionDetailsBtn) {
        downloadSessionDetailsBtn.textContent = `Download ${selectedCount} Sessions`;
    }
}

function updateSelectedSessionsPanel() {
    const list = doc('selectedSessionsList');
    if (!list) return;
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) {
        list.innerHTML = '<p style="color: #000;">No sessions selected.</p>';
        // Hide charts grid
        const grid = doc('quizChartsGrid');
        if (grid) grid.style.display = 'none';
        return;
    }
    
    // Get selected sessions with completionTime values
    const selectedSessions = sessions.filter(s => s.uniqueID && selectedSessionIds.has(s.uniqueID));
    
    // Build completionTime bar chart
    let timeChartHTML = '';
    if (selectedSessions.length > 0) {
        const formatSecondsToHHMM = (value) => {
            const secs = Number(value);
            if (!Number.isFinite(secs) || secs < 0) return 'N/A';
            const totalMinutes = Math.floor(secs / 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        };

        const maxTime = Math.max(...selectedSessions.map(s => Number(s.completionTime) || 0));
        const bars = selectedSessions.map(s => {
            const time = Number(s.completionTime) || 0;
            const percentage = maxTime > 0 ? (time / maxTime) * 100 : 0;
            return `
                <div class="time-bar-row" data-session-id="${s.uniqueID}" style="display: flex; align-items: center; margin-bottom: 8px; gap: 8px; cursor: pointer; padding: 4px; border-radius: 3px; transition: background-color 0.2s ease;">
                    <div style="width: 150px; font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${s.name || s.uniqueID}">${s.name || s.uniqueID}</div>
                    <div style="flex: 1; background: #e0e0e0; height: 24px; border-radius: 3px; position: relative; overflow: hidden;">
                        <div class="time-bar-fill" style="background: linear-gradient(90deg, #0050a8, #003f85); height: 100%; width: ${percentage}%; border-radius: 3px; transition: all 0.3s ease;"></div>
                    </div>
                    <div style="width: 60px; text-align: right; font-size: 12px; font-weight: 600; color: #333;">${formatSecondsToHHMM(time)}</div>
                </div>
            `;
        }).join('');
        
        timeChartHTML = `
            <div style="border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; background: #fafafa; margin-bottom: 15px;">
                <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: #333;">Session Completion Times</h4>
                <div style="max-height: 320px; overflow-y: auto; padding-right: 4px;">
                    ${bars}
                </div>
            </div>
        `;
    }
    
    // Update the list with session count and time chart
    list.innerHTML = `
        <p style="color: #666; font-size: 14px; margin-bottom: 15px;">${ids.length} session${ids.length > 1 ? 's' : ''} selected</p>
        ${timeChartHTML}
    `;
    
    // Add hover and click event listeners to bars
    const barRows = list.querySelectorAll('.time-bar-row');
    barRows.forEach(row => {
        const sessionId = row.getAttribute('data-session-id');
        const barFill = row.querySelector('.time-bar-fill');
        
        row.addEventListener('mouseenter', () => {
            // Highlight the bar
            row.style.backgroundColor = '#f0f0f0';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #003f85, #002f63)';
                barFill.style.transform = 'scaleY(1.1)';
            }
            
            // Highlight the corresponding session tile
            const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
            if (sessionTile) {
                sessionTile.style.backgroundColor = '#e3f2fd';
                sessionTile.style.borderColor = '#0050a8';
                sessionTile.style.boxShadow = '0 2px 8px rgba(0, 80, 168, 0.3)';
            }
        });
        
        row.addEventListener('mouseleave', () => {
            // Always clear the tile highlight — pin only locks bar appearance
            const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
            if (sessionTile) {
                sessionTile.style.backgroundColor = '';
                sessionTile.style.borderColor = '';
                sessionTile.style.boxShadow = '';
            }

            row.style.backgroundColor = '';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #0050a8, #003f85)';
                barFill.style.transform = '';
            }
        });
        
    });
    
    // Render quiz pie charts
    renderAllQuizCharts();
}

function renderAllQuizCharts() {
    if (!gameData || !questions || questions.length === 0) {
        console.warn('Missing gameData or questions');
        return;
    }
    
    // Get selected sessions
    const selectedSessions = sessions.filter(s => s.uniqueID && selectedSessionIds.has(s.uniqueID));
    if (selectedSessions.length === 0) {
        console.warn('No selected sessions');
        return;
    }
    
    const grid = doc('quizChartsGrid');
    if (!grid) return;
    
    // Clear grid
    grid.innerHTML = '';
    grid.style.display = 'grid';
    
    const colours = ['#4CAF50', '#FF9800', '#0050a8', '#e200ff', '#9af321'];
    
    // Render pie chart for each question (limit to 4)
    const numQuestions = Math.min(4, questions.length);
    
    for (let questionIndex = 0; questionIndex < numQuestions; questionIndex++) {
        const question = questions[questionIndex];
        
        // Count answers for this question
        const answerCounts = new Array(question.options.length).fill(0);
        selectedSessions.forEach(s => {
            if (s.quiz && s.quiz[questionIndex]) {
                s.quiz[questionIndex].forEach(answerIndex => {
                    if (answerIndex >= 0 && answerIndex < answerCounts.length) {
                        answerCounts[answerIndex]++;
                    }
                });
            }
        });
        
        const total = answerCounts.reduce((a, b) => a + b, 0);
        
        // Build conic-gradient
        let gradientParts = [];
        let cumulative = 0;
        answerCounts.forEach((count, idx) => {
            const percent = (count / total) * 100;
            if (percent > 0) {
                const color = colours[idx % colours.length];
                if (gradientParts.length === 0) {
                    gradientParts.push(`${color} ${percent}%`);
                } else {
                    gradientParts.push(`${color} 0 ${cumulative + percent}%`);
                }
                cumulative += percent;
            }
        });
        
        const gradient = gradientParts.join(', ');
        
        // Build legend
        const legend = answerCounts.map((count, idx) => {
            const percent = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            const color = colours[idx % colours.length];
            return `<div style="display: flex; align-items: center; margin: 4px 0; font-size: 12px;">
                <span style="display: inline-block; width: 8px; height: 8px; background: ${color}; border-radius: 2px; margin-right: 6px;"></span>
                <span>${question.options[idx]}</span>
                <span style="margin-left: auto; font-weight: bold;">${count} (${percent}%)</span>
            </div>`;
        }).join('');
        
        // Create chart card
        const card = document.createElement('div');
        card.style.cssText = 'border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; background: #fafafa;';
        card.innerHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #333;">Q${questionIndex + 1}: ${question.question.substring(0, 50)}...</h4>
            <div style="display: flex; gap: 12px;">
                <div style="flex-shrink: 0;">
                    <div style="width: 100px; height: 100px; border-radius: 50%; background: conic-gradient(${gradient}); box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>
                </div>
                <div style="flex: 1; font-size: 11px;">
                    ${legend}
                </div>
            </div>
        `;
        
        grid.appendChild(card);
    }
}

async function logout() {
    try {
        await secureApiCall(`${API_BASE}/logout`, { method: 'POST' });
    } catch (err) {
        console.error('Logout error:', err);
    }
    currentAccess = null;
    sessions = [];
    disconnectFacilitatorSocket();
    selectedSessionIds.clear();
    courseLaunchUrlsCollapsed = false;
    saveState();
    doc('loginSection').style.display = 'block';
    doc('sessionsSection').style.display = 'none';
    doc('logoutBtn').style.display = 'none';
    doc('password').value = '';
    doc('institutionSlug').value = '';
    doc('courseSlug').value = '';
    const courseLaunchUrlsCard = doc('courseLaunchUrlsCard');
    if (courseLaunchUrlsCard) courseLaunchUrlsCard.style.display = 'none';
    const courseLaunchUrlsList = doc('courseLaunchUrlsList');
    if (courseLaunchUrlsList) courseLaunchUrlsList.innerHTML = '';
    closeCourseQrModal();
    showSuccess('Logged out');
}

async function checkAuth() {
    try {
        const res = await secureApiCall(`${API_BASE}/check`);
        
        if (res.expired) {
            return;
        }
        
        if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.access) {
                currentAccess = data.access;
                showSessionsSection();
                loadSessions();
                return;
            }
        }
    } catch (err) {
        console.error('Auth check error:', err);
    }
    // Not authenticated - show login form
    doc('loginSection').style.display = 'block';
}

async function deleteSelectedSessions() {
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) {
        alert('No sessions selected for deletion.');
        return;
    }
    
    const confirmation = confirm(`You are about to permanently delete ${ids.length} session${ids.length > 1 ? 's' : ''}. Are you sure you want to continue?`);
    if (!confirmation) {
        return;
    }
    
    try {
        const res = await secureApiCall(`${API_BASE}/sessions`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds: ids })
        });
        
        if (res.expired) {
            return;
        }
        
        if (!res.ok) {
            const error = await res.json();
            showError(`Failed to delete sessions: ${error.error || 'Unknown error'}`);
            return;
        }
        
        const result = await res.json();
        showSuccess(`Successfully deleted ${result.deletedCount} session${result.deletedCount > 1 ? 's' : ''}`);
        
        // Clear selected sessions and reload
        selectedSessionIds.clear();
        savedSelectionIds.clear();
        saveState();
        await loadSessions();
        updateSelectedSessionsPanel();
    } catch (err) {
        console.error('Delete error:', err);
        showError('Failed to delete sessions');
    }
}

function getDownloadFilenameFromDisposition(disposition, fallback = 'k2_sessions_export.json') {
    if (!disposition) return fallback;
    const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch && utfMatch[1]) {
        return decodeURIComponent(utfMatch[1]);
    }
    const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (basicMatch && basicMatch[1]) {
        return basicMatch[1];
    }
    return fallback;
}

async function downloadAccessData(courseSlug = '') {
    try {
        const normalizedCourseSlug = String(courseSlug || '').toLowerCase().trim();
        const query = normalizedCourseSlug ? `?courseSlug=${encodeURIComponent(normalizedCourseSlug)}` : '';
        const res = await secureApiCall(`${API_BASE}/export-sessions${query}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res || res.expired) {
            return;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showError(err.error || 'Failed to export data');
            return;
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || res.headers.get('content-disposition');
        const fileName = getDownloadFilenameFromDisposition(disposition);

        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);

        if (normalizedCourseSlug) {
            showSuccess(`Backup file downloaded for ${normalizedCourseSlug}`);
        } else {
            showSuccess('Data export downloaded');
        }
    } catch (err) {
        console.error('Download data error:', err);
        showError('Failed to download data export');
    }
}

function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return `"${text.replace(/"/g, '""')}"`;
}

function buildSessionDetailsCsv(selectedSessions) {
    const excludedCsvKeys = new Set(['uniqueID', 'events', 'quiz']);
    const headerSet = new Set();
    selectedSessions.forEach((session) => {
        getSessionDetailsKeys(session, 'summary').forEach((key) => {
            if (!excludedCsvKeys.has(key)) {
                headerSet.add(key);
            }
        });
    });

    const answeredQuestionNumbers = new Set();
    selectedSessions.forEach((session) => {
        if (!Array.isArray(session.quiz)) return;
        session.quiz.forEach((answersForQuestion, idx) => {
            if (Array.isArray(answersForQuestion) && answersForQuestion.length > 0) {
                answeredQuestionNumbers.add(idx + 1);
            }
        });
    });
    const quizColumns = Array.from(answeredQuestionNumbers)
        .sort((a, b) => a - b)
        .map((qNum) => `quiz_q${qNum}`);

    const orderedHeader = ['name', 'dateID', 'dateAccessed', 'institution', 'course', 'teamCountry', 'state'];
    const dynamicKeys = Array.from(headerSet).filter((key) => !orderedHeader.includes(key)).sort((a, b) => a.localeCompare(b));
    const columns = orderedHeader.filter((key) => headerSet.has(key)).concat(dynamicKeys, quizColumns);

    const lines = [];
    lines.push(columns.map(csvEscape).join(','));

    selectedSessions.forEach((session) => {
        const row = columns.map((key) => {
            if (key.startsWith('quiz_q')) {
                const qNumber = Number(key.slice('quiz_q'.length));
                const questionIndex = Number.isFinite(qNumber) ? qNumber - 1 : -1;
                return getQuizAnswerPlainTextForQuestion(session.quiz, questionIndex);
            }
            if (!Object.prototype.hasOwnProperty.call(session, key)) return '';
            return formatSessionPropertyValueForCsv(session[key], key);
        });
        lines.push(row.map(csvEscape).join(','));
    });

    return lines.join('\r\n');
}

function downloadSelectedSessionDetailsCsv() {
    const selectedSessions = sessions.filter((s) => s.uniqueID && selectedSessionIds.has(s.uniqueID));
    if (!selectedSessions.length) {
        showError('No sessions selected for detail export');
        return;
    }

    const csv = buildSessionDetailsCsv(selectedSessions);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const inst = ((currentAccess && currentAccess.institutionSlug) || 'inst').toLowerCase();
    const course = ((currentAccess && currentAccess.courseSlug) || 'all').toLowerCase();
    const fileName = `k2_session_details_${inst}_${course}_${stamp}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
    showSuccess('Session detail CSV downloaded');
}
if (doc('loginForm')) {
    doc('loginForm').addEventListener('submit', login);
}
if (doc('accessType')) {
    doc('accessType').addEventListener('change', handleAccessTypeChange);
}
if (doc('institutionSlug')) {
    doc('institutionSlug').addEventListener('change', handleInstitutionChange);
}
if (doc('logoutBtn')) {
    doc('logoutBtn').addEventListener('click', logout);
}

// Add filter listeners
document.addEventListener('DOMContentLoaded', () => {
    loadSavedState();

    updateSessionDetailsModeButton();

    const sessionDetailsModeBtn = doc('sessionDetailsModeBtn');
    if (sessionDetailsModeBtn) {
        sessionDetailsModeBtn.addEventListener('click', () => {
            sessionDetailsMode = sessionDetailsMode === 'summary' ? 'full' : 'summary';
            updateSessionDetailsModeButton();
            if (activeSessionDetails) {
                renderSessionDetailsModal(activeSessionDetails);
            }
        });
    }

    const sessionDetailsCloseBtn = doc('sessionDetailsCloseBtn');
    if (sessionDetailsCloseBtn) {
        sessionDetailsCloseBtn.addEventListener('click', closeSessionDetailsModal);
    }

    const sessionDetailsModal = doc('sessionDetailsModal');
    if (sessionDetailsModal) {
        sessionDetailsModal.addEventListener('click', (event) => {
            if (event.target === sessionDetailsModal) {
                closeSessionDetailsModal();
            }
        });
    }
    const courseQrCloseBtn = doc('courseQrCloseBtn');
    if (courseQrCloseBtn) {
        courseQrCloseBtn.addEventListener('click', closeCourseQrModal);
    }

    const courseQrCopyBtn = doc('courseQrCopyBtn');
    if (courseQrCopyBtn) {
        courseQrCopyBtn.addEventListener('click', async () => {
            if (!activeCourseQr) return;
            const originalText = courseQrCopyBtn.textContent;
            try {
                await copyCourseQrToClipboard(activeCourseQr);
                courseQrCopyBtn.textContent = 'Copied';
                showSuccess('Image copied to clipboard');
                setTimeout(() => {
                    courseQrCopyBtn.textContent = originalText;
                }, 1200);
            } catch (err) {
                console.warn('Failed to copy course QR code:', err);
                showError('Copying QR images is not supported in this browser');
            }
        });
    }

    const courseQrModal = doc('courseQrModal');
    if (courseQrModal) {
        courseQrModal.addEventListener('click', (event) => {
            if (event.target === courseQrModal) {
                closeCourseQrModal();
            }
        });
    }

    const restoreReportCloseBtn = doc('restoreReportCloseBtn');
    if (restoreReportCloseBtn) {
        restoreReportCloseBtn.addEventListener('click', closeRestoreReportModal);
    }

    const restoreReportModal = doc('restoreReportModal');
    if (restoreReportModal) {
        restoreReportModal.addEventListener('click', (event) => {
            if (event.target === restoreReportModal) {
                closeRestoreReportModal();
            }
        });
    }

    const deactivateWarningCloseBtn = doc('deactivateWarningCloseBtn');
    if (deactivateWarningCloseBtn) {
        deactivateWarningCloseBtn.addEventListener('click', closeDeactivateWarningModal);
    }

    const deactivateWarningCancelBtn = doc('deactivateWarningCancelBtn');
    if (deactivateWarningCancelBtn) {
        deactivateWarningCancelBtn.addEventListener('click', () => resolveDeactivateWarning(false));
    }

    const deactivateWarningConfirmBtn = doc('deactivateWarningConfirmBtn');
    if (deactivateWarningConfirmBtn) {
        deactivateWarningConfirmBtn.addEventListener('click', () => resolveDeactivateWarning(true));
    }

    const deactivateWarningModal = doc('deactivateWarningModal');
    if (deactivateWarningModal) {
        deactivateWarningModal.addEventListener('click', (event) => {
            if (event.target === deactivateWarningModal) {
                closeDeactivateWarningModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSessionDetailsModal();
            closeCourseQrModal();
            closeRestoreReportModal();
            closeDeactivateWarningModal();
        }
    });
    
    // Add completion filter dropdown listener
    const completionFilterSelect = doc('completionFilter');
    if (completionFilterSelect) {
        completionFilterSelect.addEventListener('change', () => {
            currentPage = 1;
            renderSessions();
            saveState();
        });
    }
    
    // Add course filter dropdown listener (institution-level access only)
    const courseFilterSelect = doc('courseFilter');
    if (courseFilterSelect) {
        courseFilterSelect.addEventListener('change', () => {
            currentPage = 1;
            renderSessions();
            saveState();
        });
    }
    
    // Add date filter listeners
    const dateFromInput = doc('dateFrom');
    const dateToInput = doc('dateTo');
    if (dateFromInput) {
        dateFromInput.addEventListener('change', () => {
            currentPage = 1;
            renderSessions();
            saveState();
            updateClearDatesButtonState();
        });
    }
    if (dateToInput) {
        dateToInput.addEventListener('change', () => {
            currentPage = 1;
            renderSessions();
            saveState();
            updateClearDatesButtonState();
        });
    }
    
    // Add clear dates button listener
    const clearBtn = doc('clearDatesBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (dateFromInput) dateFromInput.value = '';
            if (dateToInput) dateToInput.value = '';
            currentPage = 1;
            renderSessions();
            saveState();
            updateClearDatesButtonState();
        });
    }
    
    // Add delete selected button listener
    const deleteBtn = doc('deleteSelectedBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedSessions);
    }

    const downloadSessionDetailsBtn = doc('downloadSessionDetailsBtn');
    if (downloadSessionDetailsBtn) {
        downloadSessionDetailsBtn.addEventListener('click', downloadSelectedSessionDetailsCsv);
    }

    // Copy launch URL button
    const copyLaunchBtn = doc('copyLaunchUrlBtn');
    if (copyLaunchBtn) {
        copyLaunchBtn.addEventListener('click', async () => {
            const input = doc('launchUrlInput');
            if (!input || !input.value) return;
            try {
                await navigator.clipboard.writeText(input.value);
                const orig = copyLaunchBtn.textContent;
                copyLaunchBtn.textContent = 'Copied!';
                setTimeout(() => { copyLaunchBtn.textContent = orig; }, 1500);
            } catch (err) {
                // Fallback for browsers without clipboard API
                input.select();
                document.execCommand('copy');
            }
        });
    }

    updateClearDatesButtonState();
    initThemeToggle();
});

// Ensure saved selections are available before auth check
loadSavedState();

// Check auth on page load
(async () => {
    await loadAccessLoginOptions();
    handleAccessTypeChange();
    await checkAuth();
})();
