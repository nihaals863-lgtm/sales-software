const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const pros = await prisma.user.findMany({
        where: { role: 'WORKER' },
        select: { id: true, name: true, address: true, city: true, pincode: true }
    });
    console.log(JSON.stringify(pros, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
