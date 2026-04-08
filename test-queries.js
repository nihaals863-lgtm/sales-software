const prisma = require('./src/config/db');

async function test() {
    try {
        console.log('Testing reviews.findMany...');
        const reviews = await prisma.reviews.findMany({
            where: { jobs: { workerId: 'some-id' } },
            include: { jobs: { include: { customer: true } } }
        });
        console.log('Reviews success');
    } catch (e) {
        console.error('Reviews Error:', e.message);
    }

    try {
        console.log('Testing chats.findMany...');
        const chats = await prisma.chats.findMany({
            where: { jobs: { workerId: 'some-id' } },
            include: { jobs: { include: { customer: true } } }
        });
        console.log('Chats success');
    } catch (e) {
        console.error('Chats Error:', e.message);
    }
}

test();
