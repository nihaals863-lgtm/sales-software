const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getChats, getMessages, sendMessage } = require('../controllers/chatController');

router.use(protect);

router.get('/', getChats);
router.get('/:chatId/messages', getMessages);
router.post('/:chatId/messages', sendMessage);

module.exports = router;
