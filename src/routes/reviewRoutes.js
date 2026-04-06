const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getReviews, submitReview } = require('../controllers/reviewController');

// Public review submission from website
router.post('/submit', submitReview);

// Protected reviews fetch for workers
router.use(protect);

router.get('/', getReviews);

module.exports = router;
