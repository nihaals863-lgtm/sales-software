require('dotenv').config(); // Load environment variables FIRST
const app = require('./app');
const prisma = require('./config/db');

const PORT = process.env.PORT || 4000;

// Connect to Database and start server
async function startServer() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to MySQL Database successfully via Prisma');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🌍 API Base URL: http://localhost:${PORT}/api/v1`);
        });
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

startServer();
