const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Seeding users...');

    // 1. ADMIN USER (must match AdminLogin.jsx defaults)
    const adminEmail = 'admin@gmail.com';
    const adminPassword = '1234';
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.upsert({
        where: { email: adminEmail },
        update: { password: hashedAdminPassword, role: 'ADMIN' },
        create: {
            name: 'System Admin',
            email: adminEmail,
            phone: '9999912345',
            password: hashedAdminPassword,
            role: 'ADMIN'
        }
    });
    console.log(`✅ Admin created: ${adminEmail} / ${adminPassword}`);

    // 2. PROFESSIONAL USER (must match ProfessionalLogin.jsx defaults — same as APK)
    const proEmail = 'pro@market.com';
    const proPassword = '1234';
    const hashedProPassword = await bcrypt.hash(proPassword, 10);

    await prisma.user.upsert({
        where: { email: proEmail },
        update: { password: hashedProPassword, role: 'WORKER' },
        create: {
            name: 'John Professional',
            email: proEmail,
            phone: '9999967890',
            password: hashedProPassword,
            role: 'WORKER',
            city: 'Mumbai',
            state: 'Maharashtra'
        }
    });
    console.log(`✅ Professional created: ${proEmail} / ${proPassword}`);

    console.log('✨ Seeding complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
