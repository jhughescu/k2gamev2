/**
 * Script to create a superuser account for testing admin user management
 * Usage: node scripts/create-superuser.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { hashPassword } = require('../controllers/authController');
const User = require('../models/user');

async function createSuperuser() {
    try {
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

        const username = 'superuser_test';
        const password = 'SuperSecurePassword123!';
        const role = 'superuser';

        // Check if user exists
        const existing = await User.findOne({ username });
        if (existing) {
            console.log(`User "${username}" already exists`);
            console.log(`ID: ${existing._id}`);
            console.log(`Role: ${existing.role}`);
            console.log(`Active: ${existing.active}`);
            await mongoose.connection.close();
            process.exit(0);
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Create user
        const user = await User.create({
            username,
            passwordHash,
            role,
            active: true,
            createdBy: 'manual-creation-script'
        });

        console.log('✓ Superuser created successfully!');
        console.log(`Username: ${user.username}`);
        console.log(`Password: ${password}`);
        console.log(`Role: ${user.role}`);
        console.log(`ID: ${user._id}`);
        console.log('\nYou can now login with these credentials to access admin user management.');

        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error creating superuser:', err.message);
        await mongoose.connection.close();
        process.exit(1);
    }
}

createSuperuser();
