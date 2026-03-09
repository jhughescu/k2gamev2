const { spawn, execSync } = require('child_process');

const ngrokPath = 'C:\\Users\\j.hughes\\AppData\\Roaming\\npm\\node_modules\\ngrok\\bin\\ngrok.exe';
let ngrokProcess = null;

function startNgrok() {
    ngrokProcess = spawn(ngrokPath, ['start', '--config=./ngrok.yml', 'myapp'], {
        stdio: 'inherit'
    });
    console.log('ngrok tunnel started.');
}

function initLocalAccess() {
    const isLocal = process.env.ISLOCAL === 'true';
    const isWindows = process.platform === 'win32';

    // Never run ngrok/taskkill logic in cloud Linux environments.
    if (!isLocal || !isWindows) {
        return;
    }

    try {
        execSync('taskkill /IM ngrok.exe /F', { stdio: 'ignore' });
        console.log('Stopped existing ngrok process.');
    } catch (err) {
        console.warn('No existing ngrok process to kill.');
    }

    // Uncomment if you want ngrok auto-start locally.
    // startNgrok();

    process.on('SIGINT', () => {
        console.log('Shutting down...');
        if (ngrokProcess) {
            ngrokProcess.kill();
        }
        process.exit();
    });
}

module.exports = {
    initLocalAccess,
    startNgrok
};
