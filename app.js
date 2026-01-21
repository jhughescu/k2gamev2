const express = require('express');
const ngrok = require('ngrok');
const fs = require('fs');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
//const gfxController = require('./controllers/gfxController');
const app = express();
const server = http.createServer(app);
const chalk = require('chalk');
const tools = require('./controllers/tools');
require('dotenv').config();

// Export app early so other modules can import it
// IMPORTANT: Middleware must be set up before routeController is loaded
module.exports = { app };

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const databaseController = require('./controllers/databaseController');
const versionController = require('./controllers/versionController');
const localAccessController = require('./controllers/localAccessController');
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

// Body parser middleware (needed for login form)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


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

databaseController.dbConnect();
initSocket(server);
if (Boolean(process.env.isDev)) {
    server.listen(PORT, HOST, () => {
        console.log(`Server running at http://${HOST}:${PORT} ${getTimeStamp()}`);
    });
} else {
    server.listen(PORT, () => {
        console.log(`Server running at http://${HOST}:${PORT} ${getTimeStamp()}`);
    });
}

