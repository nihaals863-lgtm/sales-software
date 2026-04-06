require('./config/env');
const app = require('./app');
const prisma = require('./config/db');

const PORT = process.env.PORT || 4000;

const startServer = async () => {
    try {
        await prisma.$connect();
        console.log('✅ Connected to MySQL Database successfully via Prisma');

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🌍 API Base URL: http://localhost:${PORT}/api/v1`);
        });

        // Initialize Socket.io
        require('./config/socket').initSocket(server);

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use. Please kill the existing process.`);
            } else {
                console.error('❌ Server startup error:', err);
            }
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};

startServer();
