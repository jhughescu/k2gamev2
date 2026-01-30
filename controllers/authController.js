const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const AccessKey = require('../models/accessKey');
const Institution = require('../models/institution');
const { doubleCsrfProtection } = require('./csrfConfig');
require('dotenv').config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

// Rate limiter for login attempts - 5 attempts per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.ISDEV === 'true' ? 100 : 5, // 5 attempts in prod, 100 in dev
    message: { error: 'Too Many Requests', message: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful logins
});

// General rate limiter for all auth routes - 20 requests per minute
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.ISDEV === 'true' ? 1000 : 20, // Relaxed in dev
    message: { error: 'Too Many Requests', message: 'Too many requests, please slow down' },
    standardHeaders: true,
    legacyHeaders: false
});

const hashPassword = async (plain) => bcrypt.hash(plain, 10);
const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);

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
    if (req.session && req.session.isAuthenticated && (req.session.role === 'admin' || req.session.role === 'superuser')) {
        return next();
    }
    
    // Check if request wants JSON (AJAX/fetch requests)
    const wantsJson = req.accepts('json') && !req.accepts('html');
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    
    if (wantsJson || isAjax) {
        return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Admin access required',
            loginUrl: '/auth/login'
        });
    }
    
    // HTML requests get redirected to login
    const redirectUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?redirect=${redirectUrl}`);
};

const requireSuperuser = (req, res, next) => {
    if (req.session && req.session.isAuthenticated && req.session.role === 'superuser') {
        return next();
    }
    res.status(403).json({ error: 'Forbidden', message: 'Superuser access required' });
};

const requireSessionAccess = (req, res, next) => {
    const filter = buildAccessFilter(req.session || {});
    if (filter === null) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Access login required' });
    }
    req.accessFilter = filter;
    req.accessContext = req.session.access || null;
    next();
};

// Login handler
const login = async (req, res) => {
    const { username, password } = req.body || {};

    if (!password) {
        return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'Password is required' 
        });
    }

    // If username provided, authenticate against User collection
    if (username) {
        const user = await User.findOne({ username: username.toLowerCase(), active: true });
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
            res.json({ success: true, message: 'Login successful', role: user.role, redirectUrl: '/admin/dashboard' });
        });
    }

    // Fallback: environment superuser password
    if (!ADMIN_PASSWORD) {
        console.error('ADMIN_PASSWORD not set in environment variables');
        return res.status(500).json({ 
            error: 'Server Error', 
            message: 'Authentication not configured' 
        });
    }

    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.role = 'superuser';
        req.session.username = 'env-superuser';
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session save failed' });
            }
            res.json({ 
                success: true, 
                message: 'Login successful',
                role: 'superuser',
                redirectUrl: '/admin/dashboard'
            });
        });
    } else {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Invalid password' 
        });
    }
};

// Logout handler
const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ 
                error: 'Server Error', 
                message: 'Logout failed' 
            });
        }
        res.json({ 
            success: true, 
            message: 'Logout successful' 
        });
    });
};

const accessLogin = async (req, res) => {
    const { type, institutionSlug, courseSlug, password, label } = req.body || {};
    if (!type || !institutionSlug || !password) {
        return res.status(400).json({ error: 'Bad Request', message: 'type, institutionSlug, and password are required' });
    }
    const normalizedType = type.toLowerCase();
    if (!['institution', 'course'].includes(normalizedType)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid type' });
    }
    const inst = (institutionSlug || '').toLowerCase();
    const course = (courseSlug || '').toLowerCase();
    const query = { type: normalizedType, institutionSlug: inst, active: true };
    if (normalizedType === 'course') {
        if (!course) {
            return res.status(400).json({ error: 'Bad Request', message: 'courseSlug required for course access' });
        }
        query.courseSlug = course;
    }
    const key = await AccessKey.findOne(query);
    if (!key) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid access credentials' });
    }
    const ok = await verifyPassword(password, key.passwordHash);
    if (!ok) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid access credentials' });
    }
    key.lastUsedAt = new Date();
    await key.save();
    
    // Fetch institution and course names
    const institution = await Institution.findOne({ slug: inst }).lean();
    console.log('Institution lookup for slug:', inst, '-> Found:', institution);
    const institutionName = institution ? institution.title : inst;
    let courseName = null;
    if (normalizedType === 'course' && institution) {
        const courseObj = institution.courses.find(c => c.slug === course);
        console.log('Course lookup for slug:', course, '-> Found:', courseObj);
        courseName = courseObj ? courseObj.name : course;
    }
    
    console.log('Setting access with names:', { institutionName, courseName });
    
    req.session.access = {
        type: normalizedType,
        institutionSlug: inst,
        institutionName: institutionName,
        courseSlug: normalizedType === 'course' ? course : undefined,
        courseName: normalizedType === 'course' ? courseName : undefined,
        label: label || key.label || undefined
    };
    // Do not elevate to admin; mark authenticated for access-only flows
    req.session.isAuthenticated = true;
    req.session.role = 'access';  // Force role to 'access', even if previously logged in as admin
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
    accessLogin,
    accessLogout,
    checkAccess,
    hashPassword,
    verifyPassword,
    buildAccessFilter
};
