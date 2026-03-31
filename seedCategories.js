
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const categories = [
        { name: 'Cleaning', icon: 'Cleaning' },
        { name: 'Gardening', icon: 'Gardening' },
        { name: 'Electrical', icon: 'Zap' },
        { name: 'Plumbing', icon: 'Droplets' },
        { name: 'Carpentry', icon: 'Hammer' },
        { name: 'Painting', icon: 'Paintbrush' }
    ];

    for (const cat of categories) {
        await prisma.category.upsert({
            where: { name: cat.name },
            update: { icon: cat.icon },
            create: { name: cat.name, icon: cat.icon }
        });
    }
    console.log('✅ Categories seeded!');
}

main().finally(() => prisma.$disconnect());
