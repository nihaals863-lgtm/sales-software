const express = require('express');
const router = express.Router();
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// @route   GET /api/v1/categories
router.get('/', protect, getCategories);

// Only Admin can manage categories
router.post('/', protect, authorize('ADMIN', 'WORKER'), createCategory);
router.put('/:id', protect, authorize('ADMIN', 'WORKER'), updateCategory);
router.delete('/:id', protect, authorize('ADMIN', 'WORKER'), deleteCategory);

module.exports = router;
