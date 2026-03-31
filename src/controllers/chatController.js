const prisma = require('../config/db');

// @route   GET /api/v1/chats
// @desc    Get all chats for the professional/worker
const getChats = async (req, res) => {
    try {
        const chats = await prisma.chat.findMany({
            where: {
                job: {
                    workerId: req.user.id
                }
            },
            include: {
                job: {
                    include: {
                        customer: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                isAvailable: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // Map for easier UI consumption
        const formatted = chats.map(chat => ({
            id: chat.id,
            jobId: chat.jobId,
            customerName: chat.job.customer.name,
            lastMessage: chat.lastMessage,
            time: chat.updatedAt,
            status: chat.job.customer.isAvailable ? 'online' : 'offline',
            service: chat.job.categoryName,
            leadId: chat.job.jobNo // Use jobNo as a friendly reference
        }));

        res.status(200).json({ success: true, count: formatted.length, data: formatted });
    } catch (error) {
        console.error("Fetch Chats Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/v1/chats/:chatId/messages
// @desc    Get messages for a specific chat
const getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;

        // Verify professional belongs to this chat
        const chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: { job: true }
        });

        if (!chat || chat.job.workerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
        }

        const messages = await prisma.message.findMany({
            where: { chatId },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { name: true, role: true } } }
        });

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Fetch Messages Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/v1/chats/:chatId/messages
// @desc    Send a message (Supports passing jobId if chat not created yet)
const sendMessage = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { text } = req.body;

        let targetChatId = chatId;

        // 1. Try to find existing chat
        let chat = await prisma.chat.findUnique({
            where: { id: chatId },
            include: { job: true }
        });

        // 2. If not found, check if it's a jobId (some legacy or virtual ids might pass jobId)
        if (!chat) {
             const job = await prisma.job.findUnique({
                 where: { id: chatId },
                 include: { chat: true }
             });

             if (job) {
                 if (job.chat) {
                     chat = job.chat;
                     targetChatId = chat.id;
                 } else {
                     // Auto-create chat if missing
                     chat = await prisma.chat.create({
                         data: { jobId: job.id, lastMessage: '' },
                         include: { job: true }
                     });
                     targetChatId = chat.id;
                 }
             }
        }

        if (!chat || chat.job.workerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized for this chat or conversation not found' });
        }

        const message = await prisma.message.create({
            data: {
                chatId: targetChatId,
                senderId: req.user.id,
                text
            }
        });

        // Update chat's last message and updatedAt
        await prisma.chat.update({
            where: { id: targetChatId },
            data: { lastMessage: text }
        });

        res.status(201).json({ success: true, data: message });
    } catch (error) {
        console.error("Send Message Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getChats,
    getMessages,
    sendMessage
};
