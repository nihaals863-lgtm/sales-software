const prisma = require('./src/config/db');

async function check() {
    const chats = await prisma.chats.findMany({
        take: 5
    });
    console.log('Sample Chats:', chats.map(c => c.id));
}

check();
