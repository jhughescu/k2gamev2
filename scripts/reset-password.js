/**
 * Script to reset an admin user's password
 * Usage: node scripts/reset-password.js <username>
 * Example: node scripts/reset-password.js superuser_test
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { hashPassword } = require('../controllers/authController');
const User = require('../models/user');
const crypto = require('crypto');

function generateRandomPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        password += charset[array[i] % charset.length];
    }
    return password;
}

async function resetPassword() {
    try {
        const username = process.argv[2];
        
        if (!username) {
            console.error('Usage: node scripts/reset-password.js <username>');
            console.error('Example: node scripts/reset-password.js superuser_test');
            process.exit(1);
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error('MONGODB_URI not set in .env');
            process.exit(1);
        }
        
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB');

        // Find user
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            console.error(`User "${username}" not found`);
            await mongoose.connection.close();
            process.exit(1);
        }

        // Generate new password
        const newPassword = generateRandomPassword();
        const passwordHash = await hashPassword(newPassword);

        // Update user
        user.passwordHash = passwordHash;
        await user.save();

        console.log('\n✓ Password reset successfully!');
        console.log(`Username: ${user.username}`);
        console.log(`New Password: ${newPassword}`);
        console.log(`Role: ${user.role}`);
        console.log('\nIMPORTANT: Save this password. It will not be shown again.');
        console.log('The user should change this password after logging in.\n');

        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error resetting password:', err.message);
        await mongoose.connection.close();
        process.exit(1);
    }
}

resetPassword();
