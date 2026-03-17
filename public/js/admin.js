const API_BASE = '/admin/api';
const STORAGE_KEY = 'admin_institution_state';
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
}

async function loadInstitutions() {
    try {
        const res = await fetch(`${API_BASE}/institutions`);
        if (!res.ok) throw new Error('Failed to fetch');
        const institutions = await res.json();
        institutionsCache = institutions;
        renderInstitutions(institutions);
        populateAccessKeyInstitutionDropdown(institutions);
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
    } catch (err) {
        showError('Failed to load access keys: ' + err.message);
    }
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
                <div>ID: ${inst._id}</div>
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
            // Don't toggle if clicking on ID text (for copying)
            if (e.target.tagName === 'DIV' && e.target.textContent.startsWith('ID:')) return;
            const item = header.closest('.institution-item');
            item.classList.toggle('collapsed');
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
    container.innerHTML = accessKeys.map(k => {
        const activeBadge = k.active
            ? '<span class="status-badge is-active">active</span>'
            : '<span class="status-badge is-inactive">inactive</span>';
        const scope = k.type === 'institution'
            ? `INS: ${k.institutionSlug}`
            : `COU: ${k.institutionSlug} / ${k.courseSlug}`;
        const label = k.label ? ` • ${k.label}` : '';
        const created = k.createdAt ? new Date(k.createdAt).toLocaleString() : '';
        return `
            <div class="institution-item collapsed" data-id="${k._id}">
                <div class="institution-header">
                    <div>
                        <h3>${scope}${label}</h3>
                        <span class="institution-slug">${activeBadge}</span>
                    </div>
                    <div>${created}</div>
                </div>
                <div class="button-group">
                    <button class="secondary small edit-key-password" data-id="${k._id}">Edit Password</button>
                    <button class="secondary small toggle-key" data-id="${k._id}" data-active="${k.active ? '1' : '0'}">${k.active ? 'Disable' : 'Enable'}</button>
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

async function createAccessKey(event) {
    if (event) event.preventDefault();
    const type = doc('accessType').value;
    const institutionSlug = doc('accessInstSlug').value;
    const courseSlug = doc('accessCourseSlug').value;
    const password = doc('accessPassword').value;
    const label = doc('accessLabel').value.trim();

    if (!type || !institutionSlug || !password) {
        showError('Type, institution slug, and password are required');
        return;
    }
    if (type === 'course' && !courseSlug) {
        showError('Course slug is required for course access');
        return;
    }

    const payload = { type, institutionSlug, password, label };
    if (type === 'course') {
        payload.courseSlug = courseSlug;
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
                return;
            }
            throw new Error('Failed to fetch admin users');
        }
        // If we got here, user is a superuser
        doc('adminUsersSection').style.display = 'block';
        const users = await res.json();
        renderAdminUsers(users);
    } catch (err) {
        console.error('Failed to load admin users:', err.message);
        doc('adminUsersSection').style.display = 'none';
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
    
    // Attach event listeners to reset password buttons
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

    if (password.length < 8) {
        console.log('Validation failed: password too short');
        showError('Password must be at least 8 characters');
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
    await loadCsrfToken();
    showLoginErrorFromUrl();
    await checkAuth();
    updateAddCourseButtonState();
    handleAccessTypeChange();
})();



