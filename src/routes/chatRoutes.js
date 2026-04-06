const express = require('express');
const router = express.Router();
const { protect, optionalProtect } = require('../middlewares/authMiddleware');
const { getChats, getMessages, sendMessage, getDirectMessages, sendDirectMessage } = require('../controllers/chatController');

// Standard protected user routes
router.get('/', protect, getChats);
router.get('/direct/:otherUserId', protect, getDirectMessages);
router.post('/direct/:otherUserId', protect, sendDirectMessage);

// Job-specific chat routes (Allow Guest via optionalProtect + sessionToken logic in controller)
router.get('/:chatId/messages', optionalProtect, getMessages);
router.post('/:chatId/messages', optionalProtect, sendMessage);

module.exports = router;
