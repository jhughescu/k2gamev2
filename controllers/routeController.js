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
app.get(`/`, (req, res) => {
    res.sendFile(path.join(basePath, 'game.html'));
});




// Export createRoute function
module.exports = {};
