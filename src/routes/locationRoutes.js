const express = require('express');
const router = express.Router();
const { getLocations, createLocation, deleteLocation } = require('../controllers/locationController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/', protect, getLocations);
router.post('/', protect, authorize('ADMIN', 'WORKER'), createLocation);
router.delete('/:id', protect, authorize('ADMIN', 'WORKER'), deleteLocation);

module.exports = router;
