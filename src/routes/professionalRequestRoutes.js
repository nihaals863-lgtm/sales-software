const express = require('express');
const router = express.Router();
const {
    submitRequest,
    getAllRequests,
    approveRequest,
    rejectRequest
} = require('../controllers/professionalRequestController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// Public route for professional submission from website
router.post('/', submitRequest);

// Private routes for admin management
router.get('/', protect, authorize('ADMIN'), getAllRequests);
router.put('/:id/approve', protect, authorize('ADMIN'), approveRequest);
router.delete('/:id/reject', protect, authorize('ADMIN'), rejectRequest);

module.exports = router;
