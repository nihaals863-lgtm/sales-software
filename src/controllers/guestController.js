const prisma = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { haversineKm } = require('../utils/geo');

const generateShortId = (prefix) => {
    return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

// @route   GET /api/v1/guest/nearby?latitude=&longitude=&radiusKm=&include=workers,jobs
// @desc    Browse workers (and optional job pins) near a point — no auth (guest / customer preview)
const getNearby = async (req, res) => {
    try {
        const lat = parseFloat(req.query.latitude);
        const lon = parseFloat(req.query.longitude);
        const radiusKm = Math.min(Math.max(parseFloat(req.query.radiusKm) || 25, 1), 200);
        const includeRaw = req.query.include || 'workers,jobs';
        const include = String(includeRaw)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        if (Number.isNaN(lat) || Number.isNaN(lon)) {
            return res.status(400).json({
                success: false,
                message: 'Query params latitude and longitude are required (decimal degrees).'
            });
        }

        const workers = [];
        if (include.length === 0 || include.includes('workers')) {
            const workersRaw = await prisma.user.findMany({
                where: {
                    role: 'WORKER',
                    isAvailable: true,
                    lat: { not: null },
                    lng: { not: null }
                },
                select: {
                    id: true,
                    name: true,
                    businessName: true,
                    rating: true,
                    lat: true,
                    lng: true,
                    city: true,
                    serviceRadius: true,
                    categories: { include: { category: { select: { name: true } } } }
                }
            });

            for (const w of workersRaw) {
                const d = haversineKm(lat, lon, w.lat, w.lng);
                if (d <= radiusKm) {
                    workers.push({
                        id: w.id,
                        name: w.name,
                        businessName: w.businessName,
                        rating: w.rating,
                        latitude: w.lat,
                        longitude: w.lng,
                        city: w.city,
                        serviceRadiusKm: w.serviceRadius,
                        distanceKm: Math.round(d * 100) / 100,
                        categories: w.categories.map((c) => c.category.name)
                    });
                }
            }
            workers.sort((a, b) => a.distanceKm - b.distanceKm);
        }

        const jobs = [];
        if (include.includes('jobs')) {
            const jobsRaw = await prisma.job.findMany({
                where: {
                    latitude: { not: null },
                    longitude: { not: null }
                },
                select: {
                    id: true,
                    jobNo: true,
                    categoryName: true,
                    status: true,
                    location: true,
                    latitude: true,
                    longitude: true,
                    worker: { select: { name: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: 150
            });

            for (const j of jobsRaw) {
                const d = haversineKm(lat, lon, j.latitude, j.longitude);
                if (d <= radiusKm) {
                    jobs.push({
                        id: j.id,
                        jobNo: j.jobNo,
                        category: j.categoryName,
                        status: j.status,
                        location: j.location,
                        latitude: j.latitude,
                        longitude: j.longitude,
                        workerName: j.worker?.name || null,
                        distanceKm: Math.round(d * 100) / 100
                    });
                }
            }
            jobs.sort((a, b) => a.distanceKm - b.distanceKm);
        }

        res.status(200).json({
            success: true,
            data: {
                center: { latitude: lat, longitude: lon },
                radiusKm,
                workers,
                jobs
            }
        });
    } catch (error) {
        console.error('Guest nearby error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// @route   POST /api/v1/guest/request
// @desc    Create a service request without login (optional preferredWorkerId = nearby pro for admin routing)
const createRequest = async (req, res) => {
    try {
        const {
            name,
            phone,
            email,
            categoryName,
            location,
            description,
            latitude,
            longitude,
            preferredWorkerId
        } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ success: false, message: "Name and Phone are required." });
        }

        let resolvedPreferredId = null;
        if (preferredWorkerId) {
            const pro = await prisma.user.findFirst({
                where: { id: preferredWorkerId, role: 'WORKER' }
            });
            if (pro) {
                resolvedPreferredId = pro.id;
            }
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

        const latNum = latitude != null && latitude !== '' ? parseFloat(latitude) : null;
        const lngNum = longitude != null && longitude !== '' ? parseFloat(longitude) : null;

        // 2. Create Lead as Guest
        const leadData = {
            leadNo: leadNo,
            isGuest: true,
            guestName: name,
            guestPhone: phone,
            guestEmail: email || '',
            sessionToken: sessionToken,
            categoryId: categoryId,
            location: location || 'Not Specified',
            latitude: latNum != null && !Number.isNaN(latNum) ? latNum : null,
            longitude: lngNum != null && !Number.isNaN(lngNum) ? lngNum : null,
            description: description || '',
            status: 'OPEN'
        };

        // Runtime Prisma client may not expose all Lead relations (e.g. preferredWorker/category).
        // Create using scalar fields only for maximum compatibility across generated clients.
        const lead = await prisma.lead.create({ data: leadData });

        const category = categoryId
            ? await prisma.category.findUnique({
                where: { id: categoryId },
                select: { name: true }
            })
            : null;
        const preferredWorker = resolvedPreferredId
            ? await prisma.user.findUnique({
                where: { id: resolvedPreferredId },
                select: { id: true, name: true }
            })
            : null;

        // 3. Create Notification for Admin
        const pref =
            preferredWorker != null
                ? ` Suggested professional: ${preferredWorker.name}.`
                : '';
        await prisma.notification.create({
            data: {
                userId: null,
                title: 'New Guest Request',
                message: `Guest ${name} requested ${category?.name || 'Service'} (#${leadNo}).${pref}`,
                type: 'LEAD'
            }
        });

        res.status(201).json({
            success: true,
            message: 'Request submitted successfully!',
            sessionToken: sessionToken,
            trackingId: lead.id,
            displayId: leadNo,
            preferredWorkerId: preferredWorker?.id || null
        });
    } catch (error) {
        console.error('Guest Request Error:', error);
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
            include: { category: true, job: { include: { worker: { select: { name: true, phone: true, rating: true, lat: true, lng: true } } } } }
        });

        // If lead not found (might be deleted or archived), try finding job directly by token
        if (!lead) {
            const job = await prisma.job.findFirst({
                where: { sessionToken: token },
                include: { worker: { select: { name: true, phone: true, rating: true, lat: true, lng: true } } }
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
                        rating: job.worker.rating,
                        liveLat: job.worker.lat,
                        liveLng: job.worker.lng
                    } : null,
                    customerLat: job.latitude ?? null,
                    customerLng: job.longitude ?? null,
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
                    rating: lead.job.worker.rating,
                    liveLat: lead.job.worker.lat,
                    liveLng: lead.job.worker.lng
                } : null,
                customerLat: lead.latitude ?? lead.job?.latitude ?? null,
                customerLng: lead.longitude ?? lead.job?.longitude ?? null,
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
    getNearby,
    createRequest,
    trackRequest,
    submitReview
};
