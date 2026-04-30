// backend/create-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createAdmin() {
    try {
        // Import database and models
        const database = require('./config/database');
        await database.connect();

        const modelFactory = require('./models');
        await modelFactory.init();

        const User = modelFactory.getModel('User');

        // Generate a fresh hash for 'admin123'
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);

        console.log('Generated hash:', hashedPassword);
        console.log('Hash length:', hashedPassword.length);

        // Check if admin exists
        let admin = await User.findOne({
            where: { email: 'admin@example.com' }
        });

        if (admin) {
            // Update existing admin
            await admin.update({
                password: hashedPassword,
                status: 'active',
                role: 'admin'
            });
            console.log('✅ Admin password updated successfully!');
        } else {
            // Create new admin
            admin = await User.create({
                id: uuidv4(),
                name: 'Administrator',
                email: 'admin@example.com',
                password: hashedPassword,
                role: 'admin',
                status: 'active'
            });
            console.log('✅ Admin user created successfully!');
        }

        console.log('\n📧 Email: admin@example.com');
        console.log('🔑 Password: admin123');
        console.log('👤 Role:', admin.role);
        console.log('🆔 ID:', admin.id);

        // Verify the password works
        const verifyResult = await bcrypt.compare('admin123', admin.password);
        console.log('\n🔐 Password verification test:', verifyResult ? '✅ PASSED' : '❌ FAILED');

        if (!verifyResult) {
            console.error('⚠️ WARNING: Password verification failed! Please check the hash.');
        }

        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

createAdmin();