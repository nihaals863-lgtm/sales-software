const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getReviews } = require('../controllers/reviewController');

router.use(protect);

router.get('/', getReviews);

module.exports = router;
