const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');

router.post('/request', guestController.createRequest);
router.get('/track/:token', guestController.trackRequest);
router.post('/review', guestController.submitReview);

module.exports = router;
