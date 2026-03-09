// Add this function before module.exports in adminController.js

const updateAccessKeyPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body || {};
        if (!password) {
            return res.status(400).json({ error: 'password is required' });
        }
        const key = await AccessKey.findById(id);
        if (!key) {
            return res.status(404).json({ error: 'Access key not found' });
        }
        const passwordHash = await hashPassword(password);
        key.passwordHash = passwordHash;
        await key.save();
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('Error updating access key password:', err);
        res.status(500).json({ error: 'Failed to update password' });
    }
};

// Add to module.exports:
// updateAccessKeyPassword

// Add to routeController.js:
// app.patch('/admin/api/access-keys/:id/password', authController.requireAdmin, adminController.updateAccessKeyPassword);
