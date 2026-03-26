const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const AccessKey = require('../models/accessKey');
const Institution = require('../models/institution');
const Session = require('../models/session');
const { doubleCsrfProtection } = require('./csrfConfig');
require('dotenv').config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

const normalizeRateLimitIp = (rawIp) => {
    const ip = (rawIp || '').toString().trim();
    if (!ip) {
        return 'unknown';
    }
    const firstHop = ip.split(',')[0].trim();
    if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(firstHop)) {
        return firstHop.replace(/:\d+$/, '');
    }
    return firstHop;
};

const authRateKeyGenerator = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const normalizedIp = normalizeRateLimitIp(forwarded || req.ip || (req.socket && req.socket.remoteAddress));
    return ipKeyGenerator(normalizedIp);
};

// Rate limiter for login attempts - 5 attempts per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.ISDEV === 'true' ? 100 : 5, // 5 attempts in prod, 100 in dev
    message: { error: 'Too Many Requests', message: 'Too many login attempts, please try again after 15 minutes' },
    keyGenerator: authRateKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful logins
});

// General rate limiter for all auth routes - 20 requests per minute
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.ISDEV === 'true' ? 1000 : 20, // Relaxed in dev
    message: { error: 'Too Many Requests', message: 'Too many requests, please slow down' },
    keyGenerator: authRateKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false
});

const hashPassword = async (plain) => bcrypt.hash(plain, 10);
const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);
const normalizeUsername = (value) => (value || '').toString().trim().toLowerCase();
const getEnvSuperuserUsername = () => normalizeUsername(process.env.ADMIN_USERNAME || 'env-superuser');
const isEnvSuperuserLogin = (username, password) => {
    const normalizedUsername = normalizeUsername(username);
    if (!ADMIN_PASSWORD || !normalizedUsername) {
        return false;
    }
    return normalizedUsername === getEnvSuperuserUsername() && password === ADMIN_PASSWORD;
};

const buildAccessFilter = (sessionObj = {}) => {
    if (sessionObj.isAuthenticated && (sessionObj.role === 'admin' || sessionObj.role === 'superuser')) {
        return {}; // full access
    }
    const access = sessionObj.access;
    if (!access) return null;
    if (access.type === 'institution') {
        return { institution: access.institutionSlug };
    }
    if (access.type === 'course') {
        return { institution: access.institutionSlug, course: access.courseSlug };
    }
    return null;
};

// Session middleware configuration with MongoDB store
const sessionMiddleware = session({
    secret: SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
        mongoUrl: MONGODB_URI,
        collectionName: 'authSessions', // Use separate collection for auth/cookie sessions
        touchAfter: 24 * 3600 // Lazy session update (in seconds)
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        // 7 days in development for convenience, 1 hour in production for security
        maxAge: process.env.ISDEV === 'true' ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000
    }
});

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    
    // Check if request wants JSON (AJAX/fetch requests)
    const wantsJson = req.accepts('json') && !req.accepts('html');
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    
    if (wantsJson || isAjax) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Authentication required',
            loginUrl: '/auth/login'
        });
    }
    
    // HTML requests get redirected to login
    const redirectUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirectUrl}`);
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    console.log('requireAdmin check:', {
        hasSession: !!req.session,
        adminAuth: req.session?.adminAuth,
        isAuthenticated: req.session?.isAuthenticated,
        role: req.session?.role,
        path: req.path,
        sessionID: req.sessionID
    });

    if (req.session && (
        req.session.adminAuth === true ||
        (req.session.isAuthenticated && (req.session.role === 'admin' || req.session.role === 'superuser'))
    )) {
        return next();
    }
    
    // Check if request wants JSON (AJAX/fetch requests)
    const wantsJson = req.accepts('json') && !req.accepts('html');
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    
    if (wantsJson || isAjax) {
        console.log('Blocking API request - not authenticated');
        return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Admin access required',
            loginUrl: '/auth/login'
        });
    }
    
    // HTML requests get redirected to login
    console.log('Redirecting HTML request to login');
    const redirectUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirectUrl}`);
};

const requireSuperuser = (req, res, next) => {
    if (req.session && req.session.isAuthenticated && req.session.role === 'superuser') {
        return next();
    }
    
    // Check if request wants JSON (AJAX/fetch requests)
    const wantsJson = req.accepts('json') && !req.accepts('html');
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    
    if (wantsJson || isAjax) {
        return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Superuser access required',
            loginUrl: '/auth/login'
        });
    }
    
    // HTML requests get redirected to login
    const redirectUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirectUrl}`);
};

const requireSessionAccess = (req, res, next) => {
    const filter = buildAccessFilter(req.session || {});
    if (filter === null) {
        // Check if request wants JSON (AJAX/fetch requests)
        const wantsJson = req.accepts('json') && !req.accepts('html');
        const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
        
        if (wantsJson || isAjax) {
            return res.status(401).json({ 
                error: 'Unauthorized', 
                message: 'Access login required',
                loginUrl: '/facilitator/login'
            });
        }
        
        // HTML requests get redirected to login
        const redirectUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`/facilitator/login?redirect=${redirectUrl}`);
    }
    req.accessFilter = filter;
    req.accessContext = req.session.access || null;
    next();
};

// Login handler
const login = async (req, res) => {
    const { username, password } = req.body || {};
    const normalizedUsername = normalizeUsername(username);

    if (!password) {
        return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'Password is required' 
        });
    }

    if (isEnvSuperuserLogin(normalizedUsername, password)) {
        req.session.isAuthenticated = true;
        req.session.role = 'superuser';
        req.session.username = getEnvSuperuserUsername();
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            res.json({
                success: true,
                message: 'Login successful',
                role: 'superuser',
                redirectUrl: '/admin'
            });
        });
        return;
    }

    // If username provided, authenticate against User collection
    if (normalizedUsername) {
        const user = await User.findOne({ username: normalizedUsername, active: true });
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
        }
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
        }
        req.session.isAuthenticated = true;
        req.session.role = user.role;
        req.session.userId = user._id.toString();
        req.session.username = user.username;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            res.json({ success: true, message: 'Login successful', role: user.role, redirectUrl: '/admin' });
        });
        return;
    }

    return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid credentials' 
    });
};

// Logout handler
const logout = (req, res) => {
    // Store session ID for logging
    const sessionId = req.sessionID;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
            return res.status(500).json({ 
                error: 'Server Error', 
                message: 'Logout failed' 
            });
        }
        
        // Clear the session cookie from the browser
        res.clearCookie('connect.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });
        
        console.log(`Session ${sessionId} destroyed and cookie cleared`);
        
        res.json({ 
            success: true, 
            message: 'Logout successful' 
        });
    });
};

const normalizeAccessName = (value) => (value || '').toString().trim().toLowerCase();

const getAccessLoginOptions = async (req, res) => {
    try {
        const sessionInstitutionValues = await Session.distinct('institution');
        const institutionSlugsWithSessions = new Set(
            (sessionInstitutionValues || [])
                .map((value) => (value || '').toString().trim().toLowerCase())
                .filter(Boolean)
        );

        const activeKeys = await AccessKey.find({
            active: true,
            firstName: { $exists: true, $ne: '' },
            surname: { $exists: true, $ne: '' }
        })
            .select('type institutionSlug courseSlug')
            .lean();

        const institutionDocs = await Institution.find()
            .select('slug title courses.slug courses.name')
            .lean();

        const institutionNameBySlug = new Map();
        const courseNameByInstitutionAndSlug = new Map();

        for (const inst of institutionDocs) {
            const instSlug = (inst.slug || '').toLowerCase();
            if (!instSlug) continue;
            institutionNameBySlug.set(instSlug, inst.title || instSlug);

            const courseNameBySlug = new Map();
            for (const course of (inst.courses || [])) {
                const courseSlug = (course.slug || '').toLowerCase();
                if (!courseSlug) continue;
                courseNameBySlug.set(courseSlug, course.name || courseSlug);
            }
            courseNameByInstitutionAndSlug.set(instSlug, courseNameBySlug);
        }

        const institutionTypeInstitutionSlugs = new Set(institutionSlugsWithSessions);
        const courseTypeInstitutionSlugs = new Set(institutionSlugsWithSessions);
        const courseSlugsByInstitution = new Map();

        for (const key of activeKeys) {
            const type = (key.type || '').toLowerCase();
            const instSlug = (key.institutionSlug || '').toLowerCase();
            if (!instSlug) continue;

            if (type === 'course') {
                const courseSlug = (key.courseSlug || '').toLowerCase();
                if (!courseSlug) continue;
                const existing = courseSlugsByInstitution.get(instSlug) || new Set();
                existing.add(courseSlug);
                courseSlugsByInstitution.set(instSlug, existing);
            }
        }

        const toInstitutionList = (slugSet) => {
            return Array.from(slugSet)
                .map((slug) => ({
                    slug,
                    name: institutionNameBySlug.get(slug) || slug
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        };

        const courseOptionsByInstitution = {};
        for (const [instSlug, courseSlugSet] of courseSlugsByInstitution.entries()) {
            const namesMap = courseNameByInstitutionAndSlug.get(instSlug) || new Map();
            const courseOptions = Array.from(courseSlugSet)
                .map((slug) => ({
                    slug,
                    name: namesMap.get(slug) || slug
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            courseOptionsByInstitution[instSlug] = courseOptions;
        }

        res.json({
            institutionTypeInstitutions: toInstitutionList(institutionTypeInstitutionSlugs),
            courseTypeInstitutions: toInstitutionList(courseTypeInstitutionSlugs),
            courseOptionsByInstitution
        });
    } catch (err) {
        console.error('Error loading access login options:', err);
        res.status(500).json({ error: 'Failed to load access login options' });
    }
};

const accessLogin = async (req, res) => {
    const { type, institutionSlug, courseSlug, password, firstName, surname } = req.body || {};
    if (!type || !institutionSlug || !password || !firstName || !surname) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'type, institutionSlug, firstName, surname, and password are required'
        });
    }

    const normalizedType = type.toLowerCase();
    if (!['institution', 'course'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid type' });
    }

    const inst = (institutionSlug || '').toLowerCase();
    const course = (courseSlug || '').toLowerCase();
    const normalizedFirstName = normalizeAccessName(firstName);
    const normalizedSurname = normalizeAccessName(surname);

    const query = { type: normalizedType, institutionSlug: inst, active: true };
    if (normalizedType === 'course') {
        if (!course) {
            return res.status(400).json({ error: 'Bad Request', message: 'courseSlug required for course access' });
        }
        query.courseSlug = course;
    }

    const keys = await AccessKey.find(query);
    if (!keys.length) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid access credentials' });
    }

    let matchedKey = null;
    for (const key of keys) {
        const keyFirstName = normalizeAccessName(key.firstName);
        const keySurname = normalizeAccessName(key.surname);
        if (keyFirstName !== normalizedFirstName || keySurname !== normalizedSurname) {
            continue;
        }

        const ok = await verifyPassword(password, key.passwordHash);
        if (ok) {
            matchedKey = key;
            break;
        }
    }

    if (!matchedKey) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid access credentials' });
    }

    if (matchedKey.endDate && new Date() > new Date(matchedKey.endDate)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Access key has expired' });
    }

    matchedKey.lastUsedAt = new Date();
    await matchedKey.save();

    const institution = await Institution.findOne({ slug: inst }).lean();
    const institutionName = institution ? institution.title : inst;
    let courseName = null;
    if (normalizedType === 'course' && institution) {
        const courseObj = institution.courses.find(c => c.slug === course);
        courseName = courseObj ? courseObj.name : course;
    }

    req.session.access = {
        accessKeyId: String(matchedKey._id),
        type: normalizedType,
        institutionSlug: inst,
        institutionName: institutionName,
        courseSlug: normalizedType === 'course' ? course : undefined,
        courseName: normalizedType === 'course' ? courseName : undefined,
        label: matchedKey.label || undefined,
        firstName: matchedKey.firstName || undefined,
        surname: matchedKey.surname || undefined,
        endDate: matchedKey.endDate || undefined,
        sessionLimit: Number.isInteger(matchedKey.sessionLimit) ? matchedKey.sessionLimit : undefined
    };
    req.session.isAuthenticated = true;
    req.session.role = 'access';
    req.session.save((err) => {
        if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ error: 'Session save failed' });
        }
        res.json({ success: true, access: req.session.access });
    });
};

const accessLogout = (req, res) => {
    if (req.session) {
        delete req.session.access;
    }
    res.json({ success: true });
};

const checkAccess = (req, res) => {
    const access = req.session && req.session.access;
    if (!access) {
        return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, access });
};

// Check auth status
const checkAuth = (req, res) => {
    if (req.session && req.session.isAuthenticated) {
        return res.json({ 
            authenticated: true, 
            role: req.session.role 
        });
    }
    res.json({ authenticated: false });
};

// Get environment info (for dev mode indicator)
const getEnvInfo = (req, res) => {
    res.json({
        isDev: process.env.ISDEV === 'true'
    });
};

// Get CSRF token
const getCsrfToken = (req, res) => {
    try {
        // Run CSRF middleware to set cookies and add req.csrfToken method
        doubleCsrfProtection(req, res, (err) => {
            if (err) {
                console.error('CSRF middleware error:', err);
                return res.status(500).json({ error: 'CSRF setup failed' });
            }
            
            try {
                // After middleware runs, req.csrfToken() is available
                const token = req.csrfToken();
                res.json({ csrfToken: token });
            } catch (tokenErr) {
                console.error('Token generation error:', tokenErr);
                res.status(500).json({ error: 'Token generation failed' });
            }
        });
    } catch (err) {
        console.error('CSRF token endpoint error:', err);
        res.status(500).json({ error: 'CSRF token generation failed' });
    }
};

module.exports = {
    sessionMiddleware,
    requireAuth,
    requireAdmin,
    requireSuperuser,
    requireSessionAccess,
    login,
    logout,
    checkAuth,
    loginLimiter,
    authLimiter,
    getEnvInfo,
    getCsrfToken,
    getAccessLoginOptions,
    accessLogin,
    accessLogout,
    checkAccess,
    hashPassword,
    verifyPassword,
    buildAccessFilter,
    isEnvSuperuserLogin,
    getEnvSuperuserUsername
};
