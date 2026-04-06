const express = require('express');
const router = express.Router();
const { optionalProtect } = require('../middlewares/authMiddleware');
const { getMessagesByRequest, postMessageByRequest } = require('../controllers/requestMessagesController');

router.post('/', optionalProtect, postMessageByRequest);
router.get('/:requestId', optionalProtect, getMessagesByRequest);

module.exports = router;
