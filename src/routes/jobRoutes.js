const express = require('express');
const router = express.Router();
const { getJobs, updateJob, submitCompliance, createEstimate, createInvoice, deleteJob, createJob } = require('../controllers/jobController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// @route   GET/POST /api/v1/jobs
router.get('/', protect, getJobs);
router.post('/', protect, authorize('ADMIN', 'WORKER'), createJob);

// @route   PATCH /api/v1/jobs/:id
router.patch('/:id', protect, updateJob);

// @route   DELETE /api/v1/jobs/:id
router.delete('/:id', protect, authorize('ADMIN'), deleteJob);

// @route   POST /api/v1/jobs/:id/compliance
router.post('/:id/compliance', protect, submitCompliance);

// @route   POST /api/v1/jobs/:id/estimate
router.post('/:id/estimate', protect, createEstimate);

// @route   POST /api/v1/jobs/:id/invoice
router.post('/:id/invoice', protect, createInvoice);

module.exports = router;
