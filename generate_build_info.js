const fs = require('fs');
const { execSync } = require('child_process');
const moment = require('moment-timezone');
const buildInfo = {
    timestamp: moment().tz('Europe/London').format(), // Adjusted to BST/GMT
    commitHash: execSync('git rev-parse HEAD').toString().trim(),
    commitMessage: execSync('git log -1 --pretty=%B').toString().trim(),
    branch: execSync('git rev-parse --abbrev-ref HEAD').toString().trim(),
};
fs.writeFileSync('build-info.json', JSON.stringify(buildInfo, null, 2));
