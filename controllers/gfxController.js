const QRCode = require('qrcode');
const fs = require('fs');

const imgPath = `public/assets/qr/qrcode-ID.svg`;
const temPath = `views/qr/qrcode-ID.hbs`;
const data = 'this is a QR code';

const colours = {dark: '#252721', light: '#ffffff'}

const generateQR = (data, id, cb) => {
    let outOb = {
        img: imgPath.replace('ID', id),
        tem: temPath.replace('ID', id)
    };
    QRCode.toDataURL(data, (err, url) => {
        if (err) {
            console.error(err);
            return;
        }
        const options = {
            size: 300,
            type: 'svg',
            border: 0,
            color: colours
        }
        const output = imgPath.replace('ID', id);
        QRCode.toFile(output, data, options, (err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                const tOb = {ID: id};
                createTemplateQR(tOb);
            }
        });
    });
    if (cb) {
        cb(outOb);
    }
};
const deleteQR = (id) => {
    deleteQRTem(id);
    deleteQRImg(id);
}
const deleteQRTem = (id) => {
    const qr = temPath.replace('ID', id);
    fs.unlink(qr, (err) => {
        if (err) {
            console.error(`Error deleting file ${qr}:`, err);
            return;
        }
        console.log(`File ${qr} deleted successfully`);
    });
}
const deleteQRImg = (id) => {
    let qr = imgPath.replace('ID', id);
    fs.unlink(qr, (err) => {
        if (err) {
            console.error(`Error deleting file ${qr}:`, err);
            return;
        }
        console.log(`File ${qr} deleted successfully`);
    });
}
const generateSessionQR = (session) => {
//    console.log(`generateSessionQR`, session);
    generateQR(`${session.base}${session.address}`, session.uniqueID);
//    generateQR(`${session.base}/presentation#${session.address.replace('/', '')}`, `${session.uniqueID}-presentation`);
};
const generateLocationQR = (loc, cb) => {
//    console.log(`generateLocationQR`);
//    console.log(loc);
    generateQR(`${loc.origin}`, 'k2game', cb);
//    generateQR(`${session.base}/presentation#${session.address.replace('/', '')}`, `${session.uniqueID}-presentation`);
};
const ensureDirectoryExists = async (directory) => {
    try {
        // Check if the directory exists
        await fs.promises.access(directory, fs.constants.F_OK);
    } catch (err) {
        // If the directory doesn't exist, create it
        if (err.code === 'ENOENT') {
            await fs.promises.mkdir(directory, { recursive: true });
        } else {
            throw err; // Throw any other errors that occur
        }
    }
}
const createTemplateQR = async (tOb) => {
    // duplicates the content of a created QR code img and outputs as hbs
    const ID = tOb.ID;
    const filePath = imgPath.replace('ID', ID);
    const outPath = temPath.replace('ID', ID);
    try {
        // Read the file asynchronously
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        const content = fileContent.replace(colours.light, '{{qrlight}}').replace(colours.dark, '{{qrdark}}');
        const dir = temPath.split('/').slice(0, 2).join('/');
        await ensureDirectoryExists(dir);
        await fs.promises.writeFile(temPath.replace('ID', ID), content, 'utf8');
        return temPath.replace('ID', ID);
//        console.log(`wrote `)
//        console.log(fileContent);
        return fileContent;
    } catch (err) {
        throw err; // Throw any errors that occur
    }
};
module.exports = {
//    generateQR,
    deleteQR,
    generateSessionQR,
    generateLocationQR,
}
