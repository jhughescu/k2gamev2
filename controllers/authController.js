const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const rateLimit = require('express-rate-limit');
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

// Session middleware configuration with MongoDB store
const sessionMiddleware = session({
    secret: SESSION_SECRET || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({
        mongoUrl: MONGODB_URI,
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
    
    // Check if request accepts HTML (browser request) vs JSON (API request)
    if (req.accepts('html')) {
        const redirectUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`/auth/login?redirect=${redirectUrl}`);
    }
    
    res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required',
        loginUrl: '/auth/login'
    });
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.isAuthenticated && req.session.role === 'admin') {
        return next();
    }
    
    // Check if request accepts HTML (browser request) vs JSON (API request)
    if (req.accepts('html')) {
        const redirectUrl = encodeURIComponent(req.originalUrl);
        return res.redirect(`/auth/login?redirect=${redirectUrl}`);
    }
    
    res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Admin access required',
        loginUrl: '/auth/login'
    });
};

// Login handler
const login = (req, res) => {
    const { password } = req.body || {};

    if (!password) {
        return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'Password is required' 
        });
    }

    if (!ADMIN_PASSWORD) {
        console.error('ADMIN_PASSWORD not set in environment variables');
        return res.status(500).json({ 
            error: 'Server Error', 
            message: 'Authentication not configured' 
        });
    }

    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.role = 'admin';
        return res.json({ 
            success: true, 
            message: 'Login successful',
            redirectUrl: '/admin/dashboard'
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

module.exports = {
    sessionMiddleware,
    requireAuth,
    requireAdmin,
    login,
    logout,
    checkAuth,
    loginLimiter,
    authLimiter,
    getEnvInfo
};
