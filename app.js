const express = require('express');
const ngrok = require('ngrok');
const fs = require('fs');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
//const gfxController = require('./controllers/gfxController');
const app = express();
const server = http.createServer(app);
const chalk = require('chalk');
const tools = require('./controllers/tools');
require('dotenv').config();

module.exports = { app };
const { initSocket } = require('./controllers/socketController');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const databaseController = require('./controllers/databaseController');
const versionController = require('./controllers/versionController');
const localAccessController = require('./controllers/localAccessController');


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
app.use('/models', express.static(path.join(__dirname, 'models')));
app.engine('.hbs', exphbs.engine({
    extname: '.hbs',
    layoutsDir: path.join(__dirname, 'views'),
    partialsDir: path.join(__dirname, 'views/partials'),
    defaultLayout: false
}));
app.set('view engine', '.hbs');
app.get('/views/:templateName', (req, res) => {
    const templateName = req.params.templateName;
    res.sendFile(`${__dirname}/views/${templateName}`);
});
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

