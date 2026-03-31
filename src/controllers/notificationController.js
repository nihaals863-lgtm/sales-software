const prisma = require('../config/db');

// @route   GET /api/v1/notifications
// @desc    Get current user's notifications
const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        let whereClause = {};
        if (role === 'ADMIN') {
            // Admins see notifications assigned to them OR where userId is null (system/admin-wide)
            whereClause = {
                OR: [
                    { userId: userId },
                    { userId: null }
                ]
            };
        } else {
            // Professionals only see notifications assigned to them
            whereClause = { userId: userId };
        }

        const notifications = await prisma.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: 20 // Limit to last 20
        });

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error("Fetch Notifications Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @route   PATCH /api/v1/notifications/:id/read
// @desc    Mark a notification as read
const markRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const notification = await prisma.notification.findUnique({ where: { id } });
        if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

        // Security check: Only owner or admin can mark as read
        if (notification.userId && notification.userId !== userId && req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        await prisma.notification.update({
            where: { id },
            data: { isRead: true }
        });

        res.status(200).json({ success: true, message: "Marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @route   DELETE /api/v1/notifications/clear
// @desc    Clear all notifications for the user
const clearNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        if (role === 'ADMIN') {
            await prisma.notification.deleteMany({
                where: {
                    OR: [
                        { userId: userId },
                        { userId: null }
                    ]
                }
            });
        } else {
            await prisma.notification.deleteMany({ where: { userId: userId } });
        }

        res.status(200).json({ success: true, message: "Notifications cleared" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getNotifications,
    markRead,
    clearNotifications
};
