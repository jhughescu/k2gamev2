const Institution = require('../models/institution');
const User = require('../models/user');
const AccessKey = require('../models/accessKey');
const Session = require('../models/session');
const SessionArchive = require('../models/sessionArchive');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { hashPassword, verifyPassword, isEnvSuperuserLogin, getEnvSuperuserUsername } = require('./authController');
const sessionController = require('./sessionController');
const crypto = require('crypto');

const DEFAULT_SESSION_RETENTION_DAYS = 90;

const getSessionRetentionDays = () => {
    const raw = Number(process.env.SESSION_RETENTION_DAYS);
    if (Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    return DEFAULT_SESSION_RETENTION_DAYS;
};

const parseCompactDateNumber = (value) => {
    const digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (digits.length < 8) return null;

    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const hour = Number(digits.slice(8, 10) || '0');
    const minute = Number(digits.slice(10, 12) || '0');
    const second = Number(digits.slice(12, 14) || '0');

    if (!Number.isInteger(year) || year < 1970 || year > 9999) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    if (!Number.isInteger(second) || second < 0 || second > 59) return null;

    const dt = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
};

const deriveLastAccessedAt = (normalizedSession) => {
    const fromAccessed = parseCompactDateNumber(normalizedSession.dateAccessed);
    if (fromAccessed) return fromAccessed;
    const fromId = parseCompactDateNumber(normalizedSession.dateID);
    if (fromId) return fromId;
    return new Date();
};

const createLaunchToken = () => crypto.randomBytes(16).toString('hex');
const restoreJobs = new Map();

const getUniqueLaunchToken = async () => {
    for (let i = 0; i < 6; i++) {
        const token = createLaunchToken();
        const exists = await Institution.exists({ 'courses.launchToken': token });
        if (!exists) {
            return token;
        }
    }
    throw new Error('Failed to generate unique launch token');
};

const withCourseLaunchTokens = async (courses = [], existingTokenBySlug = new Map()) => {
    const normalized = [];
    for (const course of courses) {
        const slug = (course.slug || '').toLowerCase();
        const incoming = (course.launchToken || '').toString().trim().toLowerCase();
        const preserved = existingTokenBySlug.get(slug);
        const launchToken = incoming || preserved || await getUniqueLaunchToken();
        normalized.push({
            ...course,
            launchToken
        });
    }
    return normalized;
};

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
        const normalizedUsername = username.toLowerCase().trim();

        // Check environment variable superuser credentials first
        if (isEnvSuperuserLogin(normalizedUsername, password)) {
            req.session.adminAuth = true;
            req.session.isAuthenticated = true;
            req.session.role = 'superuser';
            req.session.username = getEnvSuperuserUsername();
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
        const user = await User.findOne({ username: normalizedUsername, active: true });
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
        const institutionDocs = await Institution.find();
        for (const instDoc of institutionDocs) {
            let changed = false;
            const courses = Array.isArray(instDoc.courses) ? instDoc.courses : [];
            for (const course of courses) {
                if (!course.launchToken) {
                    course.launchToken = await getUniqueLaunchToken();
                    changed = true;
                }
            }
            if (changed) {
                await instDoc.save();
            }
        }
        const institutions = institutionDocs.map((doc) => doc.toObject());
        const counts = await Session.aggregate([
            {
                $match: {
                    institution: { $type: 'string', $ne: '' },
                    course: { $type: 'string', $ne: '' }
                }
            },
            {
                $group: {
                    _id: {
                        institution: { $toLower: '$institution' },
                        course: { $toLower: '$course' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const countMap = new Map();
        counts.forEach((entry) => {
            const inst = (entry?._id?.institution || '').toLowerCase();
            const course = (entry?._id?.course || '').toLowerCase();
            const key = `${inst}::${course}`;
            countMap.set(key, entry.count || 0);
        });

        const withCounts = institutions.map((inst) => {
            const instSlug = (inst.slug || '').toLowerCase();
            const courses = Array.isArray(inst.courses) ? inst.courses : [];
            return {
                ...inst,
                courses: courses.map((course) => {
                    const courseSlug = (course.slug || '').toLowerCase();
                    const key = `${instSlug}::${courseSlug}`;
                    return {
                        ...course,
                        sessionsCount: countMap.get(key) || 0
                    };
                })
            };
        });

        res.json(withCounts);
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
        const coursesWithTokens = await withCourseLaunchTokens(courseCheck.normalized);
        const inst = new Institution({
            slug: slug.trim().toLowerCase(),
            title: title.trim(),
            courses: coursesWithTokens
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
        const existingInst = await Institution.findById(id).lean();
        if (!existingInst) {
            return res.status(404).json({ error: 'Institution not found' });
        }
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
            const existingTokenBySlug = new Map(
                (existingInst.courses || []).map((c) => [
                    (c.slug || '').toLowerCase(),
                    (c.launchToken || '').toString().toLowerCase()
                ])
            );
            update.courses = await withCourseLaunchTokens(courseCheck.normalized, existingTokenBySlug);
        }
        const inst = await Institution.findByIdAndUpdate(
            id,
            update,
            { new: true, runValidators: true }
        );
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

const setAdminPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body || {};
        if (typeof password !== 'string') {
            return res.status(400).json({ error: 'password is required' });
        }
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.passwordHash = await hashPassword(password);
        await user.save();

        res.json({
            success: true,
            username: user.username,
            message: 'Password updated successfully'
        });
    } catch (err) {
        console.error('Error setting admin password:', err);
        res.status(500).json({ error: 'Failed to set password' });
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
        const { type, institutionSlug, courseSlug, password, label, firstName, surname, endDate, sessionLimit } = req.body || {};
        if (!type || !institutionSlug || !password || !firstName || !surname) {
            return res.status(400).json({ error: 'type, institutionSlug, password, firstName, and surname are required' });
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

        const normalizedFirstName = String(firstName).trim();
        const normalizedSurname = String(surname).trim();
        if (!normalizedFirstName || !normalizedSurname) {
            return res.status(400).json({ error: 'firstName and surname are required' });
        }

        let normalizedEndDate = null;
        if (endDate) {
            const rawEndDate = String(endDate).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawEndDate)) {
                normalizedEndDate = new Date(`${rawEndDate}T23:59:59.999Z`);
            } else {
                normalizedEndDate = new Date(rawEndDate);
            }
            if (Number.isNaN(normalizedEndDate.getTime())) {
                return res.status(400).json({ error: 'Invalid endDate value' });
            }
        }

        let normalizedSessionLimit = null;
        if (sessionLimit !== undefined && sessionLimit !== null && String(sessionLimit).trim() !== '') {
            const parsedLimit = Number(sessionLimit);
            if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
                return res.status(400).json({ error: 'sessionLimit must be a positive integer' });
            }
            normalizedSessionLimit = parsedLimit;
        }

        const passwordHash = await hashPassword(password);
        const key = await AccessKey.create({
            type: normalizedType,
            institutionSlug: instSlug,
            courseSlug: courseSlugNormalized,
            passwordHash,
            label: label || '',
            firstName: normalizedFirstName,
            surname: normalizedSurname,
            endDate: normalizedEndDate,
            sessionLimit: normalizedSessionLimit,
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

const listAllSessions = async (_req, res) => {
    try {
        const sessions = await Session.find({}).sort({ dateAccessed: -1, dateID: -1 }).lean();
        res.json(sessions);
    } catch (err) {
        console.error('Error listing sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const createGeneratedSessions = async (req, res) => {
    try {
        const { sessions, createAccessKeySessions, selectedAccessKeyId } = req.body || {};
        if (!Array.isArray(sessions) || sessions.length === 0) {
            return res.status(400).json({ error: 'sessions array is required' });
        }

        const normalizedSessions = sessions.map((session, index) => {
            const normalized = {
                uniqueID: String(session && session.uniqueID || '').trim(),
                name: String(session && session.name || '').trim(),
                dateID: Number(session && session.dateID),
                dateAccessed: Number(session && session.dateAccessed),
                playTime: Number(session && session.playTime || 0),
                type: Number(session && session.type),
                teamRef: Number(session && session.teamRef),
                state: String(session && session.state || '').trim(),
                time: Number(session && session.time || 0),
                supportTeamRef: Number(session && session.supportTeamRef),
                events: Array.isArray(session && session.events) ? session.events : [],
                profile0: isPlainObject(session && session.profile0) ? session.profile0 : { blank: true },
                profile1: isPlainObject(session && session.profile1) ? session.profile1 : { blank: true },
                profile2: isPlainObject(session && session.profile2) ? session.profile2 : { blank: true },
                quiz: Array.isArray(session && session.quiz) ? session.quiz : [],
                institution: String(session && session.institution || '').trim().toLowerCase(),
                course: String(session && session.course || '').trim().toLowerCase()
            };

            if (!normalized.uniqueID || !normalized.name || !normalized.institution || !normalized.course || !normalized.state) {
                throw new Error(`Session ${index + 1} is missing one or more required fields`);
            }

            const lastAccessedAt = deriveLastAccessedAt(normalized);
            const retentionDays = getSessionRetentionDays();
            normalized.lastAccessedAt = lastAccessedAt;
            normalized.expiresAt = new Date(lastAccessedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);

            return normalized;
        });

        const requestUniqueIds = new Set();
        const requestNames = new Set();
        for (const session of normalizedSessions) {
            if (requestUniqueIds.has(session.uniqueID)) {
                return res.status(400).json({ error: `Duplicate uniqueID in request: ${session.uniqueID}` });
            }
            if (requestNames.has(session.name)) {
                return res.status(400).json({ error: `Duplicate name in request: ${session.name}` });
            }
            requestUniqueIds.add(session.uniqueID);
            requestNames.add(session.name);
        }

        const uniqueInstitutionCoursePairs = Array.from(new Set(normalizedSessions.map((session) => `${session.institution}::${session.course}`)));
        for (const pair of uniqueInstitutionCoursePairs) {
            const [institutionSlug, courseSlug] = pair.split('::');
            const institution = await Institution.findOne({ slug: institutionSlug }).lean();
            const hasCourse = Boolean(
                institution &&
                Array.isArray(institution.courses) &&
                institution.courses.some((course) => String(course.slug || '').toLowerCase() === courseSlug)
            );
            if (!hasCourse) {
                return res.status(400).json({ error: `Invalid institution/course combination: ${institutionSlug}/${courseSlug}` });
            }
        }

        const normalizedSelectedAccessKeyId = String(selectedAccessKeyId || '').trim();
        if (Boolean(createAccessKeySessions) && normalizedSelectedAccessKeyId) {
            return res.status(400).json({ error: 'Cannot create a new Access Key and link an existing Access Key in the same request' });
        }

        let createdAccessKeyId = null;
        let createdAccessKeyInfo = null;
        if (Boolean(createAccessKeySessions)) {
            const first = normalizedSessions[0];
            const sameScope = normalizedSessions.every(
                (session) => session.institution === first.institution && session.course === first.course
            );
            if (!sameScope) {
                return res.status(400).json({ error: 'All generated sessions must share the same institution/course to create Access Key sessions' });
            }

            const generatedPassword = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const passwordHash = await hashPassword(generatedPassword);
            const generatedLabel = `generated_sessions_${Date.now()}`;
            const key = await AccessKey.create({
                type: 'course',
                institutionSlug: first.institution,
                courseSlug: first.course,
                passwordHash,
                label: generatedLabel,
                firstName: 'Session',
                surname: 'Generator',
                createdBy: req.session && req.session.username ? req.session.username : 'system'
            });
            createdAccessKeyId = String(key._id);
            createdAccessKeyInfo = {
                id: createdAccessKeyId,
                type: key.type,
                institutionSlug: key.institutionSlug,
                courseSlug: key.courseSlug || '',
                label: key.label || '',
                password: generatedPassword
            };
            normalizedSessions.forEach((session) => {
                session.accessKeyId = createdAccessKeyId;
            });
        } else if (normalizedSelectedAccessKeyId) {
            const first = normalizedSessions[0];
            const sameScope = normalizedSessions.every(
                (session) => session.institution === first.institution && session.course === first.course
            );
            if (!sameScope) {
                return res.status(400).json({ error: 'All generated sessions must share the same institution/course to link an Access Key' });
            }

            const selectedKey = await AccessKey.findById(normalizedSelectedAccessKeyId).lean();
            if (!selectedKey) {
                return res.status(400).json({ error: 'Selected Access Key does not exist' });
            }

            if (selectedKey.active === false) {
                return res.status(400).json({ error: 'Selected Access Key is inactive' });
            }

            const keyType = String(selectedKey.type || '').toLowerCase();
            const keyInstitution = String(selectedKey.institutionSlug || '').toLowerCase();
            const keyCourse = String(selectedKey.courseSlug || '').toLowerCase();
            const scopeMatches = keyType === 'institution'
                ? keyInstitution === first.institution
                : (keyType === 'course' && keyInstitution === first.institution && keyCourse === first.course);

            if (!scopeMatches) {
                return res.status(400).json({ error: `Selected Access Key scope does not match generated sessions scope: ${first.institution}/${first.course}` });
            }

            normalizedSessions.forEach((session) => {
                session.accessKeyId = normalizedSelectedAccessKeyId;
            });
        }

        const existingSessions = await Session.find(
            {
                $or: [
                    { uniqueID: { $in: Array.from(requestUniqueIds) } },
                    { name: { $in: Array.from(requestNames) } }
                ]
            },
            { uniqueID: 1, name: 1 }
        ).lean();

        if (existingSessions.length > 0) {
            const existingUniqueIds = new Set(existingSessions.map((session) => String(session.uniqueID || '')));
            const existingNames = new Set(existingSessions.map((session) => String(session.name || '')));
            const conflictingUniqueId = normalizedSessions.find((session) => existingUniqueIds.has(session.uniqueID));
            if (conflictingUniqueId) {
                return res.status(400).json({ error: `Session uniqueID already exists: ${conflictingUniqueId.uniqueID}` });
            }
            const conflictingName = normalizedSessions.find((session) => existingNames.has(session.name));
            if (conflictingName) {
                return res.status(400).json({ error: `Session name already exists: ${conflictingName.name}` });
            }
        }

        const createdSessions = await Session.insertMany(normalizedSessions, { ordered: true });
        const linkedAccessKeyId = createdAccessKeyId || (normalizedSelectedAccessKeyId || null);
        return res.json({
            success: true,
            createdCount: createdSessions.length,
            accessKeyId: linkedAccessKeyId,
            accessKey: createdAccessKeyInfo
        });
    } catch (err) {
        console.error('Error creating generated sessions:', err);
        const message = err && err.message ? err.message : 'Failed to create sessions';
        const isValidationError =
            message.includes('missing one or more required fields') ||
            message.includes('Invalid institution/course combination') ||
            message.includes('must share the same institution/course') ||
            message.includes('already exists') ||
            message.includes('Duplicate ');
        return res.status(isValidationError ? 400 : 500).json({ error: message });
    }
};

const deleteSessionsByIds = async (req, res) => {
    try {
        const { sessionIds } = req.body || {};
        if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({ error: 'sessionIds array is required' });
        }

        const ids = sessionIds
            .map((id) => String(id || '').trim())
            .filter(Boolean);

        if (ids.length === 0) {
            return res.status(400).json({ error: 'No valid session IDs provided' });
        }

        const protectedSessions = await Session.find(
            {
                _id: { $in: ids },
                accessKeyId: { $exists: true, $nin: [null, ''] }
            },
            { _id: 1 }
        ).lean();

        if (protectedSessions.length > 0) {
            return res.status(400).json({
                error: 'Selected sessions cannot be deleted as one or more belong to an Access Key. These can only be deleted via the Access Keys panel.'
            });
        }

        const result = await Session.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, deletedCount: result.deletedCount || 0 });
    } catch (err) {
        console.error('Error deleting sessions by IDs:', err);
        res.status(500).json({ error: 'Failed to delete sessions' });
    }
};

const buildExportScope = (metadata, count) => {
    const scope = {
        exportSelection: (metadata && metadata.type) || 'selected-sessions',
        selectedCount: count
    };
    
    if (metadata) {
        if (metadata.institution) {
            scope.institution = metadata.institution;
        }
        if (metadata.course) {
            scope.course = metadata.course;
        }
        if (metadata.description) {
            scope.description = metadata.description;
        }
        if (metadata.accessKey) {
            scope.accessKey = metadata.accessKey;
        }
    }
    
    return scope;
};

const exportSelectedSessions = async (req, res) => {
    try {
        const { sessionIds, exportMetadata } = req.body || {};
        if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({ error: 'sessionIds array is required' });
        }

        const ids = sessionIds
            .map((id) => String(id || '').trim())
            .filter(Boolean);

        if (ids.length === 0) {
            return res.status(400).json({ error: 'No valid session IDs provided' });
        }

        const sessions = await Session.find({ _id: { $in: ids } }).lean();
        if (!sessions.length) {
            return res.status(404).json({ error: 'No matching sessions found for export' });
        }

        const exportedSessions = sessions.map((s) => {
            const clone = { ...s };
            const sourceMongoId = clone._id ? String(clone._id) : undefined;
            delete clone._id;
            delete clone.__v;
            return {
                ...clone,
                sourceMongoId
            };
        });

        const payload = {
            exportType: 'k2-session-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            scope: buildExportScope(exportMetadata, exportedSessions.length),
            sessions: exportedSessions
        };

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `k2_sessions_${stamp}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Error exporting selected sessions:', err);
        return res.status(500).json({ error: 'Failed to export selected sessions' });
    }
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

const deleteAccessKey = async (req, res) => {
    try {
        const { id } = req.params;
        const key = await AccessKey.findById(id).lean();
        if (!key) {
            return res.status(404).json({ error: 'Access key not found' });
        }

        const keyId = String(key._id);
        const deletedSessions = await Session.deleteMany({ accessKeyId: keyId });
        await AccessKey.deleteOne({ _id: key._id });

        res.json({
            success: true,
            deletedAccessKeyId: keyId,
            deletedSessions: deletedSessions.deletedCount || 0
        });
    } catch (err) {
        console.error('Error deleting access key:', err);
        res.status(500).json({ error: 'Failed to delete access key' });
    }
};

const exportAccessKeySessions = async (req, res) => {
    try {
        const { id } = req.params;
        const key = await AccessKey.findById(id).lean();
        if (!key) {
            return res.status(404).json({ error: 'Access key not found' });
        }

        const keyId = String(key._id);
        const sessions = await Session.find({ accessKeyId: keyId }).lean();
        const exportedSessions = sessions.map((s) => {
            const clone = { ...s };
            const sourceMongoId = clone._id ? String(clone._id) : undefined;
            delete clone._id;
            delete clone.__v;
            return {
                ...clone,
                sourceMongoId
            };
        });

        const payload = {
            exportType: 'k2-session-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            accessKey: {
                _id: keyId,
                type: key.type || null,
                institutionSlug: key.institutionSlug || null,
                courseSlug: key.courseSlug || null,
                passwordHash: key.passwordHash || null,
                label: key.label || '',
                firstName: key.firstName || '',
                surname: key.surname || '',
                endDate: key.endDate || null,
                sessionLimit: Number.isInteger(key.sessionLimit) ? key.sessionLimit : null,
                active: typeof key.active === 'boolean' ? key.active : true,
                createdBy: key.createdBy || null,
                lastUsedAt: key.lastUsedAt || null,
                createdAt: key.createdAt || null,
                updatedAt: key.updatedAt || null
            },
            scope: {
                accessKeyId: keyId,
                type: key.type || null,
                institutionSlug: key.institutionSlug || null,
                courseSlug: key.courseSlug || null,
                facilitator: {
                    firstName: key.firstName || null,
                    surname: key.surname || null,
                    label: key.label || null
                }
            },
            sessions: exportedSessions
        };

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const inst = String(key.institutionSlug || 'inst').toLowerCase();
        const course = String(key.courseSlug || 'all').toLowerCase();
        const holder = `${String(key.firstName || '').toLowerCase()}_${String(key.surname || '').toLowerCase()}`
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'holder';
        const fileName = `k2_sessions_${inst}_${course}_${holder}_${stamp}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (err) {
        console.error('Error exporting access key sessions:', err);
        return res.status(500).json({ error: 'Failed to export sessions' });
    }
};

const createRestoreEvent = (message, level = 'info') => ({
    time: new Date().toISOString(),
    level,
    message
});

const createRestoreJob = (fileName) => {
    const id = crypto.randomUUID();
    const job = {
        id,
        fileName: fileName || 'restore-package.json',
        status: 'queued',
        createdAt: new Date().toISOString(),
        completedAt: null,
        totalSessions: 0,
        processedSessions: 0,
        restoredSessions: 0,
        failedSessions: 0,
        events: []
    };
    restoreJobs.set(id, job);
    return job;
};

const pushRestoreEvent = (job, message, level = 'info') => {
    job.events.push(createRestoreEvent(message, level));
};

const getRestoreSessionLabel = (sessionData, index) => {
    if (sessionData && sessionData.dateID) return String(sessionData.dateID);
    if (sessionData && sessionData.uniqueID) return String(sessionData.uniqueID);
    if (sessionData && sessionData.name) return String(sessionData.name);
    return `#${index + 1}`;
};

const validateRestorePackageShape = (packageData) => {
    if (!packageData || typeof packageData !== 'object') {
        return 'Restore package must be a JSON object';
    }
    if (packageData.exportType !== 'k2-session-export') {
        return 'Unsupported restore package type';
    }
    if (!Array.isArray(packageData.sessions)) {
        return 'Restore package must contain a sessions array';
    }
    if (packageData.accessKey !== undefined && (packageData.accessKey === null || typeof packageData.accessKey !== 'object')) {
        return 'Restore package accessKey must be an object when provided';
    }
    return null;
};

const validateAccessKeyScope = async (type, institutionSlug, courseSlug) => {
    if (!['institution', 'course'].includes(type)) {
        return 'Access key type must be institution or course';
    }
    if (!institutionSlug) {
        return 'Access key institutionSlug is required';
    }

    const institution = await Institution.findOne({ slug: institutionSlug }).lean();
    if (!institution) {
        return `Access key institution ${institutionSlug} does not exist`;
    }

    if (type === 'course') {
        if (!courseSlug) {
            return 'Access key courseSlug is required for course type';
        }
        const courseExists = Array.isArray(institution.courses)
            && institution.courses.some((course) => (course.slug || '').toLowerCase() === courseSlug);
        if (!courseExists) {
            return `Access key course ${institutionSlug}/${courseSlug} does not exist`;
        }
    }

    return null;
};

const restoreAccessKeyFromPackage = async (job, packageData) => {
    const pkgAccessKey = packageData.accessKey && typeof packageData.accessKey === 'object'
        ? packageData.accessKey
        : null;
    const scopeAccessKeyId = String((packageData.scope && packageData.scope.accessKeyId) || '').trim();

    if (!pkgAccessKey) {
        return {
            sourceAccessKeyId: scopeAccessKeyId || null,
            restoredAccessKeyId: null,
            accessKeyRestoreFailed: false
        };
    }

    pushRestoreEvent(job, 'access key restore started', 'info');

    const sourceAccessKeyId = String(pkgAccessKey._id || scopeAccessKeyId || '').trim();
    const normalizedType = String(pkgAccessKey.type || '').toLowerCase().trim();
    const institutionSlug = String(pkgAccessKey.institutionSlug || '').toLowerCase().trim();
    const courseSlug = normalizedType === 'course'
        ? String(pkgAccessKey.courseSlug || '').toLowerCase().trim()
        : undefined;
    const passwordHash = String(pkgAccessKey.passwordHash || '').trim();

    if (!passwordHash) {
        pushRestoreEvent(job, 'access key restore failed - passwordHash is required in restore package', 'error');
        return {
            sourceAccessKeyId: sourceAccessKeyId || null,
            restoredAccessKeyId: null,
            accessKeyRestoreFailed: true
        };
    }

    const scopeError = await validateAccessKeyScope(normalizedType, institutionSlug, courseSlug);
    if (scopeError) {
        pushRestoreEvent(job, `access key restore failed - ${scopeError}`, 'error');
        return {
            sourceAccessKeyId: sourceAccessKeyId || null,
            restoredAccessKeyId: null,
            accessKeyRestoreFailed: true
        };
    }

    try {
        let existingKey = null;
        if (sourceAccessKeyId && mongoose.Types.ObjectId.isValid(sourceAccessKeyId)) {
            existingKey = await AccessKey.findById(sourceAccessKeyId).lean();
        }

        if (existingKey) {
            pushRestoreEvent(job, 'access key restore skipped - access key already exists in database', 'info');
            return {
                sourceAccessKeyId: sourceAccessKeyId || String(existingKey._id),
                restoredAccessKeyId: String(existingKey._id),
                accessKeyRestoreFailed: false
            };
        }

        const keyDoc = {
            type: normalizedType,
            institutionSlug,
            courseSlug,
            passwordHash,
            label: String(pkgAccessKey.label || ''),
            firstName: String(pkgAccessKey.firstName || ''),
            surname: String(pkgAccessKey.surname || ''),
            endDate: pkgAccessKey.endDate || null,
            sessionLimit: Number.isInteger(pkgAccessKey.sessionLimit) ? pkgAccessKey.sessionLimit : null,
            active: typeof pkgAccessKey.active === 'boolean' ? pkgAccessKey.active : true,
            createdBy: pkgAccessKey.createdBy || 'restore',
            lastUsedAt: pkgAccessKey.lastUsedAt || null
        };

        if (sourceAccessKeyId && mongoose.Types.ObjectId.isValid(sourceAccessKeyId)) {
            keyDoc._id = sourceAccessKeyId;
        }

        const createdKey = await AccessKey.create(keyDoc);
        pushRestoreEvent(job, 'access key restore complete', 'success');
        return {
            sourceAccessKeyId: sourceAccessKeyId || String(createdKey._id),
            restoredAccessKeyId: String(createdKey._id),
            accessKeyRestoreFailed: false
        };
    } catch (err) {
        const errorMessage = err && err.message ? err.message : 'unknown error';
        pushRestoreEvent(job, `access key restore failed - ${errorMessage}`, 'error');
        return {
            sourceAccessKeyId: sourceAccessKeyId || null,
            restoredAccessKeyId: null,
            accessKeyRestoreFailed: true
        };
    }
};

const validateRestoreSessionScope = async (sessionData) => {
    const institutionSlug = String(sessionData.institution || '').toLowerCase().trim();
    const courseSlug = String(sessionData.course || '').toLowerCase().trim();

    if (!institutionSlug || !courseSlug) {
        return 'Session is missing institution or course';
    }

    const institution = await Institution.findOne({ slug: institutionSlug }).lean();
    if (!institution) {
        return `Institution ${institutionSlug} does not exist`;
    }

    const courseExists = Array.isArray(institution.courses)
        && institution.courses.some((course) => (course.slug || '').toLowerCase() === courseSlug);
    if (!courseExists) {
        return `Course ${institutionSlug}/${courseSlug} does not exist`;
    }

    return null;
};

const processRestoreJob = async (jobId, packageData) => {
    const job = restoreJobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    pushRestoreEvent(job, `restore package received: ${job.fileName}`, 'info');

    const shapeError = validateRestorePackageShape(packageData);
    if (shapeError) {
        pushRestoreEvent(job, shapeError, 'error');
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
        return;
    }

    job.totalSessions = packageData.sessions.length;
    pushRestoreEvent(job, 'file format confirmed', 'success');
    pushRestoreEvent(job, 'uniqueness checks enabled: uniqueID and name must be unique across all stored records', 'info');
    const {
        sourceAccessKeyId,
        restoredAccessKeyId,
        accessKeyRestoreFailed
    } = await restoreAccessKeyFromPackage(job, packageData);
    const seenPackageUniqueIds = new Set();
    const seenPackageNames = new Set();

    for (let index = 0; index < packageData.sessions.length; index += 1) {
        const sourceSession = packageData.sessions[index] || {};
        const label = getRestoreSessionLabel(sourceSession, index);
        pushRestoreEvent(job, `session ${label} restore started`, 'info');

        try {
            const normalizedUniqueID = String(sourceSession.uniqueID || '').trim();
            const normalizedName = String(sourceSession.name || '').trim();

            if (!normalizedUniqueID || !normalizedName) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - uniqueID and name are required`, 'error');
                continue;
            }

            const sessionAccessKeyId = String(sourceSession.accessKeyId || '').trim();
            if (accessKeyRestoreFailed && sourceAccessKeyId && sessionAccessKeyId === sourceAccessKeyId) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - referenced access key could not be restored`, 'error');
                continue;
            }

            if (seenPackageUniqueIds.has(normalizedUniqueID)) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - duplicate uniqueID in restore package`, 'error');
                continue;
            }

            if (seenPackageNames.has(normalizedName)) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - duplicate name in restore package`, 'error');
                continue;
            }

            seenPackageUniqueIds.add(normalizedUniqueID);
            seenPackageNames.add(normalizedName);

            const scopeError = await validateRestoreSessionScope(sourceSession);
            if (scopeError) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - ${scopeError}`, 'error');
                continue;
            }

            const existingByUniqueID = await Session.exists({ uniqueID: normalizedUniqueID });
            if (existingByUniqueID) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - uniqueID already exists in database`, 'error');
                continue;
            }

            const existingByName = await Session.exists({ name: normalizedName });
            if (existingByName) {
                job.failedSessions += 1;
                pushRestoreEvent(job, `session ${label} restore failed - name already exists in database`, 'error');
                continue;
            }

            const clone = { ...sourceSession };
            delete clone._id;
            delete clone.__v;
            delete clone.sourceMongoId;
            clone.uniqueID = normalizedUniqueID;
            clone.name = normalizedName;
            if (sourceAccessKeyId && restoredAccessKeyId && sessionAccessKeyId === sourceAccessKeyId) {
                clone.accessKeyId = restoredAccessKeyId;
            }

            await Session.create(clone);
            job.restoredSessions += 1;
            pushRestoreEvent(job, `session ${label} restore complete`, 'success');
        } catch (err) {
            job.failedSessions += 1;
            let errorMessage = err && err.message ? err.message : 'unknown error';
            if (err && err.code === 11000) {
                const duplicateField = err.keyPattern && err.keyPattern.uniqueID
                    ? 'uniqueID'
                    : (err.keyPattern && err.keyPattern.name ? 'name' : 'unique field');
                errorMessage = `${duplicateField} already exists in database`;
            }
            pushRestoreEvent(job, `session ${label} restore failed - ${errorMessage}`, 'error');
        } finally {
            job.processedSessions += 1;
        }
    }

    job.status = job.failedSessions > 0 ? 'completed-with-errors' : 'completed';
    job.completedAt = new Date().toISOString();
    pushRestoreEvent(
        job,
        `restore finished - ${job.restoredSessions} restored, ${job.failedSessions} failed`,
        job.failedSessions > 0 ? 'info' : 'success'
    );
};

const uploadRestorePackage = async (req, res) => {
    try {
        const { fileName, packageData } = req.body || {};
        if (!packageData || typeof packageData !== 'object') {
            return res.status(400).json({ error: 'packageData JSON object is required' });
        }

        const job = createRestoreJob(fileName);
        processRestoreJob(job.id, packageData).catch((err) => {
            const currentJob = restoreJobs.get(job.id);
            if (!currentJob) return;
            currentJob.status = 'failed';
            currentJob.completedAt = new Date().toISOString();
            pushRestoreEvent(currentJob, `restore job failed - ${err && err.message ? err.message : 'unknown error'}`, 'error');
        });

        return res.json({
            success: true,
            jobId: job.id
        });
    } catch (err) {
        console.error('Error starting restore upload:', err);
        return res.status(500).json({ error: 'Failed to start restore upload' });
    }
};

const getRestoreJobStatus = async (req, res) => {
    const { id } = req.params;
    const job = restoreJobs.get(id);
    if (!job) {
        return res.status(404).json({ error: 'Restore job not found' });
    }
    return res.json(job);
};

const getHighestSessionNameNumber = async (req, res) => {
    try {
        const highestNumber = await sessionController.getHighestSessionNumber();
        return res.json({
            success: true,
            highestNumber: highestNumber,
            nextNumber: highestNumber + 1
        });
    } catch (err) {
        console.error('Error getting highest session number:', err);
        return res.status(500).json({ error: 'Failed to get highest session number' });
    }
};

const getSessionStateStats = async (req, res) => {
    try {
        const stats = await sessionController.getSessionStateStats();
        return res.json({
            success: true,
            data: stats
        });
    } catch (err) {
        console.error('Error getting state stats:', err);
        return res.status(500).json({ error: 'Failed to get state stats' });
    }
};

const getRetentionRuns = async (req, res) => {
    try {
        const rawLimit = Number(req.query && req.query.limit);
        const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
        const logPath = path.join(process.cwd(), 'logs', 'reports', 'session-retention-runs.jsonl');

        if (!fs.existsSync(logPath)) {
            return res.json({
                success: true,
                runs: [],
                totalReturned: 0,
                logPath,
                message: 'No retention run log found yet.'
            });
        }

        const raw = await fs.promises.readFile(logPath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        const parsed = [];
        for (const line of lines) {
            try {
                parsed.push(JSON.parse(line));
            } catch (_err) {
                // Ignore malformed lines to keep endpoint resilient.
            }
        }

        const runs = parsed.slice(-limit).reverse();
        return res.json({
            success: true,
            runs,
            totalReturned: runs.length,
            totalParsed: parsed.length,
            logPath
        });
    } catch (err) {
        console.error('Error reading retention runs:', err);
        return res.status(500).json({ error: 'Failed to read retention runs' });
    }
};

const getRetentionArchives = async (req, res) => {
    try {
        const rawLimit = Number(req.query && req.query.limit);
        const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
        const now = Date.now();

        const archives = await SessionArchive.find(
            {},
            {
                sourceSessionId: 1,
                sourceUniqueID: 1,
                sourceName: 1,
                archivedAt: 1,
                archiveExpiresAt: 1,
                retentionPolicy: 1,
                deletedFromLiveAt: 1,
                archiveBatchId: 1
            }
        )
            .sort({ archivedAt: -1 })
            .limit(limit)
            .lean();

        const rows = archives.map((doc) => {
            const expiresAtMs = doc.archiveExpiresAt ? new Date(doc.archiveExpiresAt).getTime() : null;
            const msUntilDeletion = Number.isFinite(expiresAtMs) ? (expiresAtMs - now) : null;
            const daysUntilDeletion = Number.isFinite(msUntilDeletion)
                ? Math.ceil(msUntilDeletion / (24 * 60 * 60 * 1000))
                : null;

            return {
                _id: String(doc._id),
                sourceSessionId: doc.sourceSessionId || null,
                sourceUniqueID: doc.sourceUniqueID || null,
                sourceName: doc.sourceName || null,
                archiveBatchId: doc.archiveBatchId || null,
                archivedAt: doc.archivedAt || null,
                archiveExpiresAt: doc.archiveExpiresAt || null,
                deletedFromLiveAt: doc.deletedFromLiveAt || null,
                retentionPolicy: doc.retentionPolicy || null,
                msUntilDeletion,
                daysUntilDeletion,
                isPendingDeletion: Number.isFinite(msUntilDeletion) ? msUntilDeletion <= 0 : false
            };
        });

        return res.json({
            success: true,
            archives: rows,
            totalReturned: rows.length
        });
    } catch (err) {
        console.error('Error reading archive retention rows:', err);
        return res.status(500).json({ error: 'Failed to read archive retention rows' });
    }
};

const getRetentionConfig = async (_req, res) => {
    const rawRetentionDays = Number(process.env.SESSION_RETENTION_DAYS);
    const retentionDays = Number.isInteger(rawRetentionDays) && rawRetentionDays > 0
        ? rawRetentionDays
        : 90;

    return res.json({
        success: true,
        retentionDays
    });
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
    setAdminPassword,
    createAccessKey,
    listAccessKeys,
    listAllSessions,
    createGeneratedSessions,
    deleteSessionsByIds,
    exportSelectedSessions,
    setAccessKeyActive,
    updateAccessKeyPassword,
    deleteAccessKey,
    exportAccessKeySessions,
    uploadRestorePackage,
    getRestoreJobStatus,
    getHighestSessionNameNumber,
    getSessionStateStats,
    getRetentionRuns,
    getRetentionArchives,
    getRetentionConfig
};

