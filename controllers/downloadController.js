const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const convertToCSV = (data) => {
    let csvString = '';
    // Construct CSV header
    const headers = Object.keys(data[0]);
    csvString += headers.join(',') + '\n';
    // Construct CSV rows
    data.forEach(item => {
        const row = headers.map(header => item[header]);
        csvString += row.join(',') + '\n';
    });
    return csvString;
}
const saveCSVLocally = (data, filename = 'data.csv') => {
    if (process.env.ISLOCAL === 'true') {
        const downloadsDir = path.join(__dirname, '..', 'downloads');

        // Ensure 'downloads' folder exists
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        const csvString = convertToCSV(data);
        const filePath = path.join(downloadsDir, filename);
        fs.writeFileSync(filePath, csvString, 'utf8');
        return filePath;
    } else {
        console.log('local CSV storage not possible in this environment');
        return null;
    }
};
const downloadCSV = (req, res) => {
    try {
        // You can get data from req.query, req.body, or DB
        const data = req.body.data; // assuming it's posted
        const filename = req.body.filename || 'session_data.csv';

        const csvString = convertToCSV(data);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvString);
    } catch (error) {
        console.error('Error generating CSV for download:', error);
        res.status(500).send('Error generating CSV');
    }
};
module.exports = {
    convertToCSV,
    saveCSVLocally,
    downloadCSV
}
