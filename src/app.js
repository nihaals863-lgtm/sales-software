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

// --- Production Config ---
app.set('trust proxy', 1);

// ✅ CORS (simple & stable)
app.use(cors({
    origin: [
        'http://sales1-software.kiaansoftware.com',
        'https://sales1-software.kiaansoftware.com'
    ],
    credentials: true
}));

// ✅ Manual headers + preflight fix (IMPORTANT)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://sales1-software.kiaansoftware.com');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200); // 👈 preflight fix
    }

    next();
});

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
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

// Health Check
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
