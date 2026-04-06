const prisma = require('../config/db');

// @route   GET /api/v1/categories
const getCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            include: {
                _count: {
                    select: { workers: true, leads: true }
                }
            }
        });

        const formatted = categories.map(c => ({
            id: c.id,
            name: c.name,
            icon: c.icon || 'Package',
            professionals: c._count.workers || 0,
            activeLeads: c._count.leads || 0,
            status: 'Active'
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Fetch categories failed' });
    }
};

// @route   POST /api/v1/categories
const createCategory = async (req, res) => {
    try {
        const { name, icon } = req.body;
        // Search by First (since name is not a unique field in schema)
        const exists = await prisma.category.findFirst({ where: { name: name.trim() } });
        if (exists) return res.status(400).json({ success: false, message: 'Category already exists' });

        const cat = await prisma.category.create({
            data: { name: name.trim(), icon: icon || 'Package' }
        });
        res.status(201).json({ success: true, data: cat });
    } catch (err) {
        console.error("❌ [API] createCategory Error:", err);
        res.status(500).json({ success: false, message: 'Category creation failed: ' + err.message });
    }
};

// @route   PUT /api/v1/categories/:id
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon } = req.body;

        const cat = await prisma.category.update({
            where: { id },
            data: { name: name?.trim(), icon }
        });
        res.status(200).json({ success: true, data: cat });
    } catch (err) {
        console.error("❌ [API] updateCategory Error:", err);
        res.status(500).json({ success: false, message: 'Update failed: ' + err.message });
    }
};

// @route   DELETE /api/v1/categories/:id
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.category.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Category removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Deletion failed (might have linked leads/workers)' });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
