const prisma = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const generateShortId = (prefix) => {
    return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

// @route   POST /api/v1/guest/request
// @desc    Create a service request without login
const createRequest = async (req, res) => {
    try {
        const { name, phone, email, categoryName, location, description, latitude, longitude } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ success: false, message: "Name and Phone are required." });
        }

        const leadNo = generateShortId('L');
        const sessionToken = uuidv4();

        // 1. Resolve Category
        let categoryId = null;
        if (categoryName) {
            const cat = await prisma.category.findFirst({ where: { name: { contains: categoryName } } });
            if (cat) categoryId = cat.id;
        }

        if (!categoryId) {
            const fallback = await prisma.category.findFirst();
            categoryId = fallback?.id;
        }

        // 2. Create Lead as Guest
        const lead = await prisma.lead.create({
            data: {
                leadNo: leadNo,
                isGuest: true,
                guestName: name,
                guestPhone: phone,
                guestEmail: email || '',
                sessionToken: sessionToken,
                categoryId: categoryId,
                location: location || 'Not Specified',
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                description: description || '',
                status: 'OPEN'
            },
            include: { category: true }
        });

        // 3. Create Notification for Admin
        await prisma.notification.create({
            data: {
                userId: null,
                title: "New Guest Request",
                message: `Guest ${name} requested ${lead.category?.name || 'Service'} (#${leadNo}).`,
                type: 'LEAD'
            }
        });

        res.status(201).json({
            success: true,
            message: "Request submitted successfully!",
            sessionToken: sessionToken,
            trackingId: lead.id,
            displayId: leadNo
        });
    } catch (error) {
        console.error("Guest Request Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   GET /api/v1/guest/track/:token
// @desc    Track request status and get job details
const trackRequest = async (req, res) => {
    try {
        const { token } = req.params;

        // Try to find lead by token
        let lead = await prisma.lead.findUnique({
            where: { sessionToken: token },
            include: { category: true, job: { include: { worker: { select: { name: true, phone: true, rating: true } } } } }
        });

        // If lead not found (might be deleted or archived), try finding job directly by token
        if (!lead) {
            const job = await prisma.job.findFirst({
                where: { sessionToken: token },
                include: { worker: { select: { name: true, phone: true, rating: true } } }
            });

            if (!job) {
                return res.status(404).json({ success: false, message: "Invalid or expired session token." });
            }

            // Return job-based response if lead is missing but job exists
            return res.status(200).json({
                success: true,
                data: {
                    id: job.id,
                    displayId: job.jobNo,
                    status: job.status,
                    category: job.categoryName,
                    worker: job.worker ? {
                        name: job.worker.name,
                        phone: job.worker.phone,
                        rating: job.worker.rating
                    } : null,
                    jobId: job.id,
                    isReviewed: !!(await prisma.reviews.findUnique({ where: { job_id: job.id } })),
                    chatId: (await prisma.chats.findUnique({ where: { job_id: job.id } }))?.id
                }
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: lead.id,
                displayId: lead.leadNo,
                status: lead.job ? lead.job.status : lead.status,
                category: lead.category?.name,
                worker: lead.job?.worker ? {
                    name: lead.job.worker.name,
                    phone: lead.job.worker.phone,
                    rating: lead.job.worker.rating
                } : null,
                jobId: lead.job?.id,
                isReviewed: lead.job ? !!(await prisma.reviews.findUnique({ where: { job_id: lead.job.id } })) : false,
                chatId: lead.job ? (await prisma.chats.findUnique({ where: { job_id: lead.job.id } }))?.id : null
            }
        });
    } catch (error) {
        console.error("❌ [GUEST TRACK] Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   POST /api/v1/guest/review
const submitReview = async (req, res) => {
    try {
        const { sessionToken, rating, comment } = req.body;

        if (!sessionToken || !rating) {
            return res.status(400).json({ success: false, message: "Session token and rating are required." });
        }

        const job = await prisma.job.findFirst({
            where: { sessionToken: sessionToken, status: 'COMPLETED' }
        });

        if (!job) {
            console.warn("⚠️ [GUEST REVIEW] Job not found or not completed for token:", sessionToken);
            return res.status(400).json({ success: false, message: "Job not found or not completed." });
        }

        const existingReview = await prisma.reviews.findUnique({
            where: { job_id: job.id }
        });

        if (existingReview) {
            return res.status(400).json({ success: false, message: "Review already submitted for this job." });
        }

        const reviewId = uuidv4();
        const review = await prisma.reviews.create({
            data: {
                id: reviewId,
                job_id: job.id,
                rating: parseInt(rating),
                comment: comment || '',
                created_at: new Date()
            }
        });

        // Recalculate Worker Rating
        if (job.workerId) {
            try {
                const allReviews = await prisma.reviews.findMany({
                    where: { jobs: { workerId: job.workerId } }
                });

                if (allReviews.length > 0) {
                    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
                    const average = totalRating / allReviews.length;

                    await prisma.user.update({
                        where: { id: job.workerId },
                        data: { rating: parseFloat(average.toFixed(2)) }
                    });
                }
            } catch (ratingError) {
                console.error("❌ [GUEST REVIEW] Worker Rating Update Error:", ratingError);
                // We don't fail the whole request if rating update fails
            }
        }

        res.status(201).json({ success: true, message: "Review submitted! Thank you.", data: review });
    } catch (error) {
        console.error("❌ [GUEST REVIEW] Submit Review Error:", error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
};

module.exports = {
    createRequest,
    trackRequest,
    submitReview
};
