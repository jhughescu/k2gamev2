const { doubleCsrf } = require('csrf-csrf');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const {
    generateToken,
    doubleCsrfProtection,
} = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET || 'csrf-secret-change-in-production',
    cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
    cookieOptions: {
        sameSite: 'strict',
        path: '/',
        secure: isProduction,
        httpOnly: true
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getSessionIdentifier: (req) => {
        // Tie CSRF tokens to user session
        return req.session && req.session.id ? req.session.id : '';
    }
});

module.exports = {
    generateToken,
    doubleCsrfProtection
};
