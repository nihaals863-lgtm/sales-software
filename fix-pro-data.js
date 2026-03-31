const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.user.updateMany({
        where: { role: 'WORKER' },
        data: {
            address: 'Service Center Main',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001'
        }
    });
    console.log("Updated all workers with default address data");
}

main().catch(console.error).finally(() => prisma.$disconnect());
