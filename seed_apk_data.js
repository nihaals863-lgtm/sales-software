const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting APK Backend Seeding...');

    // 1. Create a Professional (Worker)
    const salt = await bcrypt.genSalt(10);
    // Same credentials as web software + seedUsers (pro@market.com / 1234)
    const devPassword = '1234';
    const hashedPassword = await bcrypt.hash(devPassword, salt);

    const worker = await prisma.user.upsert({
        where: { email: 'pro@market.com' },
        update: { password: hashedPassword, role: 'WORKER' },
        create: {
            name: 'John Professional',
            email: 'pro@market.com',
            phone: '1234567890',
            password: hashedPassword,
            role: 'WORKER',
            businessName: 'Pro Repairs Inc.',
            city: 'New York',
            isAvailable: true,
            rating: 4.8
        }
    });

    // 1.1 Create Admin Account
    const adminPassword = await bcrypt.hash('1234', salt);
    await prisma.user.upsert({
        where: { email: 'admin@gmail.com' },
        update: { password: adminPassword, role: 'ADMIN' },
        create: {
            name: 'Super Admin',
            email: 'admin@gmail.com',
            phone: '0000000000',
            password: adminPassword,
            role: 'ADMIN',
            isAvailable: true
        }
    });

    // 2. Create Categories if missing
    const categories = ['Plumbing', 'Electrical', 'Cleaning', 'HVAC'];
    for (const cat of categories) {
        await prisma.category.upsert({
            where: { name: cat },
            update: {},
            create: { name: cat, icon: cat }
        });
    }

    // 3. Create a Customer
    const customer = await prisma.user.upsert({
        where: { email: 'customer@example.com' },
        update: { password: hashedPassword },
        create: {
            name: 'Sarah Smith',
            email: 'customer@example.com',
            phone: '9876543210',
            password: hashedPassword,
            role: 'CUSTOMER'
        }
    });

    // 4. Create an Active Job
    const activeJob = await prisma.job.create({
        data: {
            jobNo: 'J-101',
            customerId: customer.id,
            workerId: worker.id,
            categoryName: 'Plumbing',
            location: '123 Main St, New York',
            status: 'ACCEPTED',
            scheduledDate: new Date(),
            scheduledTime: '10:00 AM',
            description: 'Leaking pipe in the kitchen'
        }
    });

    // 5. Create a Pending/Estimated Job
    const estimatedJob = await prisma.job.create({
        data: {
            jobNo: 'J-102',
            customerId: customer.id,
            workerId: worker.id,
            categoryName: 'Electrical',
            location: '456 Oak Ave, New York',
            status: 'ESTIMATED',
            scheduledDate: new Date(Date.now() + 86400000),
            scheduledTime: '02:30 PM',
            description: 'Light flickering in the living room'
        }
    });

    await prisma.jobEstimate.create({
        data: {
            jobId: estimatedJob.id,
            amount: 150.00,
            details: 'Includes wire replacement and labor',
            materials: JSON.stringify([{ name: 'Copper Wire', qty: 2, price: 10 }])
        }
    });

    // 6. Create a Completed Job
    const completedJob = await prisma.job.create({
        data: {
            jobNo: 'J-103',
            customerId: customer.id,
            workerId: worker.id,
            categoryName: 'Cleaning',
            location: '789 Pine Rd, New York',
            status: 'COMPLETED',
            scheduledDate: new Date(Date.now() - 172800000),
            scheduledTime: '09:15 AM',
            description: 'Full house cleaning'
        }
    });

    await prisma.jobInvoice.create({
        data: {
            jobId: completedJob.id,
            amount: 200.00,
            total_amount: 200.00,
            status: 'PAID',
            milestone: 'SINGLE'
        }
    });

    console.log('✅ APK Data Seeded Successfully!');
    console.log('Credentials (same as web software):');
    console.log('  Pro:  pro@market.com / 1234');
    console.log('  Admin: admin@gmail.com / 1234');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
}).finally(() => {
    prisma.$disconnect();
});
