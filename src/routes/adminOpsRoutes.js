const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/authMiddleware');
const {
    getAdminTaxPayroll,
    getAdminInventorySnapshot,
    getAdminMarketingFeed,
} = require('../controllers/adminOpsController');

router.get('/tax-payroll', protect, authorize('ADMIN'), getAdminTaxPayroll);
router.get('/inventory-snapshot', protect, authorize('ADMIN'), getAdminInventorySnapshot);
router.get('/marketing-feed', protect, authorize('ADMIN'), getAdminMarketingFeed);

module.exports = router;
