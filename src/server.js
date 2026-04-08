require('./config/env');
const app = require('./app');
const prisma = require('./config/db');

const PORT = process.env.PORT || 4000;

const startServer = async () => {
    try {
        console.log("🔍 Checking environment variables...");
        console.log("PORT FROM ENV:", process.env.PORT);

        // ✅ Connect DB (but don't block forever)
        await prisma.$connect();
        console.log('✅ Connected to MySQL Database successfully via Prisma');

        // ✅ Start server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`🌍 API Base URL: http://localhost:${PORT}/api/v1`);
        });

        // ✅ Initialize Socket.io safely
        try {
            require('./config/socket').initSocket(server);
            console.log('✅ Socket.io initialized');
        } catch (err) {
            console.error('❌ Socket init failed:', err.message);
        }

        // ✅ Handle server errors
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use.`);
            } else {
                console.error('❌ Server startup error:', err);
            }
            process.exit(1);
        });

        // ✅ Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // ✅ Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            console.error('❌ Uncaught Exception:', err);
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
};

startServer();
