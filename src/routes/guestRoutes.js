const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');

router.get('/nearby', guestController.getNearby);
router.post('/request', guestController.createRequest);
router.get('/track/:token', guestController.trackRequest);
router.get('/live/:token', guestController.getLiveTracking);
router.post('/review', guestController.submitReview);

module.exports = router;
