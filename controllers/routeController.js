// Import necessary modules
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const handlebars = require('handlebars');
const {
    app
} = require('./../app'); // Import app from app.js
//const adminController = require('./../controllers/adminController');
//const sessionController = require('./../controllers/sessionController');
const templateController = require('./../controllers/templateController');
const downloadController = require('./../controllers/downloadController');

const basePath = path.join(__dirname, '..', 'public');
const routeAccessTimes = {};
const connectedUsers = new Map();
const DEBUG_PIN = process.env.DEBUG_PIN || '2222';
const authController = require('./authController');

// Static files
app.use(express.static(basePath));

// Cookie parser
app.use(cookieParser());

// Route access logging
app.use((req, res, next) => {
    const currentTime = new Date().toISOString();
    routeAccessTimes[req.path] = currentTime;
    next();
});

// Authentication routes
app.get('/auth/login', (req, res) => {
    res.sendFile(path.join(basePath, 'auth_login.html'));
});
app.post('/auth/login', authController.loginLimiter, authController.login);
app.post('/auth/logout', authController.authLimiter, authController.logout);
app.get('/auth/check', authController.authLimiter, authController.checkAuth);
app.get('/auth/env-info', authController.getEnvInfo);
app.get('/auth/csrf-token', authController.getCsrfToken);


app.post('/getTemplate', (req, res) => {
    templateController.getTemplate(req, res);
});
app.get('/partials', async (req, res) => {
    const partials = await templateController.getPartials();
    //    console.log(`server tries to get those partials`);
    //    console.log(partials);
    res.json({
        partials
    });
});

app.get(`/ptest`, (req, res) => {
    res.sendFile(path.join(basePath, 'partials_test.html'));
});
app.get(`/route`, (req, res) => {
    res.sendFile(path.join(basePath, 'routemapper.html'));
});
app.get(`/game`, (req, res) => {
    res.sendFile(path.join(basePath, 'game.html'));
});
app.get(`/`, (req, res) => {
    res.sendFile(path.join(basePath, 'flat', 'home.html'));
    //    res.sendFile('../public/flat/index.html');
});
app.get('/testuser', (req, res) => {
    const username = req.query.user;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!username) {
        return res.status(400).send('Missing user ID');
    }

    connectedUsers.set(username, {
        ip,
        timestamp: new Date().toISOString(),
    });

    console.log(`User ${username} connected from ${ip}!!`);
    res.sendFile(path.join(basePath, 'game.html'));
    //    res.send(`Hello ${username}, you are now registered.`);
});
app.get('/data/routemap.json', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'data', 'routemap.json'));
});
app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'testing', 'pointer.html'));
});
app.get('/map', (req, res) => {
    res.render('map');
});
/*
app.get('/how1', (rq, res) => {
//    res.sendFile(path.join(basePath, 'flat', 'how-to-play-a.html'));
    res.render('how1');
});
app.get('/how2', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-b.html'));
});
app.get('/how3', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-c.html'));
});
app.get('/how4', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-d.html'));
});
app.get('/how5', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-e.html'));
});
app.get('/how6', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-f.html'));
});
*/

app.get('/how:step([1-6])/:arg?', (req, res) => {
    const { step, arg } = req.params;
    const isExt = arg === 'ext';
    const isInt = arg !== 'ext';
    const stepNum = parseInt(step, 10);   // convert "1".."6" → 1..6
    const links = Array.from({ length: 6 }, (_, i) => ({link: i + 1, active: i + 1 === stepNum}));
//    console.log(`isExt: ${isExt}`);
    res.render(`how${step}`, { stepNum, arg, isExt, links });
});



app.post('/download-csv', downloadController.downloadCSV);
app.post('/api/check-debug-pin', (req, res) => {
    const {
        pin
    } = req.body;
    if (!pin) return res.status(400).json({
        ok: false,
        error: "No PIN"
    });

    if (pin === DEBUG_PIN) {
        return res.json({
            ok: true
        });
    } else {
        return res.status(401).json({
            ok: false,
            error: "Invalid PIN"
        });
    }
});


// Protected dev routes - require admin authentication
app.get('/dev/pbuilder', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'dev_profile_builder.html'));
});
app.get('/dev/admin', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'dev_admin.html'));
});
app.get('/admin/dashboard1', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'admin_dashboard.html'));
    //    res.sendFile(path.join(basePath, 'admin_dashboard_layout.html'));
});
app.get('/admin/dashboard', authController.requireAdmin, (req, res) => {
    //    res.sendFile(path.join(basePath, 'admin_dashboard.html'));
    res.sendFile(path.join(basePath, 'admin_dashboard_layout.html'));
});
app.get('/devtools', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'dev.tools.html'));
});

app.get('/dev/logdisplay', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'log_display.html'));
});





// Export createRoute function
module.exports = {};
