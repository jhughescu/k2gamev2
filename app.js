const express = require('express');
const fs = require('fs');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { doubleCsrfProtection } = require('./controllers/csrfConfig');
const { printServerStartup } = require('./controllers/startupLogger');
//const gfxController = require('./controllers/gfxController');
const app = express();
const server = http.createServer(app);
const tools = require('./controllers/tools');
require('dotenv').config();

let isShuttingDown = false;

const gracefulShutdown = (signalName) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.warn(`[process] ${signalName} received. Starting graceful shutdown...`);

    server.close((err) => {
        if (err) {
            console.error('[process] server close error:', err);
            process.exit(1);
            return;
        }
        console.warn('[process] server closed. Exiting now.');
        process.exit(0);
    });

    // Safety timeout in case close callbacks never return.
    setTimeout(() => {
        console.error('[process] forced exit after shutdown timeout.');
        process.exit(1);
    }, 5000);
};

// Process-level diagnostics to understand Azure restarts/crashes.
process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[process] unhandledRejection:', reason);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('beforeExit', (code) => {
    console.warn(`[process] beforeExit with code ${code}`);
});

process.on('exit', (code) => {
    console.warn(`[process] exit with code ${code}`);
});

// Liveness/readiness probe endpoints for Azure health checks.
// Keep these dependency-free so platform probes do not fail during transient DB issues.
app.get('/healthz', (req, res) => {
    res.status(200).json({
        ok: true,
        uptimeSec: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/readyz', (req, res) => {
    res.status(200).json({
        ok: true,
        timestamp: new Date().toISOString()
    });
});

// Trust proxy when deployed behind a reverse proxy (e.g., Render/Heroku)
// Use 1 hop; keep default false in local unless explicitly set
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Export app early so other modules can import it
// IMPORTANT: Middleware must be set up before routeController is loaded
module.exports = { app };

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const isDevMode = process.env.ISDEV === 'true' || process.env.isDev === 'true';

console.log('[startup] runtime identity', {
    websiteInstanceId: process.env.WEBSITE_INSTANCE_ID || 'n/a',
    hostname: process.env.HOSTNAME || 'n/a',
    nodeEnv: process.env.NODE_ENV || 'n/a',
    ISDEV: process.env.ISDEV || 'unset',
    isDev: process.env.isDev || 'unset',
    isDevMode
});

const databaseController = require('./controllers/databaseController');
const versionController = require('./controllers/versionController');
const { initLocalAccess } = require('./controllers/localAccessController');
const authController = require('./controllers/authController');
const { initSocket } = require('./controllers/socketController');

// Apply security middleware early with CSP configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "code.jquery.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "cdn.socket.io"], 
            styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "code.jquery.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
            fontSrc: ["'self'", "cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://cranfield.cloud.panopto.eu"]
        }
    }
}));

// Configure session middleware BEFORE any routes
app.use(authController.sessionMiddleware);

// Cookie parser (needed for CSRF)
app.use(cookieParser());

// Body parser middleware (needed for login form)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply CSRF protection to authenticated routes only
// Logout is authenticated, so it gets CSRF protection
app.use('/auth/logout', doubleCsrfProtection);
// Login is unauthenticated - no valid session to tie token to, so skip CSRF


const padNum = (n) => {
    if (n < 10) {
        return `0${n.toString()}`
    } else {
        return n;
    }
}
const getTimeStamp = () => {
    const d = new Date();
    const ts = `timestamp: ${d.getFullYear()}${padNum(d.getMonth() + 1)}${padNum(d.getDate())} ${padNum(d.getHours())}:${padNum(d.getMinutes())}:${padNum(d.getSeconds())}`;
    return ts;
};
//global.ngrokUrl = 'https://singularly-glad-tortoise.ngrok-free.app';







app.use('/public', express.static(path.join(__dirname, 'public')));
// REMOVED: app.use('/models', ...) - prevents server code exposure
app.engine('.hbs', exphbs.engine({
    extname: '.hbs',
    layoutsDir: path.join(__dirname, 'views'),
    partialsDir: path.join(__dirname, 'views/partials'),
    defaultLayout: false
}));
app.set('view engine', '.hbs');
app.get('/views/:templateName', (req, res) => {
    const templateName = req.params.templateName;
    
    // Security: Prevent path traversal attacks
    if (!templateName || templateName.includes('..') || templateName.includes('/') || templateName.includes('\\')) {
        return res.status(400).send('Invalid template name');
    }
    
    // Only allow .hbs files
    const sanitizedName = templateName.endsWith('.hbs') ? templateName : `${templateName}.hbs`;
    
    // Use path.join to safely construct the path and resolve it
    const viewsDir = path.join(__dirname, 'views');
    const requestedPath = path.resolve(viewsDir, sanitizedName);
    
    // Ensure the resolved path is still within the views directory
    if (!requestedPath.startsWith(viewsDir)) {
        return res.status(403).send('Access denied');
    }
    
    res.sendFile(requestedPath);
});

// Load route controller AFTER middleware is set up
require('./controllers/routeController');

//initLocalAccess();
databaseController.dbConnect();
initSocket(server);
if (isDevMode) {
    server.listen(PORT, HOST, () => {
        printServerStartup({
            host: HOST,
            port: PORT,
            rootDir: __dirname,
            trustProxy: app.get('trust proxy') === 1,
            isDev: true
        });
    });
} else {
    server.listen(PORT, () => {
        printServerStartup({
            host: HOST,
            port: PORT,
            rootDir: __dirname,
            trustProxy: app.get('trust proxy') === 1,
            isDev: false
        });
    });
}

