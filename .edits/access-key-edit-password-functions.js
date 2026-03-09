// This is the updated renderAccessKeys function with edit password button

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
                    <button class="secondary small edit-key-password" data-id="${k._id}">Edit Password</button>
                    <button class="secondary small toggle-key" data-id="${k._id}" data-active="${k.active ? '1' : '0'}">${k.active ? 'Disable' : 'Enable'}</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.edit-key-password').forEach(btn => {
        btn.addEventListener('click', (e) => editAccessKeyPassword(e.target.dataset.id));
    });

    container.querySelectorAll('.toggle-key').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const currentlyActive = e.target.dataset.active === '1';
            await setAccessKeyActive(id, !currentlyActive);
        });
    });
}

// Add this function after setAccessKeyActive

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
