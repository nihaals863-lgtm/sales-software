const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const { getWorkerPayoutsSnapshot, getWorkerMaterialsSnapshot } = require('../controllers/workerOpsController');

router.get('/payouts-snapshot', protect, authorize('WORKER'), getWorkerPayoutsSnapshot);
router.get('/materials-snapshot', protect, authorize('WORKER'), getWorkerMaterialsSnapshot);

module.exports = router;
