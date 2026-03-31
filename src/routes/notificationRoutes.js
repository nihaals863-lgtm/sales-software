const express = require('express');
const router = express.Router();
const { getNotifications, markRead, clearNotifications } = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect); // Ensure all notification endpoints are protected

router.get('/', getNotifications);
router.patch('/:id/read', markRead);
router.delete('/clear', clearNotifications);

module.exports = router;
