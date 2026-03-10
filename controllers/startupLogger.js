const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function loadBuildInfo(projectRoot) {
    try {
        const filePath = path.join(projectRoot, 'build-info.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function printServerStartup(options = {}) {
    const {
        host = 'localhost',
        port = 3000,
        rootDir = process.cwd(),
        trustProxy = false,
        nodeEnv = process.env.NODE_ENV || 'development',
        isDev = process.env.isDev === 'true'
    } = options;

    const build = loadBuildInfo(rootDir);
    const mode = isDev ? 'DEV (nodemon)' : 'PROD';
    const localHost = host === '0.0.0.0' ? 'localhost' : host;
    const localUrl = `http://${localHost}:${port}`;

    console.log('');
    console.log(chalk.cyan('┌────────────────────────────── K2 Server ──────────────────────────────┐'));
    console.log(`${chalk.cyan('│')} ${chalk.bold('Mode')}       ${chalk.gray('→')} ${chalk.yellow(mode)}`);
    console.log(`${chalk.cyan('│')} ${chalk.bold('URL')}        ${chalk.gray('→')} ${chalk.green(localUrl)}`);
    console.log(`${chalk.cyan('│')} ${chalk.bold('Node Env')}   ${chalk.gray('→')} ${chalk.magenta(nodeEnv)}`);
    console.log(`${chalk.cyan('│')} ${chalk.bold('Trust Proxy')} ${chalk.gray('→')} ${trustProxy ? chalk.green('enabled') : chalk.gray('disabled')}`);

    if (build) {
        console.log(`${chalk.cyan('│')} ${chalk.bold('Build')}      ${chalk.gray('→')} ${chalk.white(build.timestamp || 'n/a')}`);
        console.log(`${chalk.cyan('│')} ${chalk.bold('Commit')}     ${chalk.gray('→')} ${chalk.white((build.commitHash || 'n/a').slice(0, 10))} ${chalk.gray(build.branch ? `(${build.branch})` : '')}`);
        if (build.commitMessage) {
            console.log(`${chalk.cyan('│')} ${chalk.bold('Message')}    ${chalk.gray('→')} ${chalk.gray(build.commitMessage)}`);
        }
    }

    console.log(chalk.cyan('├─────────────────────────────────────────────────────────────────────────┤'));
    console.log(`${chalk.cyan('│')} ${chalk.gray('Tip:')} ${chalk.white('Press')} ${chalk.bold('rs')} ${chalk.white('to restart nodemon')}`);
    console.log(`${chalk.cyan('│')} ${chalk.bold('Routes')}`);
    console.log(`${chalk.cyan('│')} ${chalk.green(`localhost:${port}/admin`)} ${chalk.gray('- login for superuser/admin')}`);
    console.log(`${chalk.cyan('│')} ${chalk.green(`localhost:${port}/facilitator`)} ${chalk.gray('- login for facilitators')}`);
    console.log(`${chalk.cyan('│')} ${chalk.green(`localhost:${port}/game/[ins]/[cou]`)} ${chalk.gray('- course-specific game entry point')}`);
    console.log(chalk.cyan('└─────────────────────────────────────────────────────────────────────────┘'));
    console.log('');
}

module.exports = {
    printServerStartup
};
