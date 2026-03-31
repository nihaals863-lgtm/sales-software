const express = require('express');
const router = express.Router();
const { 
    createLead, 
    getLeads, 
    assignLead, 
    deleteLead, 
    updateLead, 
    getCategories, 
    getStats, 
    createCategory, 
    updateCategory, 
    deleteCategory, 
    getLocations, 
    getSubscriptions, 
    enrollInPlan, 
    getActiveSubscriptions, 
    createSubscriptionPlan, 
    updateSubscriptionPlan, 
    deleteSubscriptionPlan,
    getUpgradeRequests,
    approveUpgradeRequest,
    rejectUpgradeRequest
} = require('../controllers/leadController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// @route   GET /api/v1/leads/stats
router.get('/stats', protect, getStats);

// @route   GET /api/v1/leads/locations
router.get('/locations', getLocations);

// @route   GET /api/v1/leads/subscriptions
router.get('/subscriptions', getSubscriptions);
router.get('/subscriptions/active', getActiveSubscriptions);
router.post('/subscriptions', protect, authorize('ADMIN', 'WORKER'), createSubscriptionPlan);
router.put('/subscriptions/:id', protect, authorize('ADMIN', 'WORKER'), updateSubscriptionPlan);
router.delete('/subscriptions/:id', protect, authorize('ADMIN', 'WORKER'), deleteSubscriptionPlan);

// Enrollment & Upgrade Requests
router.post('/subscriptions/enroll', protect, authorize('ADMIN', 'WORKER'), enrollInPlan);
router.get('/subscriptions/upgrade-requests', protect, authorize('ADMIN'), getUpgradeRequests);
router.put('/subscriptions/upgrade-requests/:id/approve', protect, authorize('ADMIN'), approveUpgradeRequest);
router.put('/subscriptions/upgrade-requests/:id/reject', protect, authorize('ADMIN'), rejectUpgradeRequest);

// @route   GET /api/v1/leads/categories
router.get('/categories', getCategories);

// @route   POST /api/v1/leads/categories
router.post('/categories', protect, authorize('ADMIN'), createCategory);

// @route   PUT /api/v1/leads/categories/:id
router.put('/categories/:id', protect, authorize('ADMIN'), updateCategory);

// @route   DELETE /api/v1/leads/categories/:id
router.delete('/categories/:id', protect, authorize('ADMIN'), deleteCategory);

// @route   POST /api/v1/leads
router.post('/', createLead);

// @route   GET /api/v1/leads
router.get('/', protect, authorize('ADMIN', 'WORKER'), getLeads);

// @route   PATCH /api/v1/leads/:id/assign
router.patch('/:id/assign', protect, authorize('WORKER', 'ADMIN'), assignLead);

// @route   PUT /api/v1/leads/:id
router.put('/:id', protect, authorize('ADMIN'), updateLead);

// @route   DELETE /api/v1/leads/:id
router.delete('/:id', protect, authorize('ADMIN', 'WORKER'), deleteLead);

module.exports = router;
