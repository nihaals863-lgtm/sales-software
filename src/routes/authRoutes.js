const express = require('express');
const router = express.Router();
const { registerUser, loginUser, resetPassword, generateInvite, registerWorkerByInvite } = require('../controllers/authController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

// ----------------------------------------------------
// Base URL for these routes: /api/v1/auth
// ----------------------------------------------------

// @route   POST /api/v1/auth/register
router.post('/register', registerUser);

// @route   POST /api/v1/auth/register-invited
router.post('/register-invited', registerWorkerByInvite);

// @route   POST /api/v1/auth/login
router.post('/login', loginUser);

// @route   POST /api/v1/auth/reset-password
router.post('/reset-password', resetPassword);

// @route   POST /api/v1/auth/invite (Admin Only)
router.post('/invite', protect, adminOnly, generateInvite);

module.exports = router;
