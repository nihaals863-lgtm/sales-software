
const prisma = require('./src/config/db');
const fs = require('fs');

async function test() {
    try {
        console.log("Running direct prisma findMany test...");
        const leads = await prisma.lead.findMany({
            orderBy: { createdAt: 'desc' }
        });
        console.log("Found Leads:", leads.length);
    } catch (error) {
        console.error("DIAGNOSTIC CRASH!");
        console.error("Error Message:", error.message);
        console.error("Stack Trace:", error.stack);
        fs.writeFileSync('diagnostic_crash.txt', error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

test();
