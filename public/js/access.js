const API_BASE = '/access';
const doc = (id) => document.getElementById(id);
const STORAGE_KEY = 'facilitator_dashboard_state';

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
let pinnedSessionId = null; // Track pinned/toggled session highlight
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
        if (state && typeof state.showCompletedOnly === 'boolean') {
            const checkbox = doc('showCompletedOnly');
            if (checkbox) checkbox.checked = state.showCompletedOnly;
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
        updateClearDatesButtonState();
    } catch (err) {
        console.warn('Failed to load saved state:', err);
    }
}

function saveState() {
    try {
        const checkbox = doc('showCompletedOnly');
        const dateFromInput = doc('dateFrom');
        const dateToInput = doc('dateTo');
        const state = {
            showCompletedOnly: checkbox ? checkbox.checked : false,
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

function handleAccessTypeChange() {
    const type = doc('accessType').value;
    const courseInput = doc('courseSlug');
    if (type === 'institution') {
        courseInput.value = '';
        courseInput.disabled = true;
    } else {
        courseInput.disabled = false;
    }
}

async function login(event) {
    if (event) event.preventDefault();

    const type = doc('accessType').value;
    const institutionSlug = doc('institutionSlug').value.trim().toLowerCase();
    const courseSlug = doc('courseSlug').value.trim().toLowerCase();
    const password = doc('password').value;

    if (!institutionSlug || !password) {
        showError('Institution slug and password are required');
        return;
    }

    if (type === 'course' && !courseSlug) {
        showError('Course slug is required for course access');
        return;
    }

    const payload = { type, institutionSlug, password };
    if (type === 'course') {
        payload.courseSlug = courseSlug;
    }

    try {
        const res = await fetch(`${API_BASE}/login`, {
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
        showSessionsSection();
        // Update browser URL to facilitator/dashboard
        window.history.pushState({ page: 'facilitator' }, 'Facilitator Dashboard', '/facilitator/dashboard');
        loadSessions();
    } catch (err) {
        showError('Login failed: ' + err.message);
    }
}

function showSessionsSection() {
    doc('loginSection').style.display = 'none';
    doc('sessionsSection').style.display = 'block';
    doc('logoutBtn').style.display = 'block';

    console.log('showSessionsSection - currentAccess:', currentAccess);

    const accessTitle = doc('accessTitle');
    const accessSubtitle = doc('accessSubtitle');

    const institutionLabel = currentAccess.institutionName || currentAccess.institutionSlug || 'Institution';
    let courseLabel = 'All courses';
    if (currentAccess.type === 'course') {
        courseLabel = currentAccess.courseName || currentAccess.courseSlug || 'Course';
    }

    if (accessTitle) accessTitle.textContent = institutionLabel;
    if (accessSubtitle) accessSubtitle.textContent = `Course: ${courseLabel}`;
    
    // Load game data for quiz display
    loadGameData();
    
    // Add radio button listeners for select mode (after sessions section is visible)
    const radioButtons = document.querySelectorAll('input[name="selectMode"]');
    if (radioButtons.length > 0 && !radioButtons[0].dataset.listenerAdded) {
        radioButtons[0].dataset.listenerAdded = 'true';
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const showCompletedOnly = doc('showCompletedOnly') ? doc('showCompletedOnly').checked : false;
                let filteredSessions = showCompletedOnly 
                    ? sessions.filter(s => s.state && s.state !== 'incomplete')
                    : sessions;
                
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

async function loadSessions() {
    try {
        const res = await fetch(`${API_BASE}/sessions`);
        if (!res.ok) {
            showError('Failed to load sessions');
            return;
        }
        const data = await res.json();
        sessions = data.sessions || [];
        renderSessions();
    } catch (err) {
        showError('Failed to load sessions: ' + err.message);
    }
}

async function loadGameData() {
    try {
        const res = await fetch(`${API_BASE}/gamedata`);
        if (!res.ok) {
            console.warn('Failed to load gamedata');
            return;
        }
        gameData = await res.json();
        console.log('GameData loaded:', gameData);
        
        // Load quiz questions from quiz1 bank
        try {
            console.log('Fetching quiz questions from:', `${API_BASE}/quiz/quiz1`);
            const quizRes = await fetch(`${API_BASE}/quiz/quiz1`);
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
    
    // Filter sessions based on checkbox
    const showCompletedOnly = doc('showCompletedOnly') ? doc('showCompletedOnly').checked : false;
    let filteredSessions = showCompletedOnly 
        ? sessions.filter(s => s.state && s.state !== 'incomplete')
        : sessions;
    
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
    
    console.log(`Filtered sessions: ${filteredSessions.length} (showCompletedOnly: ${showCompletedOnly})`);
    
    // Update sessions count
    const countSpan = doc('sessionsCount');
    if (countSpan) {
        countSpan.textContent = `[${filteredSessions.length} found]`;
    }

    if (filteredSessions.length === 0) {
        container.innerHTML = '<p class="muted">No sessions match the filter.</p>';
        return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredSessions.length / sessionsPerPage);
    if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
    const startIdx = (currentPage - 1) * sessionsPerPage;
    const endIdx = startIdx + sessionsPerPage;
    const pageSessionions = filteredSessions.slice(startIdx, endIdx);
    
    // Render paginated sessions
    let html = pageSessionions.map((s, index) => {
        // Log each session's full data
        console.log(`\nSession ${startIdx + index + 1}:`, s);
        console.log('  Fields:', Object.keys(s));
        
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
                </div>
                <div style="position: absolute; right: 10px; bottom: 10px;">
                    <input type="checkbox" class="sessionSelect" data-id="${s.uniqueID}" ${isChecked}>
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
                <button id="prevPageBtn" class="pagination-btn" ${prevDisabled} style="padding: 6px 12px; background: #2196F3; color: white; border: 1px solid #1565c0; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; opacity: ${currentPage === 1 ? '0.5' : '1'};">← Prev</button>
                <span style="display: flex; align-items: center; padding: 6px 12px; font-size: 13px; color: #666;">Page ${currentPage} of ${totalPages}</span>
                <button id="nextPageBtn" class="pagination-btn" ${nextDisabled} style="padding: 6px 12px; background: #2196F3; color: white; border: 1px solid #1565c0; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; opacity: ${currentPage === totalPages ? '0.5' : '1'};">Next →</button>
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
            saveState();
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
}

function updateSelectAllCheckbox() {
    // Get filtered sessions count
    const showCompletedOnly = doc('showCompletedOnly') ? doc('showCompletedOnly').checked : false;
    let filteredSessions = showCompletedOnly 
        ? sessions.filter(s => s.state && s.state !== 'incomplete')
        : sessions;
    
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

function updateSelectedSessionsPanel() {
    const list = doc('selectedSessionsList');
    if (!list) return;
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) {
        list.innerHTML = '<p class="muted">No sessions selected.</p>';
        // Hide charts grid
        const grid = doc('quizChartsGrid');
        if (grid) grid.style.display = 'none';
        return;
    }
    
    // Get selected sessions with time values
    const selectedSessions = sessions.filter(s => s.uniqueID && selectedSessionIds.has(s.uniqueID));
    
    // Build time bar chart
    let timeChartHTML = '';
    if (selectedSessions.length > 0) {
        const maxTime = Math.max(...selectedSessions.map(s => s.time || 0));
        const bars = selectedSessions.map(s => {
            const time = s.time || 0;
            const percentage = maxTime > 0 ? (time / maxTime) * 100 : 0;
            return `
                <div class="time-bar-row" data-session-id="${s.uniqueID}" style="display: flex; align-items: center; margin-bottom: 8px; gap: 8px; cursor: pointer; padding: 4px; border-radius: 3px; transition: background-color 0.2s ease;">
                    <div style="width: 150px; font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${s.name || s.uniqueID}">${s.name || s.uniqueID}</div>
                    <div style="flex: 1; background: #e0e0e0; height: 24px; border-radius: 3px; position: relative; overflow: hidden;">
                        <div class="time-bar-fill" style="background: linear-gradient(90deg, #2196F3, #1976D2); height: 100%; width: ${percentage}%; border-radius: 3px; transition: all 0.3s ease;"></div>
                    </div>
                    <div style="width: 60px; text-align: right; font-size: 12px; font-weight: 600; color: #333;">${time} min</div>
                </div>
            `;
        }).join('');
        
        timeChartHTML = `
            <div style="border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; background: #fafafa; margin-bottom: 15px;">
                <h4 style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: #333;">Session Times</h4>
                ${bars}
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
            // Don't apply hover if this session is pinned
            if (pinnedSessionId === sessionId) return;
            
            // Highlight the bar
            row.style.backgroundColor = '#f0f0f0';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #1976D2, #0d47a1)';
                barFill.style.transform = 'scaleY(1.1)';
            }
            
            // Highlight the corresponding session tile
            const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
            if (sessionTile) {
                sessionTile.style.backgroundColor = '#e3f2fd';
                sessionTile.style.borderColor = '#2196F3';
                sessionTile.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
            }
        });
        
        row.addEventListener('mouseleave', () => {
            // Don't remove highlight if this session is pinned
            if (pinnedSessionId === sessionId) return;
            
            // Reset the bar
            row.style.backgroundColor = '';
            if (barFill) {
                barFill.style.background = 'linear-gradient(90deg, #2196F3, #1976D2)';
                barFill.style.transform = '';
            }
            
            // Reset the session tile
            const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
            if (sessionTile) {
                sessionTile.style.backgroundColor = '';
                sessionTile.style.borderColor = '';
                sessionTile.style.boxShadow = '';
            }
        });
        
        row.addEventListener('click', () => {
            // Toggle pin state
            if (pinnedSessionId === sessionId) {
                // Unpin - remove highlight
                pinnedSessionId = null;
                row.style.backgroundColor = '';
                if (barFill) {
                    barFill.style.background = 'linear-gradient(90deg, #2196F3, #1976D2)';
                    barFill.style.transform = '';
                }
                
                const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
                if (sessionTile) {
                    sessionTile.style.backgroundColor = '';
                    sessionTile.style.borderColor = '';
                    sessionTile.style.boxShadow = '';
                }
            } else {
                // Clear previous pin if any
                if (pinnedSessionId) {
                    const prevRow = list.querySelector(`.time-bar-row[data-session-id="${pinnedSessionId}"]`);
                    if (prevRow) {
                        prevRow.style.backgroundColor = '';
                        const prevFill = prevRow.querySelector('.time-bar-fill');
                        if (prevFill) {
                            prevFill.style.background = 'linear-gradient(90deg, #2196F3, #1976D2)';
                            prevFill.style.transform = '';
                        }
                    }
                    
                    const prevTile = document.querySelector(`.institution-item[data-session-id="${pinnedSessionId}"]`);
                    if (prevTile) {
                        prevTile.style.backgroundColor = '';
                        prevTile.style.borderColor = '';
                        prevTile.style.boxShadow = '';
                    }
                }
                
                // Pin - apply persistent highlight
                pinnedSessionId = sessionId;
                row.style.backgroundColor = '#f0f0f0';
                if (barFill) {
                    barFill.style.background = 'linear-gradient(90deg, #1976D2, #0d47a1)';
                    barFill.style.transform = 'scaleY(1.1)';
                }
                
                const sessionTile = document.querySelector(`.institution-item[data-session-id="${sessionId}"]`);
                if (sessionTile) {
                    sessionTile.style.backgroundColor = '#e3f2fd';
                    sessionTile.style.borderColor = '#2196F3';
                    sessionTile.style.boxShadow = '0 2px 8px rgba(33, 150, 243, 0.3)';
                }
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
    
    const colours = ['#4CAF50', '#FF9800', '#2196F3', '#e200ff', '#9af321'];
    
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
        await fetch(`${API_BASE}/logout`, { method: 'POST' });
    } catch (err) {
        console.error('Logout error:', err);
    }
    currentAccess = null;
    sessions = [];
    selectedSessionIds.clear();
    saveState();
    doc('loginSection').style.display = 'block';
    doc('sessionsSection').style.display = 'none';
    doc('logoutBtn').style.display = 'none';
    doc('password').value = '';
    doc('institutionSlug').value = '';
    doc('courseSlug').value = '';
    showSuccess('Logged out');
}

async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/check`);
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
        const res = await fetch(`${API_BASE}/sessions`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds: ids })
        });
        
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

doc('loginForm').addEventListener('submit', login);
doc('accessType').addEventListener('change', handleAccessTypeChange);
doc('logoutBtn').addEventListener('click', logout);

// Add filter checkbox listener
document.addEventListener('DOMContentLoaded', () => {
    loadSavedState();
    const checkbox = doc('showCompletedOnly');
    if (checkbox) {
        checkbox.addEventListener('change', () => {
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

    updateClearDatesButtonState();
});

// Ensure saved selections are available before auth check
loadSavedState();

// Check auth on page load
(async () => {
    await checkAuth();
    handleAccessTypeChange();
})();
