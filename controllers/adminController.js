const Institution = require('../models/institution');
const User = require('../models/user');
const AccessKey = require('../models/accessKey');
const { hashPassword, verifyPassword } = require('./authController');
const crypto = require('crypto');

const normalizeCourses = (courses = []) => {
    if (!Array.isArray(courses)) {
        return { error: 'Courses must be an array' };
    }
    const seenSlugs = new Set();
    const seenNames = new Set();
    const normalized = [];
    for (const course of courses) {
        if (!course || typeof course !== 'object') {
            return { error: 'Each course must be an object with name and slug' };
        }
        const slug = (course.slug || '').toString().trim().toLowerCase();
        const nameRaw = (course.name || '').toString().trim();
        const name = nameRaw;
        const nameKey = nameRaw.toLowerCase();
        if (!slug || !name) {
            return { error: 'Each course requires both slug and name' };
        }
        if (seenSlugs.has(slug)) {
            return { error: `Duplicate course slug "${slug}"` };
        }
        if (seenNames.has(nameKey)) {
            return { error: `Duplicate course name "${name}" (case-insensitive)` };
        }
        seenSlugs.add(slug);
        seenNames.add(nameKey);
        normalized.push({ slug, name });
    }
    return { normalized };
};

// Middleware to check admin authentication
const adminAuth = (req, res, next) => {
    if (req.session && (req.session.adminAuth === true || req.session.role === 'admin' || req.session.role === 'superuser')) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};
// GET /admin/api/check-auth - check authentication and return role
const checkAdminAuth = (req, res) => {
    if (req.session && (req.session.adminAuth === true || req.session.role === 'admin' || req.session.role === 'superuser')) {
        return res.json({ 
            authenticated: true, 
            role: req.session.role,
            username: req.session.username 
        });
    }
    return res.status(401).json({ authenticated: false });
};
// POST /admin/auth - authenticate with password
const authenticateAdmin = async (req, res) => {
    const { username, password } = req.body || {};
    const wantsJson = req.accepts('json') && !req.accepts('html');
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    const respondJson = wantsJson || isAjax;

    if (!username || !password) {
        if (respondJson) {
            return res.status(400).json({ error: 'username and password are required' });
        }
        return res.redirect('/admin?error=required');
    }
    try {
        // Check environment variable superuser password first
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
        if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
            req.session.adminAuth = true;
            req.session.isAuthenticated = true;
            req.session.role = 'superuser';
            req.session.username = username || 'env-superuser';
            return req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    if (respondJson) {
                        return res.status(500).json({ error: 'Session save failed' });
                    }
                    return res.redirect('/admin?error=invalid');
                }
                if (respondJson) {
                    return res.json({ success: true, username: req.session.username, role: 'superuser' });
                }
                return res.redirect('/admin');
            });
        }

        // Check database user
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            if (respondJson) {
                return res.status(403).json({ error: 'Invalid username or password' });
            }
            return res.redirect('/admin?error=invalid');
        }
        // Check if user is admin or superuser
        if (!['admin', 'superuser'].includes(user.role)) {
            if (respondJson) {
                return res.status(403).json({ error: 'User does not have admin access' });
            }
            return res.redirect('/admin?error=invalid');
        }
        // Verify password
        const isValidPassword = await verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
            if (respondJson) {
                return res.status(403).json({ error: 'Invalid username or password' });
            }
            return res.redirect('/admin?error=invalid');
        }
        // Set session
        req.session.adminAuth = true;
        req.session.isAuthenticated = true;
        req.session.role = user.role;
        req.session.username = user.username;
        req.session.userId = user._id.toString();
        return req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                if (respondJson) {
                    return res.status(500).json({ error: 'Session save failed' });
                }
                return res.redirect('/admin?error=invalid');
            }
            if (respondJson) {
                return res.json({ success: true, username: user.username, role: user.role });
            }
            return res.redirect('/admin');
        });
    } catch (err) {
        console.error('Admin authentication error:', err);
        if (respondJson) {
            return res.status(500).json({ error: 'Authentication failed' });
        }
        return res.redirect('/admin?error=invalid');
    }
};

// GET /admin/institutions - list all institutions
const getInstitutions = async (req, res) => {
    try {
        const institutions = await Institution.find().lean();
        res.json(institutions);
    } catch (err) {
        console.error('Error fetching institutions:', err);
        res.status(500).json({ error: 'Failed to fetch institutions' });
    }
};

// POST /admin/institutions - create institution
const createInstitution = async (req, res) => {
    try {
        const { slug, title, courses } = req.body;
        if (!slug || !title) {
            return res.status(400).json({ error: 'slug and title are required' });
        }
        const courseCheck = normalizeCourses(courses || []);
        if (courseCheck.error) {
            return res.status(400).json({ error: courseCheck.error });
        }
        const inst = new Institution({
            slug: slug.trim().toLowerCase(),
            title: title.trim(),
            courses: courseCheck.normalized
        });
        await inst.save();
        res.json(inst);
    } catch (err) {
        console.error('Error creating institution:', err);
        res.status(500).json({ error: 'Failed to create institution' });
    }
};

// PUT /admin/institutions/:id - update institution
const updateInstitution = async (req, res) => {
    try {
        const { id } = req.params;
        const { slug, title, courses } = req.body;
        let courseCheck = null;
        if (courses !== undefined) {
            courseCheck = normalizeCourses(courses);
            if (courseCheck.error) {
                return res.status(400).json({ error: courseCheck.error });
            }
        }
        const update = {};
        if (slug) {
            update.slug = slug.trim().toLowerCase();
        }
        if (title) {
            update.title = title.trim();
        }
        if (courseCheck) {
            update.courses = courseCheck.normalized;
        }
        const inst = await Institution.findByIdAndUpdate(
            id,
            update,
            { new: true, runValidators: true }
        );
        if (!inst) {
            return res.status(404).json({ error: 'Institution not found' });
        }
        res.json(inst);
    } catch (err) {
        console.error('Error updating institution:', err);
        res.status(500).json({ error: 'Failed to update institution' });
    }
};

// DELETE /admin/institutions/:id - delete institution
const deleteInstitution = async (req, res) => {
    try {
        const { id } = req.params;
        const inst = await Institution.findByIdAndDelete(id);
        if (!inst) {
            return res.status(404).json({ error: 'Institution not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting institution:', err);
        res.status(500).json({ error: 'Failed to delete institution' });
    }
};

// -- Admin user management (superuser only) --
const createAdminUser = async (req, res) => {
    try {
        const { username, password, role = 'admin' } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'username and password are required' });
        }
        if (!['admin', 'superuser'].includes(role)) {
            return res.status(400).json({ error: 'role must be admin or superuser' });
        }
        const existing = await User.findOne({ username: username.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: 'username already exists' });
        }
        const passwordHash = await hashPassword(password);
        const user = await User.create({
            username: username.toLowerCase(),
            passwordHash,
            role,
            active: true,
            createdBy: req.session && req.session.username ? req.session.username : 'system'
        });
        res.json({ success: true, id: user._id, username: user.username, role: user.role });
    } catch (err) {
        console.error('Error creating admin user:', err);
        res.status(500).json({ error: 'Failed to create admin user' });
    }
};

const listAdminUsers = async (_req, res) => {
    const users = await User.find({}, { passwordHash: 0 }).lean();
    res.json(users);
};

const resetAdminPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Generate a random password
        const newPassword = generateRandomPassword();
        const passwordHash = await hashPassword(newPassword);
        user.passwordHash = passwordHash;
        await user.save();
        
        res.json({ 
            success: true, 
            username: user.username, 
            newPassword: newPassword,
            message: 'Password reset successfully. User should change this password after login.' 
        });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
};

// Helper function to generate a secure random password
function generateRandomPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        password += charset[array[i] % charset.length];
    }
    return password;
}

// -- Access key management (admin/superuser) --
const createAccessKey = async (req, res) => {
    try {
        const { type, institutionSlug, courseSlug, password, label } = req.body || {};
        if (!type || !institutionSlug || !password) {
            return res.status(400).json({ error: 'type, institutionSlug, and password are required' });
        }
        const normalizedType = type.toLowerCase();
        if (!['institution', 'course'].includes(normalizedType)) {
            return res.status(400).json({ error: 'Invalid type' });
        }
        const instSlug = institutionSlug.toLowerCase();
        const inst = await Institution.findOne({ slug: instSlug }).lean();
        if (!inst) {
            return res.status(404).json({ error: 'Institution not found' });
        }

        let courseSlugNormalized = null;
        if (normalizedType === 'course') {
            courseSlugNormalized = (courseSlug || '').toLowerCase();
            if (!courseSlugNormalized) {
                return res.status(400).json({ error: 'courseSlug is required for course keys' });
            }
            const courseExists = inst.courses && inst.courses.some(c => (c.slug || '').toLowerCase() === courseSlugNormalized);
            if (!courseExists) {
                return res.status(404).json({ error: 'Course not found on institution' });
            }
        }

        const passwordHash = await hashPassword(password);
        const key = await AccessKey.create({
            type: normalizedType,
            institutionSlug: instSlug,
            courseSlug: courseSlugNormalized,
            passwordHash,
            label: label || '',
            createdBy: req.session && req.session.username ? req.session.username : 'system'
        });
        res.json({ success: true, id: key._id });
    } catch (err) {
        console.error('Error creating access key:', err);
        res.status(500).json({ error: 'Failed to create access key' });
    }
};

const listAccessKeys = async (_req, res) => {
    const keys = await AccessKey.find({}, { passwordHash: 0 }).lean();
    res.json(keys);
};

const setAccessKeyActive = async (req, res) => {
    try {
        const { id } = req.params;
        const { active } = req.body || {};
        const key = await AccessKey.findByIdAndUpdate(id, { active: Boolean(active) }, { new: true });
        if (!key) {
            return res.status(404).json({ error: 'Access key not found' });
        }
        res.json({ success: true, active: key.active });
    } catch (err) {
        console.error('Error updating access key:', err);
        res.status(500).json({ error: 'Failed to update access key' });
    }
};


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

module.exports = {
    adminAuth,
    checkAdminAuth,
    authenticateAdmin,
    getInstitutions,
    createInstitution,
    updateInstitution,
    deleteInstitution,
    createAdminUser,
    listAdminUsers,
    resetAdminPassword,
    createAccessKey,
    listAccessKeys,
    setAccessKeyActive,
    updateAccessKeyPassword
};

