const API_BASE = '/admin/api';
const STORAGE_KEY = 'admin_institution_state';
const UI_STATE_KEY = 'admin_dashboard_ui_state';
const doc = (id) => document.getElementById(id);
let csrfToken = null;
let formMode = 'create';
let editingId = null;
let courseList = [];
let institutionsCache = [];
let courseSlugEdited = false;
let instSlugEdited = false;
let originalCourseList = [];
let originalInstSlug = '';
let originalInstTitle = '';
let accessKeys = [];
let sessionsCache = [];
let selectedSessionIds = new Set();
let sessionsSortField = 'date';
let sessionsSortDirection = 'desc';
const SESSIONS_PER_PAGE = 20;
let sessionsCurrentPage = 1;
let activeRestoreJobId = null;
let restorePollTimer = null;
let openGeneratedAccessKeyModal = null;
let retentionRunsCache = [];
let retentionArchivesCache = [];
let retentionArchivePendingOnly = false;
let draggedPanelId = null;
let sessionRetentionDays = 90;
let pendingRestorePackageData = null;
let pendingRestoreFileName = '';

function initRetentionArchiveFilterState() {
    const uiState = getUiState();
    retentionArchivePendingOnly = Boolean(uiState.retentionArchivePendingOnly);
    const toggle = doc('retentionArchivePendingOnly');
    if (toggle) {
        toggle.checked = retentionArchivePendingOnly;
    }
}

function formatBuildTimestamp(isoString) {
    if (!isoString) return 'Unknown build time';
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString();
}

async function loadBuildInfo(role) {
    const buildInfoLine = doc('buildInfoLine');
    if (!buildInfoLine) return;

    if (role !== 'superuser' && role !== 'admin') {
        buildInfoLine.style.display = 'none';
        buildInfoLine.textContent = '';
        return;
    }

    try {
        const res = await fetch('/data/build-info.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Build info unavailable');
        const buildInfo = await res.json();
        const buildTime = formatBuildTimestamp(buildInfo.timestamp);
        const releaseTag = buildInfo.githubReleaseTag || 'none';
        const ciRunNumber = buildInfo.githubRunNumber || buildInfo.releaseNumber || 'n/a';
        buildInfoLine.textContent = `Build: ${buildTime} | GitHub Release: ${releaseTag} | CI Run: ${ciRunNumber}`;
        buildInfoLine.style.display = 'block';
    } catch (err) {
        buildInfoLine.textContent = 'Build: unavailable | GitHub Release: unavailable | CI Run: unavailable';
        buildInfoLine.style.display = 'block';
    }
}

// State persistence helpers
function saveState() {
    const state = {
        formMode,
        editingId,
        courseList,
        originalCourseList,
        originalInstSlug,
        originalInstTitle,
        instSlug: doc('instSlug').value,
        instTitle: doc('instTitle').value,
        courseSlugEdited,
        instSlugEdited
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
        const state = JSON.parse(saved);
        formMode = state.formMode || 'create';
        editingId = state.editingId || null;
        courseList = state.courseList || [];
        originalCourseList = state.originalCourseList || [];
        originalInstSlug = state.originalInstSlug || '';
        originalInstTitle = state.originalInstTitle || '';
        courseSlugEdited = state.courseSlugEdited || false;
        instSlugEdited = state.instSlugEdited || false;
        doc('instSlug').value = state.instSlug || '';
        doc('instTitle').value = state.instTitle || '';
        renderCourseList();
        updateFormLabels();
        updateButtonState();
        if (formMode === 'edit') {
            setCreateInstitutionCollapsed(false);
        }
        return true;
    } catch (err) {
        console.error('Failed to restore state:', err);
        clearState();
        return false;
    }
}

function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}

function getUiState() {
    try {
        const saved = localStorage.getItem(UI_STATE_KEY);
        if (!saved) return {};
        return JSON.parse(saved) || {};
    } catch (err) {
        console.warn('Failed to parse dashboard UI state:', err);
        return {};
    }
}

function saveUiState(partial) {
    const next = { ...getUiState(), ...partial };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(next));
}

function getPanelCards() {
    const adminSection = doc('adminSection');
    if (!adminSection) return [];
    return Array.from(adminSection.children).filter((child) =>
        child.classList
        && child.classList.contains('section-card')
        && child.dataset
        && child.dataset.panelId
    );
}

function persistPanelOrder() {
    const order = getPanelCards().map((card) => card.dataset.panelId).filter(Boolean);
    saveUiState({ panelOrder: order });
}

function applySavedPanelOrder() {
    const adminSection = doc('adminSection');
    if (!adminSection) return;
    const uiState = getUiState();
    const order = Array.isArray(uiState.panelOrder) ? uiState.panelOrder : [];
    if (order.length === 0) return;

    const cards = getPanelCards();
    if (cards.length === 0) return;

    const byId = new Map(cards.map((card) => [card.dataset.panelId, card]));
    const orderedCards = order
        .map((id) => byId.get(id))
        .filter(Boolean);
    const remainingCards = cards.filter((card) => !order.includes(card.dataset.panelId));

    [...orderedCards, ...remainingCards].forEach((card) => {
        adminSection.appendChild(card);
    });
}

function clearDropTargets() {
    getPanelCards().forEach((card) => card.classList.remove('panel-drop-target'));
}

function initPanelDragSort() {
    const adminSection = doc('adminSection');
    if (!adminSection) return;

    applySavedPanelOrder();
    const cards = getPanelCards();

    cards.forEach((card) => {
        const header = card.querySelector('.section-card-header');
        if (!header) return;

        header.setAttribute('draggable', 'true');
        header.classList.add('panel-drag-handle');

        header.addEventListener('dragstart', (event) => {
            draggedPanelId = card.dataset.panelId;
            card.classList.add('panel-dragging');
            document.body.classList.add('panel-reordering');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedPanelId || '');
            }
        });

        header.addEventListener('dragend', () => {
            draggedPanelId = null;
            card.classList.remove('panel-dragging');
            document.body.classList.remove('panel-reordering');
            clearDropTargets();
            persistPanelOrder();
        });

        card.addEventListener('dragover', (event) => {
            if (!draggedPanelId || draggedPanelId === card.dataset.panelId) return;

            const draggedCard = cards.find((entry) => entry.dataset.panelId === draggedPanelId)
                || adminSection.querySelector(`[data-panel-id="${draggedPanelId}"]`);
            if (!draggedCard) return;

            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }

            clearDropTargets();
            card.classList.add('panel-drop-target');

            const rect = card.getBoundingClientRect();
            const insertBefore = event.clientY < rect.top + rect.height / 2;
            if (insertBefore) {
                adminSection.insertBefore(draggedCard, card);
            } else {
                adminSection.insertBefore(draggedCard, card.nextSibling);
            }
        });

        card.addEventListener('drop', (event) => {
            if (!draggedPanelId) return;
            event.preventDefault();
            clearDropTargets();
            persistPanelOrder();
        });
    });
}

function setCreateInstitutionCollapsed(collapsed, persist = true) {
    const body = doc('createInstitutionBody');
    const toggleBtn = doc('createInstitutionToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ createInstitutionCollapsed: collapsed });
    }
}

function initCreateInstitutionPane() {
    const toggleBtn = doc('createInstitutionToggleBtn');
    if (!toggleBtn) return;

    // Default is collapsed unless user preference exists.
    const uiState = getUiState();
    const collapsed = typeof uiState.createInstitutionCollapsed === 'boolean'
        ? uiState.createInstitutionCollapsed
        : true;
    setCreateInstitutionCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setCreateInstitutionCollapsed(isExpanded);
    });
}

function setAccessKeysCollapsed(collapsed, persist = true) {
    const body = doc('accessKeysBody');
    const toggleBtn = doc('accessKeysToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ accessKeysCollapsed: collapsed });
    }
}

function initAccessKeysPane() {
    const toggleBtn = doc('accessKeysToggleBtn');
    if (!toggleBtn) return;

    // Default is collapsed unless user preference exists.
    const uiState = getUiState();
    const collapsed = typeof uiState.accessKeysCollapsed === 'boolean'
        ? uiState.accessKeysCollapsed
        : true;
    setAccessKeysCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setAccessKeysCollapsed(isExpanded);
    });
}

function setInstitutionsCollapsed(collapsed, persist = true) {
    const body = doc('institutionsBody');
    const toggleBtn = doc('institutionsToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ institutionsCollapsed: collapsed });
    }
}

function initInstitutionsPane() {
    const toggleBtn = doc('institutionsToggleBtn');
    if (!toggleBtn) return;

    // Default is collapsed unless user preference exists.
    const uiState = getUiState();
    const collapsed = typeof uiState.institutionsCollapsed === 'boolean'
        ? uiState.institutionsCollapsed
        : true;
    setInstitutionsCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setInstitutionsCollapsed(isExpanded);
    });
}

function setSessionsCollapsed(collapsed, persist = true) {
    const body = doc('sessionsBody');
    const toggleBtn = doc('sessionsToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ sessionsCollapsed: collapsed });
    }
}

function initSessionsPane() {
    const toggleBtn = doc('sessionsToggleBtn');
    if (!toggleBtn) return;

    const uiState = getUiState();
    const collapsed = typeof uiState.sessionsCollapsed === 'boolean'
        ? uiState.sessionsCollapsed
        : true;
    setSessionsCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setSessionsCollapsed(isExpanded);
    });
}

function setRestoreCollapsed(collapsed, persist = true) {
    const body = doc('restoreBody');
    const toggleBtn = doc('restoreToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ restoreCollapsed: collapsed });
    }
}

function initRestorePane() {
    const toggleBtn = doc('restoreToggleBtn');
    if (!toggleBtn) return;

    const uiState = getUiState();
    const collapsed = typeof uiState.restoreCollapsed === 'boolean'
        ? uiState.restoreCollapsed
        : true;
    setRestoreCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setRestoreCollapsed(isExpanded);
    });

    // Setup restore preview panel event listeners
    const uploadForm = doc('restoreUploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleRestoreUpload);
    }

    const cancelBtn1 = doc('restorePreviewCancelBtn');
    const cancelBtn2 = doc('restorePreviewCancelBtn2');
    const completeBtn = doc('restoreCompleteBtn');

    if (cancelBtn1) {
        cancelBtn1.addEventListener('click', (e) => {
            e.preventDefault();
            hideRestorePreviewPanel();
        });
    }

    if (cancelBtn2) {
        cancelBtn2.addEventListener('click', (e) => {
            e.preventDefault();
            hideRestorePreviewPanel();
        });
    }

    if (completeBtn) {
        completeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleCompleteRestore();
        });
    }

    // Setup file input listener
    const fileInput = doc('restoreFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', updateRestoreFileState);
    }
}

function setRetentionCollapsed(collapsed, persist = true) {
    const body = doc('retentionBody');
    const toggleBtn = doc('retentionToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ retentionCollapsed: collapsed });
    }
}

function initRetentionPane() {
    const toggleBtn = doc('retentionToggleBtn');
    if (!toggleBtn) return;

    const uiState = getUiState();
    const collapsed = typeof uiState.retentionCollapsed === 'boolean'
        ? uiState.retentionCollapsed
        : true;
    setRetentionCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setRetentionCollapsed(isExpanded);
    });
}

function setAdminUsersCollapsed(collapsed, persist = true) {
    const body = doc('adminUsersBody');
    const toggleBtn = doc('adminUsersToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ adminUsersCollapsed: collapsed });
    }
}

function initAdminUsersPane() {
    const toggleBtn = doc('adminUsersToggleBtn');
    if (!toggleBtn) return;

    const uiState = getUiState();
    const collapsed = typeof uiState.adminUsersCollapsed === 'boolean'
        ? uiState.adminUsersCollapsed
        : true;
    setAdminUsersCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setAdminUsersCollapsed(isExpanded);
    });
}

function setSessionGeneratorCollapsed(collapsed, persist = true) {
    const body = doc('sessionGeneratorBody');
    const toggleBtn = doc('sessionGeneratorToggleBtn');
    if (!body || !toggleBtn) return;

    body.style.display = collapsed ? 'none' : 'block';
    toggleBtn.textContent = collapsed ? 'Expand' : 'Collapse';
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist) {
        saveUiState({ sessionGeneratorCollapsed: collapsed });
    }
}

function initSessionGeneratorPane() {
    const toggleBtn = doc('sessionGeneratorToggleBtn');
    if (!toggleBtn) return;

    const uiState = getUiState();
    const collapsed = typeof uiState.sessionGeneratorCollapsed === 'boolean'
        ? uiState.sessionGeneratorCollapsed
        : true;
    setSessionGeneratorCollapsed(collapsed, false);

    toggleBtn.addEventListener('click', () => {
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        setSessionGeneratorCollapsed(isExpanded);
    });
}

function setRestoreControlsDisabled(disabled) {
    const fileInput = doc('restoreFileInput');
    const uploadBtn = doc('restoreUploadBtn');
    if (fileInput) fileInput.disabled = disabled;
    if (uploadBtn) uploadBtn.disabled = disabled || !(fileInput && fileInput.files && fileInput.files[0]);
}

function formatRestoreTime(isoString) {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderRestoreJob(job) {
    const summary = doc('restoreStatusSummary');
    const log = doc('restoreStatusLog');
    if (!summary || !log) return;

    if (!job) {
        summary.textContent = 'No restore job running.';
        log.innerHTML = '<div class="restore-status-line muted">Progress updates will appear here during restore.</div>';
        return;
    }

    const total = Number(job.totalSessions || 0);
    const processed = Number(job.processedSessions || 0);
    const restored = Number(job.restoredSessions || 0);
    const failed = Number(job.failedSessions || 0);
    const statusLabel = String(job.status || 'queued').replace(/-/g, ' ');
    summary.textContent = `Status: ${statusLabel} | Processed ${processed}/${total} | Restored ${restored} | Failed ${failed}`;

    const events = Array.isArray(job.events) ? job.events : [];
    if (events.length === 0) {
        log.innerHTML = '<div class="restore-status-line muted">Waiting for restore updates.</div>';
        return;
    }

    log.innerHTML = events.map((event) => {
        const level = escapeHtml(event.level || 'info');
        const time = escapeHtml(formatRestoreTime(event.time));
        const message = escapeHtml(event.message || '');
        return `<div class="restore-status-line level-${level}"><span class="restore-status-line-time">${time}</span>${message}</div>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
}

function stopRestorePolling() {
    if (restorePollTimer) {
        clearTimeout(restorePollTimer);
        restorePollTimer = null;
    }
}

async function pollRestoreJob(jobId) {
    if (!jobId) return;
    try {
        const res = await fetch(`${API_BASE}/restore/jobs/${encodeURIComponent(jobId)}`, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showError((data && data.error) || 'Failed to fetch restore progress');
            activeRestoreJobId = null;
            stopRestorePolling();
            setRestoreControlsDisabled(false);
            updateRestoreFileState();
            return;
        }

        renderRestoreJob(data);
        const finished = ['completed', 'completed-with-errors', 'failed'].includes(data.status);
        if (finished) {
            activeRestoreJobId = null;
            stopRestorePolling();
            setRestoreControlsDisabled(false);
            updateRestoreFileState();
            await Promise.all([loadSessions(), loadAccessKeys(), loadInstitutions()]);
            if (data.status === 'completed') {
                showSuccess('Restore completed');
            } else if (data.status === 'completed-with-errors') {
                showError('Restore completed with some failures. Review the Restore panel log.');
            } else {
                showError('Restore failed. Review the Restore panel log.');
            }
            return;
        }

        restorePollTimer = setTimeout(() => pollRestoreJob(jobId), 800);
    } catch (err) {
        showError('Failed to poll restore progress: ' + err.message);
        activeRestoreJobId = null;
        stopRestorePolling();
        setRestoreControlsDisabled(false);
        updateRestoreFileState();
    }
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

    themeBtn.style.display = 'inline-block';
    
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

function initAccessKeysHelpModal() {
    const openBtn = doc('accessKeysHelpBtn');
    const closeBtn = doc('accessKeysHelpCloseBtn');
    const modal = doc('accessKeysHelpModal');
    if (!openBtn || !closeBtn || !modal) return;

    const openModal = () => {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

function initGeneratedAccessKeyModal() {
    const modal = doc('generatedAccessKeyModal');
    const closeBtn = doc('generatedAccessKeyCloseBtn');
    const copyBtn = doc('generatedAccessKeyCopyBtn');
    const detailsEl = doc('generatedAccessKeyDetails');
    if (!modal || !closeBtn || !copyBtn || !detailsEl) return;

    let credentialsText = '';

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };

    openGeneratedAccessKeyModal = (accessKey) => {
        credentialsText =
            `ID: ${accessKey.id}\n` +
            `Type: ${accessKey.type}\n` +
            `Scope: ${accessKey.institutionSlug}/${accessKey.courseSlug}\n` +
            `Label: ${accessKey.label}\n` +
            `Password: ${accessKey.password}`;
        detailsEl.textContent = credentialsText;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(credentialsText);
            showSuccess('Access key credentials copied to clipboard.');
        } catch (_err) {
            showError('Could not copy to clipboard. Please copy manually from the dialog.');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

function showError(message) {
    const el = doc('errorMsg');
    el.textContent = message;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 5000);
}

function showSuccess(message) {
    const el = doc('successMsg');
    el.textContent = message;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 3000);
}

function showLoginErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'invalid') {
        showError('Invalid username or password');
    } else if (error === 'required') {
        showError('Please enter username and password');
    }
}

async function loadCsrfToken() {
    try {
        const res = await fetch('/auth/csrf-token', {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        if (res.ok) {
            const data = await res.json();
            csrfToken = data.csrfToken || null;
        }
    } catch (err) {
        console.error('CSRF token fetch failed:', err);
    }
}

function updateFormLabels() {
    doc('formTitle').textContent = formMode === 'edit' ? 'Edit Institution' : 'Create Institution';
    doc('saveInstitutionBtn').textContent = formMode === 'edit' ? 'Save Changes' : 'Create Institution';
    doc('cancelEditBtn').style.display = formMode === 'edit' ? 'inline-block' : 'none';
}

function renderCourseList() {
    const container = document.getElementById('courseList');
    if (!courseList.length) {
        container.innerHTML = '<p class="muted">No courses added yet.</p>';
        return;
    }
    container.innerHTML = courseList.map((c, idx) => `
        <div class="course-pill ${c.deleted ? 'deleted' : ''}" data-index="${idx}">
            ${c.editing ? `
                <div style="display: flex; gap: 8px; flex: 1;">
                    <input type="text" class="course-edit-name" value="${c.name}" placeholder="Course name" style="flex: 2;">
                    <input type="text" class="course-edit-slug" value="${c.slug}" placeholder="stub" style="flex: 1;">
                </div>
                <div style="display: flex; gap: 4px;">
                    <button type="button" class="secondary small save-course" data-index="${idx}">Save</button>
                    <button type="button" class="secondary small cancel-course-edit" data-index="${idx}">Cancel</button>
                </div>
            ` : `
                <div>
                    <strong>${c.name}</strong>
                    <span class="pill-sub">${c.slug}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button type="button" class="secondary small edit-course" data-index="${idx}" ${c.deleted ? 'style="display:none;"' : ''}>Edit</button>
                    <button type="button" class="secondary small remove-course" data-index="${idx}">
                        ${c.deleted ? 'Undo' : 'Remove'}
                    </button>
                </div>
            `}
        </div>
    `).join('');

    // Edit button handler
    container.querySelectorAll('.edit-course').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.target.dataset.index);
            // Store original values for cancel
            courseList[idx].originalName = courseList[idx].name;
            courseList[idx].originalSlug = courseList[idx].slug;
            courseList[idx].editing = true;
            renderCourseList();
        });
    });

    // Save button handler
    container.querySelectorAll('.save-course').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.target.dataset.index);
            const pill = e.target.closest('.course-pill');
            const newName = pill.querySelector('.course-edit-name').value.trim();
            const newSlug = pill.querySelector('.course-edit-slug').value.trim().toLowerCase();
            
            if (!newName || !newSlug) {
                showError('Course name and stub are required');
                return;
            }

            // Check for duplicates (excluding current item)
            if (courseList.some((c, i) => i !== idx && c.slug === newSlug)) {
                showError('Duplicate course stub not allowed');
                return;
            }
            if (courseList.some((c, i) => i !== idx && c.name.toLowerCase() === newName.toLowerCase())) {
                showError('Duplicate course name not allowed');
                return;
            }

            courseList[idx].name = newName;
            courseList[idx].slug = newSlug;
            delete courseList[idx].editing;
            delete courseList[idx].originalName;
            delete courseList[idx].originalSlug;
            renderCourseList();
            updateButtonState();
        });
    });

    // Cancel button handler
    container.querySelectorAll('.cancel-course-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.target.dataset.index);
            // Restore original values
            courseList[idx].name = courseList[idx].originalName;
            courseList[idx].slug = courseList[idx].originalSlug;
            delete courseList[idx].editing;
            delete courseList[idx].originalName;
            delete courseList[idx].originalSlug;
            renderCourseList();
        });
    });

    // Remove/Undo button handler
    container.querySelectorAll('.remove-course').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.target.dataset.index);
            if (courseList[idx].deleted) {
                // Undo deletion - remove the deleted property entirely
                delete courseList[idx].deleted;
            } else {
                // Mark for deletion
                courseList[idx].deleted = true;
            }
            renderCourseList();
            updateButtonState();
        });
    });
}

function resetForm() {
    formMode = 'create';
    editingId = null;
    doc('instSlug').value = '';
    doc('instTitle').value = '';
    doc('courseName').value = '';
    doc('courseSlug').value = '';
    courseSlugEdited = false;
    instSlugEdited = false;
    courseList = [];
    originalCourseList = [];
    originalInstSlug = '';
    originalInstTitle = '';
    renderCourseList();
    updateFormLabels();
    updateButtonState();
    clearState();
}

function hasChanges() {
    const currentSlug = doc('instSlug').value.trim();
    const currentTitle = doc('instTitle').value.trim();
    if (formMode === 'create') {
        return currentSlug && currentTitle;
    } else {
        const slugChanged = currentSlug !== originalInstSlug;
        const titleChanged = currentTitle !== originalInstTitle;
        const coursesChanged = JSON.stringify(courseList) !== JSON.stringify(originalCourseList);
        return slugChanged || titleChanged || coursesChanged;
    }
}

function updateButtonState() {
    const btn = doc('saveInstitutionBtn');
    const isEnabled = hasChanges();
    btn.disabled = !isEnabled;
    isEnabled ? btn.classList.remove('disabled') : btn.classList.add('disabled');
    if (formMode === 'edit') {
        saveState();
    }
}

const deriveSlug = (name) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    
    // Common lowercase words to exclude (articles, prepositions, conjunctions)
    const excludeWords = ['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'and', 'or', 'but'];
    
    // Count words with more than 1 letter and not in exclude list
    const significantWords = parts.filter(word => 
        word.length > 1 && !excludeWords.includes(word.toLowerCase())
    );
    const wordCount = significantWords.length;
    
    let base = '';
    if (wordCount === 1) {
        // Only one significant word: take first 4 letters
        base = parts[0].substring(0, 4);
    } else if (wordCount === 2) {
        // Two significant words: take first 2 letters of each
        base = significantWords[0].substring(0, 2) + significantWords[1].substring(0, 2);
    } else {
        // Three or more words: take initials only
        base = significantWords.map(word => word.charAt(0)).join('');
    }
    
    // Ensure result is limited to 4 characters
    return base.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 4);
};

const deriveCourseSlug = deriveSlug;
const deriveInstSlug = deriveSlug;

function maybeAutofillCourseSlug() {
    if (courseSlugEdited) return;
    const nameVal = doc('courseName').value.trim();
    doc('courseSlug').value = deriveCourseSlug(nameVal);
}

function maybeAutofillInstSlug() {
    if (instSlugEdited) return;
    const titleVal = doc('instTitle').value.trim();
    doc('instSlug').value = deriveInstSlug(titleVal);
}

function updateAddCourseButtonState() {
    const name = doc('courseName').value.trim();
    const btn = doc('addCourseBtn');
    btn.disabled = !name;
    name ? btn.classList.remove('disabled') : btn.classList.add('disabled');
}

function addCourse() {
    const name = doc('courseName').value.trim();
    let slug = doc('courseSlug').value.trim();
    if (!name || !slug) {
        showError('Course name and stub are required');
        return;
    }
    const nameKey = name.toLowerCase();
    slug = slug.toLowerCase();
    if (courseList.some(c => c.slug === slug)) {
        showError('Duplicate course stub not allowed');
        return;
    }
    if (courseList.some(c => c.name.toLowerCase() === nameKey)) {
        showError('Duplicate course name not allowed');
        return;
    }
    courseList.push({ name, slug });
    doc('courseName').value = '';
    doc('courseSlug').value = '';
    courseSlugEdited = false;
    renderCourseList();
    updateButtonState();
}

async function login(event) {
    if (event) event.preventDefault();
    const username = doc('username').value.trim();
    const password = doc('password').value;
    if (!username || !password) {
        showError('Please enter username and password');
        return false;
    }
    try {
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const data = await res.json();
            console.log('Login response:', data);
            showSuccess('Authenticated');
            showAdminSection(data.role);
            loadInstitutions();
            loadAccessKeys();
            loadSessions();
            loadAdminUsers(); // Check if user is superuser
            // Update browser URL to admin/dashboard
            window.history.pushState({ page: 'admin' }, 'Admin Dashboard', '/admin');
                    return true;
        } else {
            showError('Invalid username or password');
                    return false;
        }
    } catch (err) {
        showError('Authentication failed: ' + err.message);
        return false;
    }
}

async function showAdminSection(role) {
    document.getElementById('loginSection').classList.remove('active');
    document.getElementById('adminSection').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
    document.body.classList.remove('role-superuser', 'role-admin');
    if (role === 'superuser') {
        document.body.classList.add('role-superuser');
    } else if (role === 'admin') {
        document.body.classList.add('role-admin');
    }
    
    // Update heading with role
    if (role) {
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        document.getElementById('dashboardHeading').textContent = `Dashboard (${roleLabel})`;
    }

    await loadBuildInfo(role);
    await loadRetentionConfig();
    setRetentionReviewVisibility(role === 'superuser');
    if (role === 'superuser') {
        await Promise.all([loadRetentionRuns(), loadRetentionArchives()]);
    }
}

function setRetentionReviewVisibility(show) {
    const section = doc('retentionReviewSection');
    if (!section) return;
    section.style.display = show ? 'block' : 'none';
}

function renderRetentionRuns() {
    const listEl = doc('retentionRunsList');
    const summaryEl = doc('retentionSummary');
    if (!listEl || !summaryEl) return;

    if (!Array.isArray(retentionRunsCache) || retentionRunsCache.length === 0) {
        summaryEl.textContent = 'No retention runs recorded yet.';
        listEl.innerHTML = '<div class="muted">Run `npm run retention:dry` or `npm run retention:apply` to generate audit entries.</div>';
        return;
    }

    const lastRun = retentionRunsCache[0];
    summaryEl.textContent = `Latest run: ${lastRun.mode || 'unknown'} | candidates: ${lastRun.candidates || 0} | archived: ${lastRun.archived || 0} | deleted: ${lastRun.deleted || 0}`;

    listEl.innerHTML = retentionRunsCache.map((run) => {
        const started = run.startedAt ? new Date(run.startedAt).toLocaleString() : 'unknown';
        const errorCount = Array.isArray(run.errors) ? run.errors.length : 0;
        const badgeBg = errorCount > 0 ? '#fee2e2' : '#dcfce7';
        const badgeColor = errorCount > 0 ? '#7f1d1d' : '#14532d';

        return `
            <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; background: #fff;">
                <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <strong>${run.mode || 'UNKNOWN'} run at ${started}</strong>
                    <span style="padding: 2px 8px; border-radius: 999px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 600; font-size: 12px;">errors: ${errorCount}</span>
                </div>
                <div style="margin-top: 6px; color: #4b5563; font-size: 13px;">
                    candidates=${run.candidates || 0} | archived=${run.archived || 0} | deleted=${run.deleted || 0} | skippedNotArchived=${run.skippedNotArchived || 0}
                </div>
            </div>
        `;
    }).join('');
}

function renderRetentionArchives() {
    const summaryEl = doc('retentionArchiveSummary');
    const listEl = doc('retentionArchiveList');
    if (!summaryEl || !listEl) return;

    const toggle = doc('retentionArchivePendingOnly');
    if (toggle) {
        toggle.checked = retentionArchivePendingOnly;
    }

    if (!Array.isArray(retentionArchivesCache) || retentionArchivesCache.length === 0) {
        summaryEl.textContent = 'No archived sessions found.';
        listEl.innerHTML = '<div class="muted">Archive rows will appear here after archive-before-delete runs.</div>';
        return;
    }

    const pendingDeletion = retentionArchivesCache.filter((row) => row.isPendingDeletion === true).length;
    const filteredRows = retentionArchivePendingOnly
        ? retentionArchivesCache.filter((row) => row.isPendingDeletion === true)
        : retentionArchivesCache;

    summaryEl.textContent = `Recent archive rows: ${retentionArchivesCache.length} | showing: ${filteredRows.length} | pending deletion: ${pendingDeletion}`;

    if (filteredRows.length === 0) {
        listEl.innerHTML = '<div class="muted">No archive rows match the current filter.</div>';
        return;
    }

    listEl.innerHTML = filteredRows.map((row) => {
        const archivedAt = row.archivedAt ? new Date(row.archivedAt).toLocaleString() : 'unknown';
        const expiresAt = row.archiveExpiresAt ? new Date(row.archiveExpiresAt).toLocaleString() : 'not set';
        const daysRemaining = Number.isFinite(row.daysUntilDeletion)
            ? (row.daysUntilDeletion <= 0 ? 'pending deletion' : `${row.daysUntilDeletion} day(s) left`)
            : 'unknown';
        const badgeBg = row.isPendingDeletion ? '#fee2e2' : '#dcfce7';
        const badgeColor = row.isPendingDeletion ? '#7f1d1d' : '#14532d';
        const displayName = row.sourceName || row.sourceUniqueID || row.sourceSessionId || 'unknown';

        return `
            <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; background: #fff;">
                <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <strong>${displayName}</strong>
                    <span style="padding: 2px 8px; border-radius: 999px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 600; font-size: 12px;">${daysRemaining}</span>
                </div>
                <div style="margin-top: 6px; color: #4b5563; font-size: 13px;">
                    archivedAt=${archivedAt} | archiveExpiresAt=${expiresAt} | batch=${row.archiveBatchId || 'n/a'}
                </div>
            </div>
        `;
    }).join('');
}

async function loadRetentionRuns() {
    try {
        const res = await fetch(`${API_BASE}/retention/runs?limit=20`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            throw new Error(`Failed to load retention runs (${res.status})`);
        }
        const data = await res.json();
        retentionRunsCache = Array.isArray(data.runs) ? data.runs : [];
        renderRetentionRuns();
    } catch (err) {
        const summaryEl = doc('retentionSummary');
        const listEl = doc('retentionRunsList');
        if (summaryEl) summaryEl.textContent = 'Retention runs unavailable.';
        if (listEl) listEl.innerHTML = `<div class="muted">${err.message}</div>`;
    }
}

async function loadRetentionArchives() {
    try {
        const res = await fetch(`${API_BASE}/retention/archives?limit=20`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            throw new Error(`Failed to load retention archives (${res.status})`);
        }
        const data = await res.json();
        retentionArchivesCache = Array.isArray(data.archives) ? data.archives : [];
        renderRetentionArchives();
    } catch (err) {
        const summaryEl = doc('retentionArchiveSummary');
        const listEl = doc('retentionArchiveList');
        if (summaryEl) summaryEl.textContent = 'Archive retention rows unavailable.';
        if (listEl) listEl.innerHTML = `<div class="muted">${err.message}</div>`;
    }
}

async function loadInstitutions() {
    try {
        const res = await fetch(`${API_BASE}/institutions`);
        if (!res.ok) throw new Error('Failed to fetch');
        const institutions = await res.json();
        institutionsCache = institutions;
        renderInstitutions(institutions);
        populateAccessKeyInstitutionDropdown(institutions);
        populateSessionGeneratorInstitutionDropdown(institutions);
        applySessionGeneratorDefaults(institutions);
        return institutions;
    } catch (err) {
        showError('Failed to load institutions: ' + err.message);
        return [];
    }
}

async function loadAccessKeys() {
    try {
        const res = await fetch(`${API_BASE}/access-keys`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            if (res.status === 403) {
                const data = await res.json();
                if (data.loginUrl) {
                    window.location.href = data.loginUrl;
                    return;
                }
            }
            throw new Error('Failed to fetch access keys');
        }
        accessKeys = await res.json();
        renderAccessKeys();
        const institutionInput = doc('sessionGeneratorInstitution');
        const courseInput = doc('sessionGeneratorCourse');
        populateSessionGeneratorAccessKeyDropdown(
            institutionInput ? institutionInput.value : '',
            courseInput ? courseInput.value : ''
        );
    } catch (err) {
        showError('Failed to load access keys: ' + err.message);
    }
}

async function loadSessions() {
    try {
        const res = await fetch(`${API_BASE}/sessions`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            if (res.status === 403) {
                const data = await res.json();
                if (data.loginUrl) {
                    window.location.href = data.loginUrl;
                    return;
                }
            }
            throw new Error('Failed to fetch sessions');
        }
        sessionsCache = await res.json();
        const validIds = new Set((sessionsCache || []).map((s) => String(s._id || '')).filter(Boolean));
        selectedSessionIds = new Set(Array.from(selectedSessionIds).filter((id) => validIds.has(id)));
        const totalPages = Math.max(1, Math.ceil((sessionsCache || []).length / SESSIONS_PER_PAGE));
        sessionsCurrentPage = Math.min(sessionsCurrentPage, totalPages);
        renderSessionsList(sessionsCache);
        renderAccessKeys();
    } catch (err) {
        showError('Failed to load sessions: ' + err.message);
    }
}

function getSessionSortValue(session, field) {
    if (field === 'name') {
        // Extract numeric part from session name (e.g., "k2session_1001" -> 1001)
        const nameStr = String(session.name || '');
        const match = nameStr.match(/_(\d+)$/);
        if (match && match[1]) {
            return Number(match[1]);
        }
        // Fallback to string comparison if no numeric part found
        return Number.MAX_SAFE_INTEGER;
    }
    if (field === 'scope') {
        const institution = String(session.institution || '').toLowerCase();
        const course = String(session.course || '').toLowerCase();
        return `${institution}/${course}`;
    }
    if (field === 'uniqueID') {
        return String(session.uniqueID || '').toLowerCase();
    }
    if (field === 'date') {
        const raw = Number(session.dateAccessed || session.dateID || 0);
        return Number.isFinite(raw) ? raw : 0;
    }
    if (field === 'expiry') {
        const raw = session.expiresAt ? new Date(session.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
    }
    if (field === 'state') {
        const state = String(session.state || '').toLowerCase();
        const completed = state.startsWith('completed') ? 1 : 0;
        return `${completed}-${state}`;
    }
    if (field === 'accessKey') {
        return String(session.accessKeyId || 'legacy/none').toLowerCase();
    }
    return '';
}

function sortSessionsForDisplay(sessions) {
    const sorted = [...(sessions || [])];
    sorted.sort((a, b) => {
        const av = getSessionSortValue(a, sessionsSortField);
        const bv = getSessionSortValue(b, sessionsSortField);
        if (av < bv) return sessionsSortDirection === 'asc' ? -1 : 1;
        if (av > bv) return sessionsSortDirection === 'asc' ? 1 : -1;
        const an = String(a.name || '').toLowerCase();
        const bn = String(b.name || '').toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
    });
    return sorted;
}

function getSortArrow(field) {
    if (sessionsSortField !== field) return '';
    return sessionsSortDirection === 'asc' ? ' ▲' : ' ▼';
}

function updateSelectedSessionsCount() {
    const countEl = doc('selectedSessionsCount');
    if (!countEl) return;
    countEl.textContent = `${selectedSessionIds.size} selected`;
}

function updateSelectAllDbButton() {
    const btn = doc('selectAllDbSessionsBtn');
    if (!btn) return;
    const total = Array.isArray(sessionsCache) ? sessionsCache.length : 0;
    btn.textContent = `Select all (${total} total)`;
    btn.disabled = total === 0;
}

function renderSessionsList(sessions) {
    const container = doc('sessionsContainer');
    if (!container) return;

    updateSelectAllDbButton();

    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<p class="muted">No sessions found.</p>';
        updateSelectedSessionsCount();
        return;
    }

    const sortedSessions = sortSessionsForDisplay(sessions);
    const totalPages = Math.max(1, Math.ceil(sortedSessions.length / SESSIONS_PER_PAGE));
    sessionsCurrentPage = Math.min(Math.max(1, sessionsCurrentPage), totalPages);
    const startIndex = (sessionsCurrentPage - 1) * SESSIONS_PER_PAGE;
    const pageSessions = sortedSessions.slice(startIndex, startIndex + SESSIONS_PER_PAGE);

    container.innerHTML = `
        <table class="courses-table" aria-label="Sessions list">
            <thead>
                <tr>
                    <th scope="col" style="width: 42px;"><input type="checkbox" id="selectAllSessions" title="Select all sessions on this page"></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="name">Name${getSortArrow('name')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="uniqueID">Unique ID${getSortArrow('uniqueID')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="scope">Institution / Course${getSortArrow('scope')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="date">Date${getSortArrow('date')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="expiry">Expiry${getSortArrow('expiry')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="state">State${getSortArrow('state')}</button></th>
                    <th scope="col"><button type="button" class="secondary small session-sort" data-sort="accessKey">Access Key${getSortArrow('accessKey')}</button></th>
                </tr>
            </thead>
            <tbody>
                ${pageSessions.map((s) => {
                    const sid = String(s._id || '');
                    const isChecked = sid && selectedSessionIds.has(sid) ? 'checked' : '';
                    const dateAccessedRaw = s.dateAccessed ? String(s.dateAccessed) : '';
                    const dateDisplay = dateAccessedRaw.length >= 8
                        ? `${dateAccessedRaw.slice(0, 4)}-${dateAccessedRaw.slice(4, 6)}-${dateAccessedRaw.slice(6, 8)} ${dateAccessedRaw.slice(8, 10) || '00'}:${dateAccessedRaw.slice(10, 12) || '00'}`
                        : 'Unknown';
                    const state = s.state || 'unknown';
                    const stateLabel = String(state).toLowerCase().startsWith('completed') ? 'Completed' : 'In progress';
                    const scope = `${s.institution || 'n/a'} / ${s.course || 'n/a'}`;
                    const accessKeyRef = s.accessKeyId || 'legacy/none';
                    let expiryDisplay = 'Not set';
                    if (s.expiresAt) {
                        const expiryDate = new Date(s.expiresAt);
                        if (!Number.isNaN(expiryDate.getTime())) {
                            const msRemaining = expiryDate.getTime() - Date.now();
                            if (msRemaining <= 0) {
                                expiryDisplay = `${expiryDate.toLocaleDateString()} (pending deletion)`;
                            } else {
                                const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
                                expiryDisplay = `${expiryDate.toLocaleDateString()} (${daysRemaining}d)`;
                            }
                        }
                    }
                    return `
                        <tr>
                            <td><input type="checkbox" class="session-row-check" data-session-id="${sid}" ${isChecked}></td>
                            <td>${s.name || 'Unnamed session'}</td>
                            <td>${s.uniqueID || 'n/a'}</td>
                            <td>${scope}</td>
                            <td>${dateDisplay}</td>
                            <td>${expiryDisplay}</td>
                            <td>${stateLabel} (${state})</td>
                            <td>${accessKeyRef}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        <div class="button-group" style="margin-top: 10px; align-items: center;">
            <button type="button" class="secondary small" id="sessionsPrevPage" ${sessionsCurrentPage <= 1 ? 'disabled' : ''}>Previous</button>
            <span class="institution-slug">Page ${sessionsCurrentPage} of ${totalPages}</span>
            <button type="button" class="secondary small" id="sessionsNextPage" ${sessionsCurrentPage >= totalPages ? 'disabled' : ''}>Next</button>
        </div>
    `;

    container.querySelectorAll('.session-sort').forEach((btn) => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.sort;
            if (!field) return;
            if (sessionsSortField === field) {
                sessionsSortDirection = sessionsSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sessionsSortField = field;
                sessionsSortDirection = (field === 'date' || field === 'expiry') ? 'desc' : 'asc';
            }
            sessionsCurrentPage = 1;
            renderSessionsList(sessionsCache);
        });
    });

    const selectAll = doc('selectAllSessions');
    const rowChecks = container.querySelectorAll('.session-row-check');
    if (selectAll) {
        const allChecked = rowChecks.length > 0 && Array.from(rowChecks).every((cb) => cb.checked);
        selectAll.checked = allChecked;
        selectAll.addEventListener('change', (e) => {
            rowChecks.forEach((cb) => {
                cb.checked = e.target.checked;
                const sid = cb.dataset.sessionId;
                if (!sid) return;
                if (e.target.checked) {
                    selectedSessionIds.add(sid);
                } else {
                    selectedSessionIds.delete(sid);
                }
            });
            updateSelectedSessionsCount();
        });
    }

    rowChecks.forEach((cb) => {
        cb.addEventListener('change', (e) => {
            const sid = e.target.dataset.sessionId;
            if (!sid) return;
            if (e.target.checked) {
                selectedSessionIds.add(sid);
            } else {
                selectedSessionIds.delete(sid);
            }
            if (selectAll) {
                selectAll.checked = rowChecks.length > 0 && Array.from(rowChecks).every((x) => x.checked);
            }
            updateSelectedSessionsCount();
        });
    });

    const prevBtn = doc('sessionsPrevPage');
    const nextBtn = doc('sessionsNextPage');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            sessionsCurrentPage = Math.max(1, sessionsCurrentPage - 1);
            renderSessionsList(sessionsCache);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            sessionsCurrentPage = Math.min(totalPages, sessionsCurrentPage + 1);
            renderSessionsList(sessionsCache);
        });
    }

    updateSelectedSessionsCount();
}

async function deleteSelectedSessions() {
    if (selectedSessionIds.size === 0) {
        showError('Select at least one session to delete');
        return;
    }

    const selectedIds = new Set(Array.from(selectedSessionIds));
    const hasAccessKeyAssociatedSelection = (sessionsCache || []).some((session) => {
        const sid = String((session && session._id) || '').trim();
        if (!sid || !selectedIds.has(sid)) return false;
        const accessKeyId = String((session && session.accessKeyId) || '').trim();
        return Boolean(accessKeyId);
    });

    if (hasAccessKeyAssociatedSelection) {
        alert('Selected sessions cannot be deleted as one or more belong to an Access Key. These can only be deleted via the Access Keys panel.');
        return;
    }

    const confirmed = confirm(
        `Delete ${selectedSessionIds.size} selected session(s)?\n\n` +
        `This action permanently removes the selected sessions and cannot be undone.`
    );
    if (!confirmed) return;

    const typed = prompt('Type DELETE to confirm permanent deletion of selected sessions:');
    if (typed !== 'DELETE') {
        showError('Deletion cancelled: confirmation text did not match DELETE');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/sessions`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ sessionIds: Array.from(selectedSessionIds) })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showError((data && data.error) || 'Failed to delete selected sessions');
            return;
        }
        const deletedCount = Number.isFinite(data.deletedCount) ? data.deletedCount : 0;
        showSuccess(`Deleted ${deletedCount} session(s)`);
        selectedSessionIds.clear();
        await Promise.all([loadSessions(), loadInstitutions()]);
    } catch (err) {
        showError('Failed to delete selected sessions: ' + err.message);
    }
}

async function downloadSelectedSessions() {
    if (selectedSessionIds.size === 0) {
        showError('Select at least one session to download');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/sessions/export-selected`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ 
                sessionIds: Array.from(selectedSessionIds),
                exportMetadata: {
                    type: 'selected-sessions',
                    description: 'User-selected sessions from database'
                }
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showError((data && data.error) || 'Failed to download selected sessions');
            return;
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i);
        const fileName = fileNameMatch && fileNameMatch[1]
            ? fileNameMatch[1]
            : `k2_selected_sessions_${Date.now()}.json`;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showSuccess(`Downloaded ${selectedSessionIds.size} selected session(s)`);
    } catch (err) {
        showError('Failed to download selected sessions: ' + err.message);
    }
}

async function downloadSessionsByInstitution(institutionSlug) {
    const sessionIds = (sessionsCache || [])
        .filter(s => s.institution === institutionSlug)
        .map(s => String((s && s._id) || '').trim())
        .filter(Boolean);

    const institution = (institutionsCache || []).find(i => i.slug === institutionSlug);
    const institutionName = institution ? institution.title : institutionSlug;

    if (sessionIds.length === 0) {
        showError(`No sessions found for institution: ${institutionName}`);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/sessions/export-selected`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ 
                sessionIds,
                exportMetadata: {
                    type: 'institution-export',
                    institution: institutionName,
                    description: `All sessions from institution: ${institutionName}`
                }
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showError((data && data.error) || 'Failed to download institution sessions');
            return;
        }

        const blob = await res.blob();
        const fileName = `k2_institution_${institutionSlug}_${Date.now()}.json`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showSuccess(`Downloaded ${sessionIds.length} session(s) from institution: ${institutionSlug}`);
        showSuccess(`Downloaded ${sessionIds.length} session(s) from institution: ${institutionName}`);
    } catch (err) {
        showError('Failed to download institution sessions: ' + err.message);
    }
}

async function downloadSessionsByCourse(institutionSlug, courseSlug) {
    const sessionIds = (sessionsCache || [])
        .filter(s => s.institution === institutionSlug && s.course === courseSlug)
        .map(s => String((s && s._id) || '').trim())
        .filter(Boolean);
    
    const institution = (institutionsCache || []).find(i => i.slug === institutionSlug);
    const institutionName = institution ? institution.title : institutionSlug;
    const course = institution && institution.courses ? institution.courses.find(c => c.slug === courseSlug) : null;
    const courseName = course ? course.name : courseSlug;

    if (sessionIds.length === 0) {
        showError(`No sessions found for course: ${courseName}`);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/sessions/export-selected`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ 
                sessionIds,
                exportMetadata: {
                    type: 'course-export',
                    institution: institutionName,
                    course: courseName,
                    description: `All sessions from course: ${courseName} (${institutionName})`
                }
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showError((data && data.error) || 'Failed to download course sessions');
            return;
        }

        const blob = await res.blob();
        const fileName = `k2_course_${courseSlug}_${Date.now()}.json`;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showSuccess(`Downloaded ${sessionIds.length} session(s) from course: ${courseSlug}`);
        showSuccess(`Downloaded ${sessionIds.length} session(s) from course: ${courseName}`);
    } catch (err) {
        showError('Failed to download course sessions: ' + err.message);
    }
}

function selectAllSessionsInDb() {
    const allIds = (sessionsCache || [])
        .map((session) => String((session && session._id) || '').trim())
        .filter(Boolean);

    if (allIds.length === 0) {
        showError('No sessions available to download');
        return;
    }

    selectedSessionIds = new Set(allIds);
    updateSelectedSessionsCount();
    renderSessionsList(sessionsCache);
    showSuccess(`Selected ${allIds.length} session(s)`);
}

function initSessionsActions() {
    const deleteBtn = doc('deleteSelectedSessionsBtn');
    const downloadBtn = doc('downloadSelectedSessionsBtn');
    const selectAllDbBtn = doc('selectAllDbSessionsBtn');
    if (!deleteBtn || !downloadBtn || !selectAllDbBtn) return;
    deleteBtn.addEventListener('click', deleteSelectedSessions);
    downloadBtn.addEventListener('click', downloadSelectedSessions);
    selectAllDbBtn.addEventListener('click', selectAllSessionsInDb);
    updateSelectAllDbButton();
    updateSelectedSessionsCount();
}

function renderInstitutions(institutions) {
    const container = document.getElementById('institutionsContainer');
    if (institutions.length === 0) {
        container.innerHTML = '<p>No institutions yet. Create one above.</p>';
        return;
    }
    container.innerHTML = institutions.map(inst => `
        <div class="institution-item collapsed" data-id="${inst._id}">
            <div class="institution-header">
                <div>
                    <h3>${inst.title}</h3>
                    <span class="institution-slug">Slug: ${inst.slug}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button type="button" class="download-inst-sessions-btn secondary small" data-inst-slug="${inst.slug}" title="Download all sessions for this institution">Download Sessions</button>
                    <div>ID: ${inst._id}</div>
                </div>
            </div>
            ${inst.courses && inst.courses.length > 0 ? `
                <div class="courses-list">
                    <strong>Courses:</strong>
                    <table class="courses-table" aria-label="Courses for ${inst.title}">
                        <thead>
                            <tr>
                                <th scope="col">Title</th>
                                <th scope="col">Slug</th>
                                <th scope="col">Sessions</th>
                                <th scope="col">Facilitator</th>
                                <th scope="col">Download</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inst.courses.map(c => `
                                <tr>
                                    <td>${c.name}</td>
                                    <td>
                                        <div>${c.slug}</div>
                                        ${c.launchToken ? `
                                            <div style="margin-top: 4px;">
                                                <button type="button" class="secondary small copy-launch-link" data-launch-token="${c.launchToken}">Copy launch URL</button>
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td>${typeof c.sessionsCount === 'number' ? c.sessionsCount : 0}</td>
                                    <td>
                                        ${c.launchToken ? `<a href="/facilitator/play/${c.launchToken}" target="_blank" rel="noopener noreferrer">Open Dashboard</a>` : '—'}
                                    </td>
                                    <td>
                                        <button type="button" class="download-course-sessions-btn secondary small" data-inst-slug="${inst.slug}" data-course-slug="${c.slug}" title="Download sessions for this course">Download</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p style="color: #999;">No courses</p>'}
            <div class="button-group">
                <button class="edit-btn" data-id="${inst._id}">Edit</button>
                <button class="danger delete-btn" data-id="${inst._id}">Delete</button>
            </div>
        </div>
    `).join('');

    // Attach event listeners for collapse/expand
    document.querySelectorAll('.institution-item .institution-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on ID text (for copying) or download button or a button
            if (e.target.tagName === 'BUTTON') return;
            if (e.target.tagName === 'DIV' && e.target.textContent.startsWith('ID:')) return;
            const item = header.closest('.institution-item');
            item.classList.toggle('collapsed');
        });
    });

    // Attach event listeners to institution download buttons
    document.querySelectorAll('.download-inst-sessions-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const instSlug = e.target.getAttribute('data-inst-slug');
            downloadSessionsByInstitution(instSlug);
        });
    });

    // Attach event listeners to course download buttons
    document.querySelectorAll('.download-course-sessions-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const instSlug = e.target.getAttribute('data-inst-slug');
            const courseSlug = e.target.getAttribute('data-course-slug');
            downloadSessionsByCourse(instSlug, courseSlug);
        });
    });

    // Attach event listeners to edit and delete buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditInstitution(e.target.dataset.id);
        });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteInstitution(e.target.dataset.id);
        });
    });

    document.querySelectorAll('.copy-launch-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const token = e.target.dataset.launchToken;
            if (!token) return;
            const launchUrl = `${window.location.origin}/play/${token}`;
            try {
                await navigator.clipboard.writeText(launchUrl);
                showSuccess('Launch URL copied');
            } catch (_err) {
                showError('Could not copy launch URL');
            }
        });
    });
}

async function submitInstitution(event) {
    if (event) event.preventDefault();
    const slug = doc('instSlug').value.trim();
    const title = doc('instTitle').value.trim();
    if (!slug || !title) {
        showError('Slug and Title are required');
        return;
    }
    
    // Check if any courses are marked for deletion
    const deletedCourses = courseList.filter(c => c.deleted);
    if (deletedCourses.length > 0) {
        const confirmMsg = `You have marked ${deletedCourses.length} course${deletedCourses.length > 1 ? 's' : ''} for deletion. Are you sure you want to do this?`;
        if (!confirm(confirmMsg)) {
            return;
        }
    }
    
    const payload = {
        slug: slug.toLowerCase(),
        title: title.trim(),
        courses: courseList.filter(c => !c.deleted)
    };
    const url = formMode === 'edit'
        ? `${API_BASE}/institutions/${editingId}`
        : `${API_BASE}/institutions`;
    const method = formMode === 'edit' ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showSuccess(formMode === 'edit' ? 'Institution updated' : 'Institution created');
            clearState();
            resetForm();
            loadInstitutions();
        } else {
            const err = await res.json();
            showError((formMode === 'edit' ? 'Failed to update: ' : 'Failed to create: ') + (err.error || 'Unknown error'));
        }
    } catch (err) {
        showError('Error: ' + err.message);
    }
}

function startEditInstitution(id) {
    // Check for unsaved changes before switching to a different institution
    if (hasChanges()) {
        if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
    }
    
    const inst = institutionsCache.find(i => i._id === id);
    if (!inst) {
        showError('Institution not found');
        return;
    }
    formMode = 'edit';
    editingId = id;
    doc('instSlug').value = inst.slug;
    doc('instTitle').value = inst.title;
    originalInstSlug = inst.slug;
    originalInstTitle = inst.title;
    courseList = Array.isArray(inst.courses)
        ? inst.courses.map(c => ({ name: c.name, slug: (c.slug || '').toLowerCase() }))
        : [];
    originalCourseList = JSON.parse(JSON.stringify(courseList));
    courseSlugEdited = false;
    renderCourseList();
    setCreateInstitutionCollapsed(false);
    updateFormLabels();
    updateButtonState();
    saveState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteInstitution(id) {
    if (!confirm('Are you sure you want to delete this institution?')) {
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/institutions/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            showSuccess('Institution deleted');
            loadInstitutions();
        } else {
            const err = await res.json();
            showError('Failed to delete: ' + (err.error || 'Unknown error'));
        }
    } catch (err) {
        showError('Error: ' + err.message);
    }
}

function renderAccessKeys() {
    const container = doc('accessKeysContainer');
    if (!accessKeys || accessKeys.length === 0) {
        container.innerHTML = '<p class="muted">No access keys yet.</p>';
        return;
    }
    const sessionCountsByAccessKeyId = (sessionsCache || []).reduce((acc, session) => {
        const keyId = String((session && session.accessKeyId) || '').trim();
        if (!keyId) return acc;
        acc[keyId] = (acc[keyId] || 0) + 1;
        return acc;
    }, {});

    container.innerHTML = accessKeys.map(k => {
        const activeBadge = k.active
            ? '<span class="status-badge is-active">active</span>'
            : '<span class="status-badge is-inactive">inactive</span>';
        const scope = k.type === 'institution'
            ? `INS: ${k.institutionSlug}`
            : `COU: ${k.institutionSlug} / ${k.courseSlug}`;
        const label = k.label ? ` • ${k.label}` : '';
        const holder = `${k.firstName || ''} ${k.surname || ''}`.trim();
        const holderLine = holder ? `<span class="institution-slug">Holder: ${holder}</span>` : '';
        const endDateLine = k.endDate ? `<span class="institution-slug">End date: ${new Date(k.endDate).toLocaleDateString()}</span>` : '<span class="institution-slug">End date: none</span>';
        const sessionLimitLine = Number.isInteger(k.sessionLimit)
            ? `<span class="institution-slug">Session limit: ${k.sessionLimit}</span>`
            : '<span class="institution-slug">Session limit: none</span>';
        const sessionCount = Number(sessionCountsByAccessKeyId[String(k._id)] || 0);
        const created = k.createdAt ? new Date(k.createdAt).toLocaleString() : '';
        return `
            <div class="institution-item collapsed" data-id="${k._id}">
                <div class="institution-header">
                    <div>
                        <h3>${scope}${label}</h3>
                        <span class="institution-slug">${activeBadge}</span>
                        ${holderLine}
                        ${endDateLine}
                        ${sessionLimitLine}
                    </div>
                    <div>${created}</div>
                </div>
                <div class="institution-slug" style="margin-bottom: 8px;">Sessions linked: ${sessionCount}</div>
                <div class="button-group">
                    <button class="secondary small edit-key-password" data-id="${k._id}">Edit Password</button>
                    <button class="secondary small toggle-key" data-id="${k._id}" data-active="${k.active ? '1' : '0'}">${k.active ? 'Disable' : 'Enable'}</button>
                    <button class="secondary small download-key-data" data-id="${k._id}">Download Data</button>
                    <button class="danger small delete-key" data-id="${k._id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners for collapse/expand
    container.querySelectorAll('.institution-item .institution-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'DIV' && e.target.textContent.match(/^\d{4}/)) return;
            const item = header.closest('.institution-item');
            item.classList.toggle('collapsed');
        });
    });

    container.querySelectorAll('.edit-key-password').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editAccessKeyPassword(e.target.dataset.id);
        });
    });

    container.querySelectorAll('.toggle-key').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.target.dataset.id;
            const currentlyActive = e.target.dataset.active === '1';
            await setAccessKeyActive(id, !currentlyActive);
        });
    });

    container.querySelectorAll('.delete-key').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteAccessKey(e.target.dataset.id);
        });
    });

    container.querySelectorAll('.download-key-data').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await downloadAccessKeyData(e.target.dataset.id);
        });
    });
}

function getDownloadFilenameFromDisposition(disposition) {
    if (!disposition) return null;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch (_err) {
            return utf8Match[1];
        }
    }
    const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
    return basicMatch && basicMatch[1] ? basicMatch[1] : null;
}

async function downloadAccessKeyData(keyId) {
    if (!keyId) {
        showError('No access key ID provided for export');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/access-keys/${encodeURIComponent(keyId)}/export-sessions`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showError((err && err.error) || 'Failed to export data');
            return;
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const filename = getDownloadFilenameFromDisposition(disposition) || `k2_sessions_${keyId}.json`;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showSuccess('Access key data export downloaded');
    } catch (err) {
        showError('Failed to export access key data: ' + err.message);
    }
}

async function editAccessKeyPassword(keyId) {
    const newPassword = prompt('Enter new password for this access key:');
    if (!newPassword) return;
    
    if (newPassword.length < 4) {
        showError('Password must be at least 4 characters');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/access-keys/${keyId}/password`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        if (!res.ok) {
            const err = await res.json();
            showError(err.error || 'Failed to update password');
            return;
        }
        showSuccess('Access key password updated successfully');
    } catch (err) {
        showError('Failed to update password: ' + err.message);
    }
}

async function setAccessKeyActive(id, active) {
    try {
        const res = await fetch(`${API_BASE}/access-keys/${id}/active`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active })
        });
        if (!res.ok) {
            const err = await res.json();
            showError(err.error || 'Failed to update access key');
            return;
        }
        showSuccess(active ? 'Access key enabled' : 'Access key disabled');
        loadAccessKeys();
    } catch (err) {
        showError('Failed to update access key: ' + err.message);
    }
}

async function deleteAccessKey(id) {
    const key = accessKeys.find(k => k._id === id);
    const scope = key
        ? (key.type === 'institution'
            ? `INS ${key.institutionSlug}`
            : `COU ${key.institutionSlug}/${key.courseSlug}`)
        : 'this key';
    const holder = key ? `${key.firstName || ''} ${key.surname || ''}`.trim() : '';
    const label = key && key.label ? ` (${key.label})` : '';
    const keyRef = `${scope}${holder ? ` - ${holder}` : ''}${label}`;

    const confirmed = confirm(
        `Delete access key ${keyRef}?\n\n` +
        `This will permanently delete the key and all sessions associated with it.\n` +
        `This action cannot be undone.`
    );
    if (!confirmed) {
        return;
    }

    const typed = prompt('Type DELETE to confirm this permanent deletion:');
    if (typed !== 'DELETE') {
        showError('Deletion cancelled: confirmation text did not match DELETE');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/access-keys/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showError((data && data.error) || 'Failed to delete access key');
            return;
        }
        const deletedSessions = Number.isFinite(data.deletedSessions) ? data.deletedSessions : 0;
        showSuccess(`Access key deleted. Associated sessions deleted: ${deletedSessions}`);
        await Promise.all([loadAccessKeys(), loadInstitutions(), loadSessions()]);
    } catch (err) {
        showError('Failed to delete access key: ' + err.message);
    }
}

async function createAccessKey(event) {
    if (event) event.preventDefault();
    const type = doc('accessType').value;
    const institutionSlug = doc('accessInstSlug').value;
    const courseSlug = doc('accessCourseSlug').value;
    const password = doc('accessPassword').value;
    const label = doc('accessLabel').value.trim();
    const firstName = doc('accessFirstName').value.trim();
    const surname = doc('accessSurname').value.trim();
    const endDate = doc('accessEndDate').value;
    const sessionLimitRaw = doc('accessSessionLimit').value.trim();

    if (!type || !institutionSlug || !password || !firstName || !surname) {
        showError('Type, institution slug, password, first name, and surname are required');
        return;
    }
    if (type === 'course' && !courseSlug) {
        showError('Course slug is required for course access');
        return;
    }

    let sessionLimit;
    if (sessionLimitRaw) {
        sessionLimit = Number(sessionLimitRaw);
        if (!Number.isInteger(sessionLimit) || sessionLimit < 1) {
            showError('Session limit must be a positive whole number');
            return;
        }
    }

    const payload = {
        type,
        institutionSlug,
        password,
        label,
        firstName,
        surname
    };
    if (type === 'course') {
        payload.courseSlug = courseSlug;
    }
    if (endDate) {
        payload.endDate = endDate;
    }
    if (sessionLimitRaw) {
        payload.sessionLimit = sessionLimit;
    }

    try {
        const res = await fetch(`${API_BASE}/access-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json();
            showError(err.error || 'Failed to create access key');
            return;
        }
        showSuccess('Access key created');
        doc('accessPassword').value = '';
        doc('accessLabel').value = '';
        doc('accessFirstName').value = '';
        doc('accessSurname').value = '';
        doc('accessEndDate').value = '';
        doc('accessSessionLimit').value = '';
        if (type === 'course') {
            doc('accessCourseSlug').value = '';
        }
        loadAccessKeys();
    } catch (err) {
        showError('Failed to create access key: ' + err.message);
    }
}

function populateAccessKeyInstitutionDropdown(institutions) {
    const instSelect = doc('accessInstSlug');
    if (!instSelect) return;
    
    instSelect.innerHTML = '<option value="">Select institution...</option>' +
        institutions.map(inst => `<option value="${inst.slug}">${inst.title} (${inst.slug})</option>`).join('');
}

function populateAccessKeyCourseDropdown(institutionSlug) {
    const courseSelect = doc('accessCourseSlug');
    if (!courseSelect || !institutionSlug) {
        courseSelect.innerHTML = '<option value="">Select course...</option>';
        return;
    }
    
    const institution = institutionsCache.find(inst => inst.slug === institutionSlug);
    if (!institution || !institution.courses || institution.courses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses available</option>';
        courseSelect.disabled = true;
        return;
    }
    
    courseSelect.disabled = false;
    courseSelect.innerHTML = '<option value="">Select course...</option>' +
        institution.courses.map(course => `<option value="${course.slug}">${course.name} (${course.slug})</option>`).join('');
}

function handleAccessTypeChange() {
    const type = doc('accessType').value;
    const courseSelect = doc('accessCourseSlug');
    const instSelect = doc('accessInstSlug');
    
    if (type === 'institution') {
        courseSelect.value = '';
        courseSelect.disabled = true;
    } else {
        courseSelect.disabled = false;
        // Populate courses for currently selected institution
        const selectedInst = instSelect.value;
        if (selectedInst) {
            populateAccessKeyCourseDropdown(selectedInst);
        }
    }
}

// Admin User Management (Superuser only)
async function loadAdminUsers() {
    try {
        const res = await fetch(`${API_BASE}/admin-users`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            if (res.status === 403) {
                // Not a superuser, hide the section
                doc('adminUsersSection').style.display = 'none';
                doc('sessionGeneratorSection').style.display = 'none';
                return;
            }
            throw new Error('Failed to fetch admin users');
        }
        // If we got here, user is a superuser
        doc('adminUsersSection').style.display = 'block';
        doc('sessionGeneratorSection').style.display = 'block';
        const users = await res.json();
        renderAdminUsers(users);
    } catch (err) {
        console.error('Failed to load admin users:', err.message);
        doc('adminUsersSection').style.display = 'none';
        doc('sessionGeneratorSection').style.display = 'none';
    }
}

function renderAdminUsers(users) {
    const container = doc('adminUsersContainer');
    if (!users || users.length === 0) {
        container.innerHTML = '<p>No admin users yet. Create one above.</p>';
        return;
    }
    container.innerHTML = users.map(user => `
        <div class="institution-item collapsed" data-id="${user._id}">
            <div class="institution-header">
                <div>
                    <h3>${user.username}</h3>
                    <span class="institution-slug">Role: ${user.role}</span>
                </div>
                <div>ID: ${user._id}</div>
            </div>
            <div style="color: #999; font-size: 0.9em; margin-top: 8px;">
                Created: ${new Date(user.createdAt).toLocaleString()}
            </div>
            <div class="button-group" style="margin-top: 12px;">
                <button class="secondary small set-password-btn" data-id="${user._id}" data-username="${user.username}">Set Password</button>
                <button class="secondary small reset-password-btn" data-id="${user._id}" data-username="${user.username}">Reset Password</button>
            </div>
        </div>
    `).join('');

    // Attach event listeners for collapse/expand
    container.querySelectorAll('.institution-item .institution-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'DIV' && e.target.textContent.startsWith('ID:')) return;
            const item = header.closest('.institution-item');
            item.classList.toggle('collapsed');
        });
    });
    
    container.querySelectorAll('.set-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setUserPassword(e.target.dataset.id, e.target.dataset.username);
        });
    });

    document.querySelectorAll('.reset-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetUserPassword(e.target.dataset.id, e.target.dataset.username);
        });
    });
}

async function createAdminUser(event) {
    console.log('createAdminUser called with event:', event);
    if (event) event.preventDefault();
    const username = doc('adminUsername').value.trim();
    const password = doc('adminPassword').value;
    const role = doc('adminRole').value;
    
    console.log('Creating admin user:', { username, role, passwordLength: password.length });

    if (!username || !password) {
        console.log('Validation failed: username or password missing');
        showError('Username and password are required');
        return;
    }

    try {
        console.log('Posting to', `${API_BASE}/admin-users`);
        const res = await fetch(`${API_BASE}/admin-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        
        console.log('Response status:', res.status, 'ok:', res.ok);
        
        if (!res.ok) {
            const err = await res.json();
            console.log('Error response:', err);
            if (res.status === 409) {
                showError('Username already exists');
            } else if (res.status === 403) {
                showError('Only superusers can create admin users');
                doc('adminUsersSection').style.display = 'none';
                doc('sessionGeneratorSection').style.display = 'none';
            } else {
                showError(err.error || 'Failed to create admin user');
            }
            return;
        }
        
        const result = await res.json();
        console.log('Success response:', result);
        showSuccess(`Admin user "${result.username}" created successfully`);
        doc('adminUsername').value = '';
        doc('adminPassword').value = '';
        doc('adminRole').value = 'admin';
        loadAdminUsers();
    } catch (err) {
        console.error('Error creating admin user:', err);
        showError('Failed to create admin user: ' + err.message);
    }
}

function generateSessionIdSuffix() {
    const randomPart = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `${Date.now()}_${randomPart}`;
}

function populateSessionGeneratorInstitutionDropdown(institutions) {
    const instSelect = doc('sessionGeneratorInstitution');
    if (!instSelect) return;
    
    instSelect.innerHTML = '<option value="">Select institution...</option>' +
        institutions.map(inst => `<option value="${inst.slug}">${inst.title} (${inst.slug})</option>`).join('');
}

function populateSessionGeneratorCourseDropdown(institutionSlug) {
    const courseSelect = doc('sessionGeneratorCourse');
    if (!courseSelect || !institutionSlug) {
        courseSelect.innerHTML = '<option value="">Select course...</option>';
        courseSelect.disabled = true;
        return;
    }
    
    const institution = institutionsCache.find(inst => inst.slug === institutionSlug);
    if (!institution || !institution.courses || institution.courses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses available</option>';
        courseSelect.disabled = true;
        return;
    }
    
    courseSelect.disabled = false;
    courseSelect.innerHTML = '<option value="">Select course...</option>' +
        institution.courses.map(course => `<option value="${course.slug}">${course.name} (${course.slug})</option>`).join('');
}

function populateSessionGeneratorAccessKeyDropdown(institutionSlug, courseSlug) {
    const accessKeySelect = doc('sessionGeneratorAccessKeyId');
    if (!accessKeySelect) return;

    if (!institutionSlug || !courseSlug) {
        accessKeySelect.innerHTML = '<option value="">No Access Key</option>';
        accessKeySelect.disabled = true;
        return;
    }

    const matchingKeys = (accessKeys || []).filter((key) => {
        if (!key || !key._id) return false;
        if (key.active === false) return false;
        if (String(key.institutionSlug || '').toLowerCase() !== String(institutionSlug).toLowerCase()) {
            return false;
        }
        const type = String(key.type || '').toLowerCase();
        if (type === 'institution') return true;
        if (type === 'course') {
            return String(key.courseSlug || '').toLowerCase() === String(courseSlug).toLowerCase();
        }
        return false;
    });

    accessKeySelect.disabled = false;
    accessKeySelect.innerHTML = '<option value="">No Access Key</option>' + matchingKeys.map((key) => {
        const typeLabel = String(key.type || 'unknown');
        const scopeLabel = typeLabel === 'course'
            ? `${key.institutionSlug}/${key.courseSlug}`
            : `${key.institutionSlug}`;
        const displayLabel = key.label ? `${key.label}` : 'Unlabeled key';
        return `<option value="${key._id}">${displayLabel} [${typeLabel}] (${scopeLabel})</option>`;
    }).join('');
}

function toDateTimeLocalValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applySessionGeneratorDefaults(institutions = []) {
    const startDateInput = doc('sessionGeneratorStartDate');
    const institutionInput = doc('sessionGeneratorInstitution');
    const courseInput = doc('sessionGeneratorCourse');
    const countInput = doc('sessionGeneratorCount');

    if (startDateInput && !startDateInput.value) {
        startDateInput.value = toDateTimeLocalValue(new Date());
    }
    updateSessionGeneratorRetentionPreview();

    if (countInput) {
        countInput.value = '10';
    }

    if (!institutionInput || !courseInput) return;

    const preferredInstitutionSlug = 'cu';
    const preferredCourseSlug = 'lead';
    const selectedInstitutionSlug = institutions.some((inst) => inst.slug === preferredInstitutionSlug)
        ? preferredInstitutionSlug
        : ((institutions[0] && institutions[0].slug) || '');

    institutionInput.value = selectedInstitutionSlug;
    populateSessionGeneratorCourseDropdown(selectedInstitutionSlug);

    const selectedInstitution = institutions.find((inst) => inst.slug === selectedInstitutionSlug);
    const courses = Array.isArray(selectedInstitution && selectedInstitution.courses)
        ? selectedInstitution.courses
        : [];
    const selectedCourseSlug = courses.some((c) => c.slug === preferredCourseSlug)
        ? preferredCourseSlug
        : ((courses[0] && courses[0].slug) || '');
    courseInput.value = selectedCourseSlug;
    populateSessionGeneratorAccessKeyDropdown(selectedInstitutionSlug, selectedCourseSlug);
}

async function loadRetentionConfig() {
    try {
        const res = await fetch(`${API_BASE}/retention/config`, {
            headers: {
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        if (data && data.success && Number.isInteger(data.retentionDays) && data.retentionDays > 0) {
            sessionRetentionDays = data.retentionDays;
        }
    } catch (_err) {
        // Keep default fallback.
    }
    updateSessionGeneratorRetentionPreview();
}

function updateSessionGeneratorRetentionPreview() {
    const previewEl = doc('sessionGeneratorRetentionPreview');
    const startDateInput = doc('sessionGeneratorStartDate');
    if (!previewEl || !startDateInput) return;

    const startDateValue = startDateInput.value;
    if (!startDateValue) {
        previewEl.textContent = `Retention preview: choose a start date/time (policy ${sessionRetentionDays} days).`;
        return;
    }

    const startDate = new Date(startDateValue);
    if (Number.isNaN(startDate.getTime())) {
        previewEl.textContent = `Retention preview: invalid start date/time (policy ${sessionRetentionDays} days).`;
        return;
    }

    const expiresAt = new Date(startDate.getTime() + sessionRetentionDays * 24 * 60 * 60 * 1000);
    previewEl.textContent = `Retention preview: first generated session expires on ${expiresAt.toLocaleString()} (${sessionRetentionDays} days).`;
}

function dateToTimeNumber(date) {
    // Convert Date to YYYYMMDDHHmmss format (14 digits)
    // Matches getTimeNumber() format from tools.js
    const padNum = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = padNum(date.getMonth() + 1);
    const day = padNum(date.getDate());
    const hours = padNum(date.getHours());
    const minutes = padNum(date.getMinutes());
    const seconds = padNum(date.getSeconds());
    return Number(`${year}${month}${day}${hours}${minutes}${seconds}`);
}

function getRandomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

function deepClone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function getRandomIntInRange(min, max) {
    const lower = Math.ceil(Number(min) || 0);
    const upper = Math.floor(Number(max) || 0);
    if (upper < lower) return lower;
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function buildMockSessionPayload(index, uniqueIDValue, nameNumber, institution, course, state, playTime, sampledData = {}) {
    return {
        uniqueID: uniqueIDValue,
        name: `k2session_${nameNumber}`,
        dateID: uniqueIDValue,
        dateAccessed: uniqueIDValue,
        playTime: Number.isFinite(playTime) ? playTime : 0,
        type: 1,
        teamRef: 0,
        state: state || 'new',
        time: 0,
        supportTeamRef: 1,
        events: Array.isArray(sampledData.events) ? deepClone(sampledData.events) : [],
        profile0: sampledData.profile0 && typeof sampledData.profile0 === 'object' ? deepClone(sampledData.profile0) : { blank: true },
        profile1: sampledData.profile1 && typeof sampledData.profile1 === 'object' ? deepClone(sampledData.profile1) : { blank: true },
        profile2: sampledData.profile2 && typeof sampledData.profile2 === 'object' ? deepClone(sampledData.profile2) : { blank: true },
        quiz: Array.isArray(sampledData.quiz) ? deepClone(sampledData.quiz) : [],
        institution: institution || 'example_institution',
        course: course || 'example_course'
    };
}

function handleSessionGeneratorSubmit(event) {
    if (event) event.preventDefault();

    const startDateInput = doc('sessionGeneratorStartDate');
    const institutionInput = doc('sessionGeneratorInstitution');
    const courseInput = doc('sessionGeneratorCourse');
    const countInput = doc('sessionGeneratorCount');
    const selectedAccessKeyInput = doc('sessionGeneratorAccessKeyId');
    
    const startDateValue = startDateInput && startDateInput.value;
    const selectedInstitution = institutionInput && institutionInput.value;
    const selectedCourse = courseInput && courseInput.value;
    const requested = Number((countInput && countInput.value) || 0);
    const selectedAccessKeyId = String((selectedAccessKeyInput && selectedAccessKeyInput.value) || '').trim();
    
    if (!startDateValue) {
        showError('Start Date/Time is required');
        return;
    }
    if (!selectedInstitution) {
        showError('Institution is required');
        return;
    }
    if (!selectedCourse) {
        showError('Course is required');
        return;
    }
    if (!Number.isInteger(requested) || requested < 1) {
        showError('Number of sessions must be a positive whole number');
        return;
    }

    // Parse the datetime-local input to a Date object
    // Format: "2026-03-23T14:30" -> Date
    const startDate = new Date(startDateValue);
    if (isNaN(startDate.getTime())) {
        showError('Invalid Start Date/Time');
        return;
    }

    // Fetch both highest session name number and state stats from the database in parallel
    Promise.all([
        fetch(`${API_BASE}/sessions/highest-name-number`).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        }),
        fetch(`${API_BASE}/sessions/stats/state`).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
    ])
        .then(([nameData, statsData]) => {
            if (!nameData.success) {
                throw new Error(nameData.error || 'Failed to get highest session number');
            }
            if (!statsData.success) {
                throw new Error(statsData.error || 'Failed to get state stats');
            }

            const storedSessionsCount = Number(statsData.data && statsData.data.totalSessions) || 0;
            const minimumStoredSessions = 10;
            if (storedSessionsCount < minimumStoredSessions) {
                const message = `At least ${minimumStoredSessions} stored sessions are required to generate random session values. Found ${storedSessionsCount}.`;
                alert(message);
                showError(message);
                return;
            }

            const startingNameNumber = nameData.nextNumber || 1;
            const availableStates = statsData.data.uniqueStates || ['new'];
            const playTimeRange = (statsData.data && statsData.data.playTimeRange) || { min: 0, max: 0 };
            const randomPools = (statsData.data && statsData.data.randomPools) || {};
            const generatedSessions = [];
            let currentDate = new Date(startDate);
            
            for (let i = 0; i < requested; i++) {
                const timestamp = dateToTimeNumber(currentDate);
                const nameNumber = startingNameNumber + i;
                const randomState = getRandomItem(availableStates);
                const randomPlayTime = getRandomIntInRange(playTimeRange.min, playTimeRange.max);
                const sampledData = {
                    events: getRandomItem(randomPools.events),
                    profile0: getRandomItem(randomPools.profile0),
                    profile1: getRandomItem(randomPools.profile1),
                    profile2: getRandomItem(randomPools.profile2),
                    quiz: getRandomItem(randomPools.quiz)
                };
                const payload = buildMockSessionPayload(
                    i,
                    timestamp,
                    nameNumber,
                    selectedInstitution,
                    selectedCourse,
                    randomState,
                    randomPlayTime,
                    sampledData
                );
                generatedSessions.push(payload);
                
                // Increment by 1 hour (3600000 milliseconds)
                currentDate = new Date(currentDate.getTime() + 3600000);
            }

            const invalidProfiles = generatedSessions.filter((s) => (
                typeof s.profile0 !== 'object' || s.profile0 === null || Array.isArray(s.profile0) ||
                typeof s.profile1 !== 'object' || s.profile1 === null || Array.isArray(s.profile1) ||
                typeof s.profile2 !== 'object' || s.profile2 === null || Array.isArray(s.profile2)
            ));
            if (invalidProfiles.length > 0) {
                const message = `Generated payload validation failed: ${invalidProfiles.length} session(s) are missing object profile0/profile1/profile2 fields.`;
                alert(message);
                showError(message);
                return;
            }

            console.group(`Session Generator: ${requested} session(s) starting ${startDate.toISOString()}`);
            console.log(`Institution: ${selectedInstitution}`);
            console.log(`Course: ${selectedCourse}`);
            console.log(`Available states: ${availableStates.join(', ')}`);
            console.log(`playTime range from stored sessions: ${playTimeRange.min} to ${playTimeRange.max}`);
            console.log(`Linked Access Key for this batch: ${selectedAccessKeyId || 'none'}`);
            console.log(`Random pools sizes: events=${(randomPools.events || []).length}, profile0=${(randomPools.profile0 || []).length}, profile1=${(randomPools.profile1 || []).length}, profile2=${(randomPools.profile2 || []).length}, quiz=${(randomPools.quiz || []).length}`);
            console.log(`Starting session name number: k2session_${startingNameNumber}`);
            console.table(generatedSessions.map((s, idx) => ({
                Index: idx + 1,
                uniqueID: s.uniqueID,
                name: s.name,
                dateID: s.dateID,
                state: s.state,
                playTime: s.playTime,
                eventsCount: Array.isArray(s.events) ? s.events.length : 0,
                quizCount: Array.isArray(s.quiz) ? s.quiz.length : 0,
                profile0: s.profile0,
                profile1: s.profile1,
                profile2: s.profile2,
                institution: s.institution,
                course: s.course
            })));
            if (generatedSessions.length > 0) {
                console.log('Sample generated session fields (first row):', {
                    events: generatedSessions[0].events,
                    profile0: generatedSessions[0].profile0,
                    profile1: generatedSessions[0].profile1,
                    profile2: generatedSessions[0].profile2,
                    quiz: generatedSessions[0].quiz
                });
            }
            console.log('Full session payloads:', generatedSessions);
            return fetch(`${API_BASE}/sessions/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    sessions: generatedSessions,
                    selectedAccessKeyId
                })
            })
                .then(async (res) => {
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data.success) {
                        throw new Error(data.error || `HTTP ${res.status}`);
                    }
                    console.log('Database write result:', data);
                    if (data.accessKeyId) {
                        console.log('Created Access Key ID for generated sessions:', data.accessKeyId);
                    }
                    if (data.accessKey) {
                        console.log('Created Access Key details (password shown once):', data.accessKey);
                    }
                    console.groupEnd();
                    await loadSessions();
                    if (selectedAccessKeyId) {
                        showSuccess(`Created ${data.createdCount || generatedSessions.length} session(s) linked to Access Key ${selectedAccessKeyId}.`);
                    } else {
                        showSuccess(`Created ${data.createdCount || generatedSessions.length} session(s) in the database.`);
                    }
                });
        })
        .catch(err => {
            console.error('Error generating or creating sessions:', err);
            showError('Failed to generate or create sessions: ' + err.message);
        });
}

async function updateRestoreFileState() {
    const input = doc('restoreFileInput');
    const meta = doc('restoreFileMeta');
    const uploadBtn = doc('restoreUploadBtn');
    if (!input || !meta || !uploadBtn) return;

    const file = input.files && input.files[0] ? input.files[0] : null;
    if (!file) {
        meta.textContent = 'No file selected.';
        uploadBtn.disabled = true;
        hideRestorePreviewPanel();
        return;
    }

    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    meta.textContent = `Selected: ${file.name} (${sizeKb} KB)`;
    uploadBtn.disabled = !!activeRestoreJobId;

    // Auto-read and preview the file
    try {
        const fileText = await file.text();
        let packageData;
        try {
            packageData = JSON.parse(fileText);
        } catch (_err) {
            showError('Restore package is not valid JSON');
            hideRestorePreviewPanel();
            return;
        }

        // Validate package shape
        const shapeError = validateRestorePackageShape(packageData);
        if (shapeError) {
            showError(shapeError);
            hideRestorePreviewPanel();
            return;
        }

        // Store and show preview
        pendingRestorePackageData = packageData;
        pendingRestoreFileName = file.name;
        showRestorePreviewPanel(packageData, file.name);
    } catch (err) {
        showError('Failed to read restore file: ' + err.message);
        hideRestorePreviewPanel();
    }
}

async function handleRestoreUpload(event) {
    if (event) event.preventDefault();
    // File preview now happens automatically on file selection
    // This handler is kept for backward compatibility if needed
}

function validateRestorePackageShape(packageData) {
    if (!packageData || typeof packageData !== 'object') {
        return 'Restore package must be a JSON object';
    }
    if (packageData.exportType !== 'k2-session-export') {
        return 'Unsupported restore package type. Expected: k2-session-export';
    }
    if (!Array.isArray(packageData.sessions)) {
        return 'Restore package must contain a sessions array';
    }
    if (packageData.accessKey !== undefined && (packageData.accessKey === null || typeof packageData.accessKey !== 'object')) {
        return 'Restore package accessKey must be an object when provided';
    }
    return null;
}

function showRestorePreviewPanel(packageData, fileName) {
    const previewPanel = doc('restorePreviewPanel');
    const uploadForm = doc('restoreUploadForm');
    const statusPanel = doc('restoreStatusPanel');
    
    if (!previewPanel || !uploadForm || !statusPanel) return;

    // Extract details from package
    const sessionCount = Array.isArray(packageData.sessions) ? packageData.sessions.length : 0;
    
    // Extract institution and course from first session or scope
    let institutionName = 'Unknown';
    let courseName = 'Unknown';
    
    if (packageData.scope && typeof packageData.scope === 'object') {
        institutionName = packageData.scope.institutionSlug || 'Unknown';
        if (packageData.scope.courseSlug) {
            courseName = packageData.scope.courseSlug;
        }
    } else if (sessionCount > 0 && packageData.sessions[0]) {
        institutionName = packageData.sessions[0].institution || 'Unknown';
        courseName = packageData.sessions[0].course || 'Unknown';
    }

    const exportedAt = packageData.exportedAt ? new Date(packageData.exportedAt).toLocaleString() : 'Unknown';
    
    let accessKeyInfo = 'None included';
    if (packageData.accessKey && typeof packageData.accessKey === 'object') {
        const keyType = packageData.accessKey.type || 'unknown';
        accessKeyInfo = `${keyType} access key will be restored`;
    }

    // Update preview details
    doc('restorePreviewType').textContent = `${institutionName} / ${courseName}`;
    doc('restorePreviewSessionCount').textContent = sessionCount;
    doc('restorePreviewAccessKey').textContent = accessKeyInfo;
    doc('restorePreviewExportedAt').textContent = exportedAt;
    doc('restorePreviewScope').textContent = packageData.scope ? 'Course-specific' : 'Sessions only';

    // Hide upload form and status panel, show preview
    uploadForm.style.display = 'none';
    statusPanel.style.display = 'none';
    previewPanel.style.display = 'block';
    
    setRestoreControlsDisabled(true);
}

function hideRestorePreviewPanel() {
    const previewPanel = doc('restorePreviewPanel');
    const uploadForm = doc('restoreUploadForm');
    
    if (!previewPanel || !uploadForm) return;
    
    previewPanel.style.display = 'none';
    uploadForm.style.display = 'block';
    
    pendingRestorePackageData = null;
    pendingRestoreFileName = '';
    
    setRestoreControlsDisabled(false);
}

async function handleCompleteRestore() {
    if (!pendingRestorePackageData || !pendingRestoreFileName) {
        showError('No restore package loaded');
        return;
    }

    try {
        const previewPanel = doc('restorePreviewPanel');
        const uploadForm = doc('restoreUploadForm');
        const statusPanel = doc('restoreStatusPanel');
        
        if (!previewPanel || !uploadForm || !statusPanel) return;

        // Hide preview and upload form, show status panel
        previewPanel.style.display = 'none';
        uploadForm.style.display = 'none';
        statusPanel.style.display = 'block';

        // Show initial queued status
        renderRestoreJob({
            status: 'queued',
            totalSessions: Array.isArray(pendingRestorePackageData.sessions) ? pendingRestorePackageData.sessions.length : 0,
            processedSessions: 0,
            restoredSessions: 0,
            failedSessions: 0,
            events: [{ time: new Date().toISOString(), level: 'info', message: `Uploading ${pendingRestoreFileName}` }]
        });

        // Send to backend
        const res = await fetch(`${API_BASE}/restore/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                fileName: pendingRestoreFileName,
                packageData: pendingRestorePackageData
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            renderRestoreJob({
                status: 'failed',
                totalSessions: 0,
                processedSessions: 0,
                restoredSessions: 0,
                failedSessions: 0,
                events: [{ time: new Date().toISOString(), level: 'error', message: (data && data.error) || 'Restore upload failed' }]
            });
            setRestoreControlsDisabled(false);
            updateRestoreFileState();
            pendingRestorePackageData = null;
            pendingRestoreFileName = '';
            return;
        }

        activeRestoreJobId = data.jobId || null;
        if (!activeRestoreJobId) {
            renderRestoreJob({
                status: 'failed',
                totalSessions: 0,
                processedSessions: 0,
                restoredSessions: 0,
                failedSessions: 0,
                events: [{ time: new Date().toISOString(), level: 'error', message: 'Restore job ID was not returned' }]
            });
            setRestoreControlsDisabled(false);
            updateRestoreFileState();
            pendingRestorePackageData = null;
            pendingRestoreFileName = '';
            return;
        }

        stopRestorePolling();
        pollRestoreJob(activeRestoreJobId);
    } catch (err) {
        renderRestoreJob({
            status: 'failed',
            totalSessions: 0,
            processedSessions: 0,
            restoredSessions: 0,
            failedSessions: 0,
            events: [{ time: new Date().toISOString(), level: 'error', message: 'Restore upload failed: ' + err.message }]
        });
        setRestoreControlsDisabled(false);
        updateRestoreFileState();
        pendingRestorePackageData = null;
        pendingRestoreFileName = '';
    }
}

async function setUserPassword(userId, username) {
    const newPassword = prompt(`Set a new password for user "${username}":`);
    if (newPassword === null) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin-users/${userId}/set-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        if (!res.ok) {
            const err = await res.json();
            showError(err.error || 'Failed to set password');
            return;
        }

        const result = await res.json();
        showSuccess(`Password updated for "${result.username}"`);
    } catch (err) {
        console.error('Error setting password:', err);
        showError('Failed to set password: ' + err.message);
    }
}

async function resetUserPassword(userId, username) {
    if (!confirm(`Reset password for user "${username}"?\n\nA new random password will be generated and displayed once. Make sure to save it!`)) {
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/admin-users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!res.ok) {
            const err = await res.json();
            showError(err.error || 'Failed to reset password');
            return;
        }
        
        const result = await res.json();
        
        // Show password in a prompt that can be copied
        const message = `Password reset successful for "${result.username}"!\n\nNew password: ${result.newPassword}\n\nIMPORTANT: Copy this password now. It will not be shown again.\nThe user should change this password after logging in.`;
        
        // Try to copy to clipboard
        try {
            await navigator.clipboard.writeText(result.newPassword);
            alert(message + '\n\n✓ Password copied to clipboard!');
        } catch (clipErr) {
            // Clipboard API failed, just show the message
            alert(message);
        }
        
        showSuccess(`Password reset for "${result.username}". New password copied to clipboard.`);
    } catch (err) {
        console.error('Error resetting password:', err);
        showError('Failed to reset password: ' + err.message);
    }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        if (!csrfToken) {
            await loadCsrfToken();
        }
        if (!csrfToken) {
            showError('Security token not available. Please refresh the page.');
            return;
        }
        const resp = await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'x-csrf-token': csrfToken
            }
        });
        if (!resp.ok) {
            const text = await resp.text();
            console.error('Logout failed:', resp.status, text);
            showError('Logout failed');
            return;
        }
        document.getElementById('loginSection').classList.add('active');
        document.getElementById('adminSection').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
        document.getElementById('dashboardHeading').textContent = 'Admin Portal';
        const buildInfoLine = doc('buildInfoLine');
        if (buildInfoLine) {
            buildInfoLine.style.display = 'none';
            buildInfoLine.textContent = '';
        }
        document.body.classList.remove('role-superuser', 'role-admin');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        showSuccess('Logged out');
    } catch (err) {
        console.error('Logout error', err);
        showError('Logout failed');
    }
});

// Event listeners for form submission and button clicks
document.getElementById('saveInstitutionBtn').addEventListener('click', submitInstitution);
document.getElementById('institutionForm').addEventListener('submit', submitInstitution);
document.getElementById('addCourseBtn').addEventListener('click', addCourse);
document.getElementById('cancelEditBtn').addEventListener('click', () => {
    if (hasChanges()) {
        if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
    }
    resetForm();
    setCreateInstitutionCollapsed(true);
});
document.getElementById('accessKeyForm').addEventListener('submit', createAccessKey);
document.getElementById('accessType').addEventListener('change', handleAccessTypeChange);
document.getElementById('accessInstSlug').addEventListener('change', function() {
    const type = doc('accessType').value;
    if (type === 'course') {
        populateAccessKeyCourseDropdown(this.value);
    }
});
document.getElementById('adminUserForm').addEventListener('submit', createAdminUser);
document.getElementById('restoreUploadForm').addEventListener('submit', handleRestoreUpload);
document.getElementById('restoreFileInput').addEventListener('change', updateRestoreFileState);
document.getElementById('sessionGeneratorForm').addEventListener('submit', handleSessionGeneratorSubmit);
document.getElementById('sessionGeneratorStartDate').addEventListener('input', updateSessionGeneratorRetentionPreview);
document.getElementById('sessionGeneratorInstitution').addEventListener('change', function() {
    populateSessionGeneratorCourseDropdown(this.value);
    const courseSelect = doc('sessionGeneratorCourse');
    populateSessionGeneratorAccessKeyDropdown(this.value, courseSelect ? courseSelect.value : '');
});
document.getElementById('sessionGeneratorCourse').addEventListener('change', function() {
    const institutionSelect = doc('sessionGeneratorInstitution');
    populateSessionGeneratorAccessKeyDropdown(institutionSelect ? institutionSelect.value : '', this.value);
});
const retentionRefreshBtn = doc('retentionRefreshBtn');
if (retentionRefreshBtn) {
    retentionRefreshBtn.addEventListener('click', () => {
        Promise.all([loadRetentionRuns(), loadRetentionArchives()]);
    });
}
const retentionArchivePendingOnlyToggle = doc('retentionArchivePendingOnly');
if (retentionArchivePendingOnlyToggle) {
    retentionArchivePendingOnlyToggle.addEventListener('change', (event) => {
        retentionArchivePendingOnly = Boolean(event && event.target && event.target.checked);
        saveUiState({ retentionArchivePendingOnly });
        renderRetentionArchives();
    });
}
document.getElementById('courseName').addEventListener('input', () => {
    maybeAutofillCourseSlug();
    updateAddCourseButtonState();
});
document.getElementById('courseSlug').addEventListener('input', () => { 
    courseSlugEdited = true;
    updateAddCourseButtonState();
});
document.getElementById('instSlug').addEventListener('input', () => {
    instSlugEdited = true;
    updateButtonState();
});
document.getElementById('instTitle').addEventListener('input', () => {
    maybeAutofillInstSlug();
    updateButtonState();
});

// Warn before navigating away or refreshing with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasChanges()) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
    }
});

// Check if already authenticated on page load
async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/check-auth`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        if (res.ok) {
            // Already authenticated, show admin section
            const data = await res.json();
            console.log('Already authenticated:', data);
            showAdminSection(data.role);
            await loadInstitutions();
            await loadAccessKeys();
            await loadSessions();
            await loadAdminUsers(); // Check if user is superuser and load admin users
            // Restore state after institutions are loaded
            if (restoreState() && formMode === 'edit') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                resetForm();
            }
        } else if (res.status === 401 || res.status === 403) {
            // Not authenticated; show login form (default state)
            console.log('Not authenticated, status:', res.status);
            resetForm();
        } else {
            // Other error
            console.error('Auth check failed:', res.status);
            resetForm();
        }
    } catch (err) {
        console.error('Auth check error:', err);
        resetForm();
    }
}

// Check authentication on page load - only initialize UI after auth check completes
(async () => {
    initRetentionArchiveFilterState();
    initPanelDragSort();
    initCreateInstitutionPane();
    initAccessKeysPane();
    initInstitutionsPane();
    initSessionsPane();
    initRestorePane();
    initRetentionPane();
    initAdminUsersPane();
    initSessionGeneratorPane();
    initSessionsActions();
    initAccessKeysHelpModal();
    initGeneratedAccessKeyModal();
    await loadCsrfToken();
    showLoginErrorFromUrl();
    await checkAuth();
    updateAddCourseButtonState();
    updateRestoreFileState();
    handleAccessTypeChange();
    initThemeToggle();
})();



