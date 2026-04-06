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

const app = express();

// --- Production & Railway Config ---
app.set('trust proxy', 1); // For accurate IP tracking behind load balancers

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for photo data-urls
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

// Health Check Route
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ success: true, message: 'Server is running perfectly!' });
});

// Global Error Handler (Fallback)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Something went wrong!', error: err.message });
});

module.exports = app;
