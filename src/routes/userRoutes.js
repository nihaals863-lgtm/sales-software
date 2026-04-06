const express = require('express');
const router = express.Router();
const {
    getProfessionals,
    updateLocation,
    getProfessionalsLocations,
    toggleAvailability,
    createProfessional,
    updateProfessional,
    deleteProfessional,
    getProfile,
    updateProfile,
    getDashboardStats
} = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// @route   GET /api/v1/users/workers
router.get('/workers', protect, getProfessionals);

// Profile
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);

// Admin Professional Management
router.post('/workers', protect, authorize('ADMIN', 'WORKER'), createProfessional);
router.put('/workers/:id', protect, authorize('ADMIN', 'WORKER'), updateProfessional);
router.delete('/workers/:id', protect, authorize('ADMIN', 'WORKER'), deleteProfessional);

// @route   PATCH /api/v1/users/location
router.patch('/location', protect, updateLocation);
// @route   POST /api/v1/users/update-location
router.post('/update-location', protect, authorize('WORKER', 'ADMIN'), updateLocation);
// @route   GET /api/v1/users/professionals-locations
router.get('/professionals-locations', protect, authorize('ADMIN'), getProfessionalsLocations);

// @route   PATCH /api/v1/users/status
router.patch('/status', protect, toggleAvailability);

// @route   GET /api/v1/users/dashboard-stats
router.get('/dashboard-stats', protect, getDashboardStats);

module.exports = router;
