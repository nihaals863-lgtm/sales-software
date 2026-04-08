require('./config/env');
const express = require('express');
const cors = require('cors');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');
const jobRoutes = require('./routes/jobRoutes');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const locationRoutes = require('./routes/locationRoutes');
const professionalRequestRoutes = require('./routes/professionalRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const guestRoutes = require('./routes/guestRoutes');
const adminOpsRoutes = require('./routes/adminOpsRoutes');
const workerOpsRoutes = require('./routes/workerOpsRoutes');

const app = express();

// --- Production & Railway Config ---
app.set('trust proxy', 1);

// ✅ Allowed Origins (Production + Local)
const allowedOrigins = [
    'http://sales1-software.kiaansoftware.com',
    'https://sales1-software.kiaansoftware.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

// ✅ CORS Middleware (Secure Setup)
app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (mobile apps, postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error('CORS not allowed: ' + origin));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
}));

// Optional: Handle preflight requests explicitly
app.options('*', cors());

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes Registration
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/professional-requests', professionalRequestRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/guest', guestRoutes);
app.use('/api/v1/admin', adminOpsRoutes);
app.use('/api/v1/worker', workerOpsRoutes);

// Health Check Route
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running perfectly!'
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 ERROR:', err.message);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: err.message
    });
});

module.exports = app;
