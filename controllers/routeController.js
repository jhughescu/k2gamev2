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
const sessionController = require('./../controllers/sessionController');
const templateController = require('./../controllers/templateController');
const downloadController = require('./../controllers/downloadController');
const quizController = require('./../controllers/quizController');

const basePath = path.join(__dirname, '..', 'public');
const routeAccessTimes = {};
const connectedUsers = new Map();
const DEBUG_PIN = process.env.DEBUG_PIN || '2222';
const authController = require('./authController');
const Institution = require('../models/institution');
const adminController = require('./adminController');

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

// Access (INS/COU) login page
app.get('/facilitator/login', (req, res) => {
    res.sendFile(path.join(basePath, 'access.html'));
});

app.get('/facilitator/dashboard', authController.requireSessionAccess, (req, res) => {
    res.sendFile(path.join(basePath, 'access.html'));
});

// Access (INS/COU) auth routes
app.post('/access/login', authController.authLimiter, authController.accessLogin);
app.post('/access/logout', authController.authLimiter, authController.accessLogout);
app.get('/access/check', authController.authLimiter, authController.checkAccess);
app.get('/access/sessions', authController.requireSessionAccess, sessionController.listSessionsForAccess);
app.get('/access/gamedata', authController.requireSessionAccess, (req, res) => {
    // Return gameData for quiz/team info
    sessionController.getGameData((data) => {
        res.json(data);
    });
});

app.get('/access/quiz/:bank', authController.requireSessionAccess, async (req, res) => {
    // Return quiz questions for a specific bank (e.g., quiz1, quiz2)
    try {
        console.log(`Fetching quiz questions for bank: ${req.params.bank}`);
        
        // For now, return static quiz questions until MongoDB connection is verified
        const staticQuestions = [
            {
                question: "Which mathematical concept did Georg Cantor develop?",
                options: ["Set theory", "Topology", "Number theory", "Calculus"]
            },
            {
                question: "Which element has the highest melting point?",
                options: ["Rhenium", "Carbon", "Tungsten", "Osmium"]
            },
            {
                question: "What is the main function of mitochondria in cells?",
                options: ["Digest cellular waste", "Synthesize proteins", "Store genetic information", "Produce energy (ATP)"]
            },
            {
                question: "In economics, what does the Gini coefficient measure?",
                options: ["Gross Domestic Product", "Consumer confidence", "Income inequality", "Inflation rate"]
            }
        ];
        
        console.log(`Returning ${staticQuestions.length} questions`);
        res.json(staticQuestions);
    } catch (err) {
        console.error('Error fetching quiz questions:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/access/sessions', authController.requireSessionAccess, async (req, res) => {
    // Delete multiple sessions by uniqueID
    try {
        const { sessionIds } = req.body;
        if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({ error: 'No session IDs provided' });
        }
        
        console.log(`Deleting ${sessionIds.length} sessions:`, sessionIds);
        
        // Import Session model
        const Session = require('../models/session');
        const result = await Session.deleteMany({ uniqueID: { $in: sessionIds } });
        
        console.log(`Deleted ${result.deletedCount} sessions`);
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        console.error('Error deleting sessions:', err);
        res.status(500).json({ error: err.message });
    }
});


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
app.get(`/game/:institution/:course`, async (req, res, next) => {
    try {
        const instSlug = (req.params.institution || '').toLowerCase();
        const courseSlug = (req.params.course || '').toLowerCase();
        const inst = await Institution.findOne({ slug: instSlug }).lean();
        const courseOk = inst && Array.isArray(inst.courses) && inst.courses.some(c => (c.slug || '').toLowerCase() === courseSlug);
        if (!inst || !courseOk) {
            return res.status(404).send('Invalid institution or course');
        }
        res.sendFile(path.join(basePath, 'game.html'));
    } catch (err) {
        next(err);
    }
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
// Legacy dashboard route - commented out; now using institution manager at /admin/dashboard
// app.get('/admin/dashboard', authController.requireAdmin, (req, res) => {
//     res.sendFile(path.join(basePath, 'admin_dashboard_layout.html'));
// });
app.get('/devtools', (req, res) => {
    res.sendFile(path.join(basePath, 'dev.tools.html'));
});

app.get('/dev/logdisplay', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'log_display.html'));
});

// Admin institution management routes
app.get('/admin/superuser', (req, res) => {
    res.sendFile(path.join(basePath, 'admin.html'));
});

app.get('/admin/dashboard', authController.requireAdmin, (req, res) => {
    res.sendFile(path.join(basePath, 'admin.html'));
});

app.post('/admin/api/auth', adminController.authenticateAdmin);
app.get('/admin/api/institutions', adminController.adminAuth, adminController.getInstitutions);
app.post('/admin/api/institutions', adminController.adminAuth, adminController.createInstitution);
app.put('/admin/api/institutions/:id', adminController.adminAuth, adminController.updateInstitution);
app.delete('/admin/api/institutions/:id', adminController.adminAuth, adminController.deleteInstitution);

// Admin user and access key management
app.post('/admin/api/admin-users', authController.requireSuperuser, adminController.createAdminUser);
app.get('/admin/api/admin-users', authController.requireSuperuser, adminController.listAdminUsers);
app.post('/admin/api/access-keys', authController.requireAdmin, adminController.createAccessKey);
app.get('/admin/api/access-keys', authController.requireAdmin, adminController.listAccessKeys);
app.patch('/admin/api/access-keys/:id/active', authController.requireAdmin, adminController.setAccessKeyActive);

// Export createRoute function
module.exports = {};
