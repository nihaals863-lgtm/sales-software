const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const prisma = require("./db");
const { getJwtSecret } = require("./env");
const { v4: uuidv4 } = require('uuid');

let io;

async function authorizeRoomAccess(socket, roomId) {
    if (!roomId) return { ok: false };
    const job = await prisma.job.findUnique({ where: { id: roomId } });
    if (!job) return { ok: false };
    if (socket.guest) {
        if (socket.guest.jobId !== job.id || job.sessionToken !== socket.guest.token) {
            return { ok: false };
        }
        return { ok: true, job };
    }
    if (socket.user && job.workerId === socket.user.id) {
        return { ok: true, job };
    }
    return { ok: false };
}

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    console.log("✅ Socket.io initialized");

    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        const sessionToken = socket.handshake.auth.sessionToken || socket.handshake.query.sessionToken;

        if (token) {
            try {
                const decoded = jwt.verify(token, getJwtSecret());
                const user = await prisma.user.findUnique({ where: { id: decoded.id } });
                if (user) {
                    socket.user = user;
                    return next();
                }
            } catch (err) {
                console.error("Socket JWT error:", err);
            }
        }

        if (sessionToken) {
            const lead = await prisma.lead.findUnique({
                where: { sessionToken: sessionToken },
                include: { job: true }
            });
            if (lead) {
                socket.guest = {
                    token: sessionToken,
                    leadId: lead.id,
                    jobId: lead.job?.id,
                    name: lead.guestName || "Customer"
                };
                return next();
            }

            const job = await prisma.job.findFirst({
                where: { sessionToken: sessionToken }
            });
            if (job) {
                socket.guest = {
                    token: sessionToken,
                    leadId: job.leadId,
                    jobId: job.id,
                    name: job.guestName || "Customer"
                };
                return next();
            }
        }

        return next(new Error("Authentication failed: No valid token or session provided"));
    });

    io.on("connection", (socket) => {
        const label = socket.user ? socket.user.name : (socket.guest ? `Guest (${socket.guest.name})` : "?");
        console.log(`🔌 Connection: ${socket.id} | Identity: ${label}`);

        if (socket.user?.role === 'ADMIN') {
            socket.join('admin_live_map');
        }

        const doJoin = async (roomId, labelEvt) => {
            const { ok } = await authorizeRoomAccess(socket, roomId);
            if (!ok) {
                console.warn(`🚫 Unauthorized ${labelEvt} to room ${roomId}`);
                return;
            }
            socket.join(roomId);
            console.log(`👥 ${socket.id} joined room: ${roomId} (${labelEvt})`);
        };

        socket.on("join_chat", (jobId) => doJoin(jobId, "join_chat"));
        socket.on("join_room", (requestId) => doJoin(requestId, "join_room"));

        socket.on("send_message", async (data) => {
            const { jobId, text, chatId, requestId } = data || {};
            const roomId = requestId || jobId;
            if (!text || !chatId || !roomId) return;

            try {
                const job = await prisma.job.findUnique({ where: { id: roomId } });
                if (!job) return;

                const chat = await prisma.chats.findUnique({ where: { id: chatId } });
                if (!chat || chat.job_id !== job.id) return;

                let allowed = false;
                if (socket.user && socket.user.id === job.workerId) allowed = true;
                if (socket.guest && socket.guest.jobId === job.id && job.sessionToken === socket.guest.token) {
                    allowed = true;
                }
                if (!allowed) {
                    console.warn(`🚫 send_message denied for socket ${socket.id}`);
                    return;
                }

                const message = await prisma.messages.create({
                    data: {
                        id: uuidv4(),
                        chat_id: chatId,
                        sender_id: socket.user ? socket.user.id : null,
                        isGuest: !!socket.guest,
                        text: text,
                        created_at: new Date()
                    }
                });

                await prisma.chats.update({
                    where: { id: chatId },
                    data: {
                        last_message: text,
                        updated_at: new Date()
                    }
                });

                const payload = {
                    ...message,
                    senderName: socket.user ? socket.user.name : "Customer"
                };

                io.to(roomId).emit("new_message", payload);
                io.to(roomId).emit("receive_message", payload);

                console.log(`✉️ Message from ${socket.user ? socket.user.name : "Guest"} in ${roomId}: ${text}`);

            } catch (err) {
                console.error("❌ Socket message processing error:", err);
            }
        });

        socket.on("location_update", async (data) => {
            if (!socket.user || socket.user.role !== 'WORKER') return;
            const lat = Number(data?.lat);
            const lng = Number(data?.lng);
            const jobId = data?.jobId;
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;

            try {
                const updated = await prisma.user.update({
                    where: { id: socket.user.id },
                    data: {
                        lat,
                        lng,
                        isTrackingEnabled: true
                    }
                });

                const payload = {
                    professionalId: updated.id,
                    lat: updated.lat,
                    lng: updated.lng,
                    updatedAt: updated.updatedAt,
                    trackingEnabled: !!updated.isTrackingEnabled,
                    jobId: jobId || null
                };

                io.to('admin_live_map').emit('update_on_map', payload);
                if (jobId) {
                    io.to(jobId).emit('professional_location_update', payload);
                }

                // Also stream to each active job room for customer/guest live tracking.
                const activeJobs = await prisma.job.findMany({
                    where: {
                        workerId: updated.id,
                        status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
                    },
                    select: { id: true }
                });
                activeJobs.forEach((j) => {
                    const roomPayload = { ...payload, jobId: j.id };
                    io.to(j.id).emit('professional_live_location', roomPayload);
                    io.to(j.id).emit('professional_location_update', roomPayload);
                });
            } catch (err) {
                console.error('❌ Socket location update error:', err.message);
            }
        });

        socket.on("professional_arrived", async (data) => {
            if (!socket.user || socket.user.role !== 'WORKER') return;
            const jobId = data?.jobId;
            if (!jobId) return;
            const payload = {
                jobId,
                professionalId: socket.user.id,
                arrivedAt: new Date().toISOString()
            };
            io.to(jobId).emit('professional_arrived', payload);
        });

        socket.on("disconnect", () => {
            console.log(`🔌 Disconnected: ${socket.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

module.exports = { initSocket, getIO };
