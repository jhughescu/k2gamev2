const fs = require('fs');
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

module.exports = {
    convertToCSV
}
