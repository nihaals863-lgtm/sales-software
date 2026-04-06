const prisma = require('./src/config/db');

async function debug() {
    const token = 'b1b77332-ad5b-45a3-881b-140175876bd3';
    const lead = await prisma.lead.findFirst({ where: { sessionToken: token } });
    console.log('Lead found:', !!lead);
    
    if (!lead) {
        // Check if it's in Job directly
        const job = await prisma.job.findFirst({ where: { sessionToken: token } });
        console.log('Job found directly:', !!job);
    }
}

debug();
