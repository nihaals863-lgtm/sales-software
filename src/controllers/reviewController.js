const prisma = require('../config/db');

function resolveCustomerDisplayName(job) {
    if (!job) return 'Guest';
    const c = job.customer?.name?.trim();
    if (c) return c;
    const jGuest = job.guestName?.trim();
    if (jGuest) return jGuest;
    const lGuest = job.lead?.guestName?.trim();
    if (lGuest) return lGuest;
    const email = (job.lead?.guestEmail || job.customer?.email || '').trim();
    if (email && email.includes('@')) {
        const local = email.split('@')[0];
        const pretty = local.replace(/[._-]+/g, ' ').trim();
        if (pretty) return pretty.slice(0, 48);
    }
    const phone = (job.guestPhone || job.lead?.guestPhone || '').trim();
    if (phone) return `Guest · ${phone}`;
    return 'Guest';
}

function resolveServiceName(job) {
    if (!job) return '—';
    const fromJob = (job.categoryName || '').trim();
    if (fromJob) return fromJob;
    const fromLead = (job.lead?.category?.name || '').trim();
    if (fromLead) return fromLead;
    return '—';
}

function resolveLocationName(job) {
    if (!job) return '—';
    const fromJob = (job.location || '').trim();
    if (fromJob) return fromJob;
    const fromLead = (job.lead?.location || '').trim();
    if (fromLead) return fromLead;
    return '—';
}

// @route   GET /api/v1/reviews
// @desc    Get all reviews for the professional/worker
const getReviews = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'ADMIN';

        const reviews = await prisma.reviews.findMany({
            where: isAdmin
                ? {}
                : {
                      jobs: {
                          workerId: req.user.id,
                      },
                  },
            include: {
                jobs: {
                    include: {
                        lead: {
                            include: {
                                category: {
                                    select: { name: true },
                                },
                            },
                        },
                        customer: {
                            select: {
                                name: true,
                                email: true,
                            },
                        },
                        worker: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
            take: isAdmin ? 300 : 100,
        });

        const formatted = (reviews || []).map((rev) => ({
            id: rev.id,
            customerName: resolveCustomerDisplayName(rev.jobs),
            author: resolveCustomerDisplayName(rev.jobs),
            workerName: rev.jobs?.worker?.name || 'Worker',
            role: 'Customer',
            rating: rev.rating,
            comment: rev.comment,
            serviceName: resolveServiceName(rev.jobs),
            serviceCategory: resolveServiceName(rev.jobs),
            locationName: resolveLocationName(rev.jobs),
            location: resolveLocationName(rev.jobs),
            date: rev.created_at || null,
            verified: true,
            jobNo: rev.jobs?.jobNo || '—',
        }));

        const distribution = [5, 4, 3, 2, 1].map((stars) => {
            const count = formatted.filter((r) => r.rating === stars).length;
            const percentage = formatted.length > 0 ? (count / formatted.length) * 100 : 0;
            return { stars, percentage };
        });

        const totalRating = formatted.reduce((acc, curr) => acc + curr.rating, 0);
        const averageRating = formatted.length > 0 ? (totalRating / formatted.length).toFixed(1) : '0.0';

        res.status(200).json({
            success: true,
            count: formatted.length,
            data: formatted,
            averageRating: parseFloat(averageRating),
            distribution,
        });
    } catch (error) {
        console.error('❌ [REVIEWS] Fetch Reviews Error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

const submitReview = async (req, res) => {
    try {
        const { jobId, rating, comment } = req.body;
        const { v4: uuidv4 } = require('uuid');

        if (!jobId || !rating) {
            return res.status(400).json({ success: false, message: 'Job ID and rating are required' });
        }

        // Validate Job
        const job = await prisma.job.findUnique({
            where: { id: jobId }
        });

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job record not found.' });
        }

        // Check if job is completed (UI only shows review if completed, but we check here too)
        if (job.status !== 'COMPLETED') {
            return res.status(400).json({ success: false, message: 'Reviews can only be submitted for completed jobs.' });
        }

        // Prevent Duplicate Reviews
        const existingReview = await prisma.reviews.findUnique({
            where: { job_id: jobId }
        });

        if (existingReview) {
             return res.status(400).json({ success: false, message: 'Review already submitted for this job.' });
        }

        // Create the Review
        const review = await prisma.reviews.create({
            data: {
                id: uuidv4(),
                job_id: jobId,
                rating: parseInt(rating),
                comment: comment || '',
                created_at: new Date()
            }
        });

        // Recalculate Worker Average Rating
        const allWorkerReviews = await prisma.reviews.findMany({
            where: {
                jobs: {
                    workerId: job.workerId
                }
            }
        });

        const totalRating = allWorkerReviews.reduce((sum, rev) => sum + rev.rating, 0);
        const average = totalRating / allWorkerReviews.length;

        await prisma.user.update({
            where: { id: job.workerId },
            data: { rating: average }
        });

        res.status(201).json({ success: true, message: 'Review submitted! Thank you.', data: review });

    } catch (error) {
        console.error("Submit Review Error:", error);
        res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
};

module.exports = {
    getReviews,
    submitReview
};
