const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const counts = {
            users: await prisma.user.count(),
            leads: await prisma.lead.count(),
            jobs: await prisma.job.count(),
            categories: await prisma.category.count(),
            locations: await prisma.location.count(),
            plans: await prisma.subscriptionPlan.count(),
            requests: await prisma.professionalRequest.count()
        };
        console.log('Database Counts:', JSON.stringify(counts, null, 2));
        
        const categories = await prisma.category.findMany();
        console.log('Categories:', JSON.stringify(categories, null, 2));

        const leads = await prisma.lead.findMany({ take: 5 });
        console.log('Sample Leads:', JSON.stringify(leads, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
