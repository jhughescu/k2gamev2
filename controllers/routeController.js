// Import necessary modules
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const handlebars = require('handlebars');
const { app } = require('./../app'); // Import app from app.js
//const adminController = require('./../controllers/adminController');
//const sessionController = require('./../controllers/sessionController');
const templateController = require('./../controllers/templateController');

const basePath = path.join(__dirname, '..', 'public');
const routeAccessTimes = {};
const connectedUsers = new Map();


app.use(express.static(basePath));
// Use body-parser middleware to parse request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use((req, res, next) => {
    const currentTime = new Date().toISOString();
    routeAccessTimes[req.path] = currentTime;
    next();
});
app.use(bodyParser.json({ limit: '0.5mb' }));
app.use(cookieParser());





app.post('/getTemplate', (req, res) => {
    templateController.getTemplate(req, res);
});
app.get('/partials', async (req, res) => {
    const partials = await templateController.getPartials();
//    console.log(`server tries to get those partials`);
//    console.log(partials);
    res.json({ partials });
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
app.get('/how1', (rq, res) => {
    res.sendFile(path.join(basePath, 'flat', 'how-to-play-a.html'));
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

app.get('/dev/pbuilder', (req, res) => {
    res.sendFile(path.join(basePath, 'dev_profile_builder.html'));
});
app.get('/dev/admin', (req, res) => {
    res.sendFile(path.join(basePath, 'dev_admin.html'));
});
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(basePath, 'admin_dashboard.html'));
});
app.get('/devtools', (req, res) => {
    res.sendFile(path.join(basePath, 'dev.tools.html'));
});

app.get('/dev/logdisplay', (req, res) => {
    res.sendFile(path.join(basePath, 'log_display.html'));
});





// Export createRoute function
module.exports = {};
