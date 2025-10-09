
const { spawn, execSync } = require('child_process');
const ngrokPath = 'C:\\Users\\j.hughes\\AppData\\Roaming\\npm\\node_modules\\ngrok\\bin\\ngrok.exe';
const startNgrok = () => {
    // Start a new ngrok tunnel
    const ngrokProcess = spawn(ngrokPath, ['start', '--config=./ngrok.yml', 'myapp'], {
        stdio: 'inherit',
    });
    console.log(`startNgrok:`);
    console.log(ngrokProcess);
}
// Kill any existing ngrok processes
try {
    execSync('taskkill /IM ngrok.exe /F', { stdio: 'ignore' }); // Silently kill
} catch (err) {
    console.warn('No existing ngrok process to kill.');
    if (process.env.ISLOCAL) {
//        startNgrok();
    }
}



// Optional: Clean shutdown on Ctrl+C
process.on('SIGINT', () => {
    console.log('Shutting down...');
    ngrokProcess.kill(); // Kill the spawned ngrok process
    process.exit();
});
