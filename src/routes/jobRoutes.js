const express = require('express');
const router = express.Router();
const { getJobs, updateJob, submitCompliance, submitInspection, createEstimate, createInvoice, deleteJob, createJob, getEstimates, getInvoices, getJobHistory, addJobPhoto, getJobsForMap } = require('../controllers/jobController');
const { protect, optionalProtect, authorize } = require('../middlewares/authMiddleware');

// @route   GET /POST /api/v1/jobs
router.get('/', optionalProtect, authorize('ADMIN', 'WORKER', 'GUEST'), getJobs);
router.post('/', protect, authorize('ADMIN', 'WORKER'), createJob);

// @route   GET /api/v1/jobs/map  — all jobs with coordinates for APK map (guest ok)
router.get('/map', optionalProtect, getJobsForMap);

// @route   GET /api/v1/jobs/estimates
router.get('/estimates', protect, authorize('ADMIN'), getEstimates);

// @route   GET /api/v1/jobs/invoices
router.get('/invoices', protect, authorize('ADMIN'), getInvoices);

// @route   GET /api/v1/jobs/:id/history
router.get('/:id/history', optionalProtect, getJobHistory);

// @route   PATCH /api/v1/jobs/:id
router.patch('/:id', protect, updateJob);

// @route   DELETE /api/v1/jobs/:id
router.delete('/:id', protect, authorize('ADMIN'), deleteJob);

// @route   POST /api/v1/jobs/:id/compliance
router.post('/:id/compliance', protect, submitCompliance);

// @route   POST /api/v1/jobs/:id/inspection
router.post('/:id/inspection', protect, submitInspection);

// @route   POST /api/v1/jobs/:id/estimate
router.post('/:id/estimate', protect, createEstimate);

// @route   POST /api/v1/jobs/:id/invoice
router.post('/:id/invoice', protect, createInvoice);
router.post('/:id/photos', protect, addJobPhoto);

module.exports = router;
