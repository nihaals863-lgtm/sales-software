const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function checkUser() {
    console.log('🔍 Checking for user: admin@gmail.com');
    const user = await prisma.user.findUnique({
        where: { email: 'admin@gmail.com' }
    });

    if (user) {
        console.log('✅ User found!');
        console.log('ID:', user.id);
        console.log('Role:', user.role);
        
        // Check password compatibility
        const isMatch = await bcrypt.compare('1234', user.password);
        console.log('Password "1234" matches:', isMatch);
    } else {
        console.log('❌ User NOT found in database.');
    }
}

checkUser().finally(() => prisma.$disconnect());
