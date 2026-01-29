const API_BASE = '/admin/api';
const STORAGE_KEY = 'admin_institution_state';
const doc = (id) => document.getElementById(id);
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

async function login() {
    const password = doc('password').value;
    if (!password) {
        showError('Please enter a password');
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (res.ok) {
            showSuccess('Authenticated');
            showAdminSection();
            loadInstitutions();
            loadAccessKeys();
            // Update browser URL to admin/dashboard
            window.history.pushState({ page: 'admin' }, 'Admin Dashboard', '/admin/dashboard');
        } else {
            showError('Invalid password');
        }
    } catch (err) {
        showError('Authentication failed: ' + err.message);
    }
}

function showAdminSection() {
    document.getElementById('loginSection').classList.remove('active');
    document.getElementById('adminSection').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
}

async function loadInstitutions() {
    try {
        const res = await fetch(`${API_BASE}/institutions`);
        if (!res.ok) throw new Error('Failed to fetch');
        const institutions = await res.json();
        institutionsCache = institutions;
        renderInstitutions(institutions);
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
        <div class="institution-item">
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
                    ${inst.courses.map(c => `<div class="course-item">• ${c.name} (${c.slug})</div>`).join('')}
                </div>
            ` : '<p style="color: #999;">No courses</p>'}
            <div class="button-group">
                <button class="edit-btn" data-id="${inst._id}">Edit</button>
                <button class="danger delete-btn" data-id="${inst._id}">Delete</button>
            </div>
        </div>
    `).join('');

    // Attach event listeners to edit and delete buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => startEditInstitution(e.target.dataset.id));
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => deleteInstitution(e.target.dataset.id));
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
        const activeBadge = k.active ? '<span class="pill-sub" style="color:#0a0;">active</span>' : '<span class="pill-sub" style="color:#a00;">inactive</span>';
        const scope = k.type === 'institution'
            ? `INS: ${k.institutionSlug}`
            : `COU: ${k.institutionSlug} / ${k.courseSlug}`;
        const label = k.label ? ` • ${k.label}` : '';
        const created = k.createdAt ? new Date(k.createdAt).toLocaleString() : '';
        return `
            <div class="institution-item" data-id="${k._id}">
                <div class="institution-header">
                    <div>
                        <h3>${scope}${label}</h3>
                        <span class="institution-slug">${activeBadge}</span>
                    </div>
                    <div>${created}</div>
                </div>
                <div class="button-group">
                    <button class="secondary small toggle-key" data-id="${k._id}" data-active="${k.active ? '1' : '0'}">${k.active ? 'Disable' : 'Enable'}</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.toggle-key').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const currentlyActive = e.target.dataset.active === '1';
            await setAccessKeyActive(id, !currentlyActive);
        });
    });
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
    const institutionSlug = doc('accessInstSlug').value.trim().toLowerCase();
    const courseSlug = doc('accessCourseSlug').value.trim().toLowerCase();
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

function handleAccessTypeChange() {
    const type = doc('accessType').value;
    const courseInput = doc('accessCourseSlug');
    if (type === 'institution') {
        courseInput.value = '';
        courseInput.disabled = true;
    } else {
        courseInput.disabled = false;
    }
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    document.getElementById('loginSection').classList.add('active');
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('password').value = '';
    showSuccess('Logged out');
});

// Event listeners for form submission and button clicks
document.getElementById('loginBtn').addEventListener('click', login);
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
        const res = await fetch(`${API_BASE}/institutions`);
        if (res.ok) {
            // Already authenticated, show admin section
            showAdminSection();
            await loadInstitutions();
            await loadAccessKeys();
            // Restore state after institutions are loaded
            if (restoreState() && formMode === 'edit') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                resetForm();
            }
        } else if (res.status === 401) {
            // Not authenticated; show login form (default state)
            resetForm();
        } else {
            // Other error
            console.error('Auth check failed:', res.status);
        }
    } catch (err) {
        console.error('Auth check error:', err);
        resetForm();
    }
}

// Check authentication on page load - only initialize UI after auth check completes
(async () => {
    await checkAuth();
    updateAddCourseButtonState();
    handleAccessTypeChange();
})();
