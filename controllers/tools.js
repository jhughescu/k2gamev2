const os = require('os');
const procVal = (v) => {
//    console.log(`procVal ${v}`);
    const ipMatch = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // process values into numbers, booleans etc
    if (ipMatch.test(v)) {
        // do nothing if IP addresses
//        console.log('we have matched an IP');
    } else if (!isNaN(parseInt(v))) {
//        console.log('is a number')
        v = parseInt(v);
    } else if (v === 'true') {
        v = true;
    } else if (v === 'false') {
        v = false;
    }
    return v;
}
const toCamelCase = (str) => {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index !== 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
};
const justNumber = (i) => {
    // returns just the numeric character(s) of a string/number
    let out = null;
    if (i) {
        out = parseInt(i.toString().replace(/\D/g, ''));
    }
    return out;
};
const roundNumber = (n, r) => {
    let m = 1;
    let rr = r === undefined ? 3 : r;
    for (let i = 0; i < rr; i++) {
        m *= 10;
    }
//        console.log(`m is ${m}`);
    return Math.round(n * m) / m;
};
const isValidJSON = (j) => {
//    console.log(j);
    try {
        JSON.parse(j);
        return true;
    } catch (e) {
        return false;
    }
};
const getIPv4Address = () => {
    const networkInterfaces = os.networkInterfaces();
    let ipv4Address;
    for (const interfaceName in networkInterfaces) {
        const networkInterface = networkInterfaces[interfaceName];
        for (const alias of networkInterface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                ipv4Address = alias.address;
                break;
            }
        }
        if (ipv4Address) break;
    }
//    console.log(`ipv4Address: ${ipv4Address}`)
    return ipv4Address || false;
};
const mapSessionToGame = (s, g) => {
    const rg = Object.assign({}, g);
    for (let i in g) {
        if (g.hasOwnProperty(i)) {
            rg[i] = s[i];
        }
    }
    return rg;
};
module.exports = {
    procVal,
    toCamelCase,
    justNumber,
    roundNumber,
    isValidJSON,
    getIPv4Address,
    mapSessionToGame
}
