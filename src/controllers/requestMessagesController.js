const prisma = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function resolveJobAndChat(requestId) {
    if (!requestId) return null;
    let job = await prisma.job.findUnique({ where: { id: requestId } });
    if (!job) {
        job = await prisma.job.findFirst({ where: { leadId: requestId } });
    }
    if (!job) return null;
    const chat = await prisma.chats.findUnique({ where: { job_id: job.id } });
    return { job, chat };
}

function canAccessJobChat(req, job, sessionToken) {
    const token = sessionToken || req.body?.sessionToken || req.query?.sessionToken;
    const isWorker = req.user?.id && job.workerId === req.user.id;
    const isGuestAuth = token && job.sessionToken === token;
    return { allowed: isWorker || isGuestAuth, isWorker, sessionToken: token };
}

function normalizeMessage(jobId, row) {
    const senderType = row.isGuest ? 'customer' : 'professional';
    return {
        id: row.id,
        requestId: jobId,
        senderType,
        message: row.text,
        timestamp: row.created_at,
        text: row.text,
        isGuest: row.isGuest,
        sender_id: row.sender_id,
        created_at: row.created_at,
    };
}

// GET /api/v1/messages/:requestId — job id or lead id
const getMessagesByRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const sessionToken = req.query.sessionToken;
        const ctx = await resolveJobAndChat(requestId);

        if (!ctx?.chat) {
            return res.status(404).json({ success: false, message: 'No chat for this request yet.' });
        }

        const { job, chat } = ctx;
        const { allowed } = canAccessJobChat(req, job, sessionToken);
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
        }

        const rows = await prisma.messages.findMany({
            where: { chat_id: chat.id },
            orderBy: { created_at: 'asc' },
            include: { users: { select: { name: true, role: true } } },
        });

        const messages = rows.map((m) => normalizeMessage(job.id, m));

        res.status(200).json({
            success: true,
            data: {
                jobId: job.id,
                chatId: chat.id,
                leadId: job.leadId,
                messages,
            },
        });
    } catch (error) {
        console.error('❌ [MESSAGES] getMessagesByRequest:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/v1/messages — body: { requestId, text, sessionToken? }
const postMessageByRequest = async (req, res) => {
    try {
        const { requestId, text, sessionToken: bodyToken } = req.body;
        if (!requestId || !text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: 'requestId and text are required' });
        }

        const ctx = await resolveJobAndChat(requestId);
        if (!ctx?.chat) {
            return res.status(404).json({ success: false, message: 'No chat for this request yet.' });
        }

        const { job, chat } = ctx;
        const { allowed, isWorker, sessionToken } = canAccessJobChat(req, job, bodyToken);
        if (!allowed) {
            return res.status(403).json({ success: false, message: 'Not authorized for this chat' });
        }

        const message = await prisma.messages.create({
            data: {
                id: uuidv4(),
                chat_id: chat.id,
                sender_id: isWorker ? req.user.id : null,
                isGuest: !isWorker,
                text: String(text).trim(),
                created_at: new Date(),
            },
        });

        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            const payload = {
                ...message,
                senderName: isWorker ? req.user.name : 'Customer',
            };
            io.to(job.id).emit('new_message', payload);
            io.to(job.id).emit('receive_message', payload);
        } catch (socketError) {
            console.error('⚠️ Socket emit failed (request messages):', socketError.message);
        }

        const msgText = text.toLowerCase();
        let newStatus = null;
        if (msgText.includes('on the way')) newStatus = 'ON_THE_WAY';
        else if (msgText.includes('start work') || msgText.includes('started')) newStatus = 'STARTED';
        else if (msgText.includes('completed') || msgText.includes('finished') || msgText.includes('job done')) {
            newStatus = 'COMPLETED';
        }

        let lastMessageText = text;
        if (newStatus) {
            await prisma.job.update({
                where: { id: job.id },
                data: { status: newStatus },
            });
            lastMessageText = `[Update: ${newStatus}] ${text}`;
        }

        await prisma.chats.update({
            where: { id: chat.id },
            data: {
                last_message: lastMessageText,
                updated_at: new Date(),
            },
        });

        res.status(201).json({
            success: true,
            data: normalizeMessage(job.id, message),
            jobStatusUpdated: !!newStatus,
        });
    } catch (error) {
        console.error('❌ [MESSAGES] postMessageByRequest:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getMessagesByRequest,
    postMessageByRequest,
    resolveJobAndChat,
};
