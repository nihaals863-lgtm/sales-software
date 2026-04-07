const prisma = require('../config/db');
const { filterJobPhotosForRole } = require('../utils/jobPhotoPolicy');

const generateShortId = (prefix) => {
    return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

// @route   GET /api/v1/jobs
// @desc    Get all jobs (ADMIN) or professional-specific jobs (WORKER)
const getJobs = async (req, res) => {
    try {
        const user = req.user; // null for guests
        let jobs;

        if (!user) {
            // Guest: return all jobs with limited public info
            jobs = await prisma.job.findMany({
                include: {
                    worker: { select: { name: true } },
                    photos: true,
                    chats: { select: { id: true } }
                },
                orderBy: { createdAt: 'desc' }
            });
        } else if (user.role === 'ADMIN') {
            jobs = await prisma.job.findMany({
                include: {
                    customer: { select: { name: true, phone: true } },
                    worker: { select: { name: true } },
                    photos: true,
                    estimate: true,
                    invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
                    inspection: true,
                    chats: { select: { id: true } },
                    lead: { include: { category: true, customer: { select: { name: true, phone: true } } } },
                },
                orderBy: { createdAt: 'desc' }
            });
        } else {
            // Workers only see their own assigned jobs
            jobs = await prisma.job.findMany({
                where: { workerId: user.id },
                include: {
                    customer: { select: { name: true, phone: true, email: true, address: true } },
                    worker: { select: { name: true } },
                    photos: true,
                    estimate: true,
                    invoices: { orderBy: { createdAt: 'desc' }, take: 1 },
                    inspection: true,
                    chats: { select: { id: true } },
                    lead: { include: { category: true, customer: { select: { name: true, phone: true } } } },
                },
                orderBy: { createdAt: 'desc' }
            });
        }

        const role = user?.role || 'GUEST';
        const uid = user?.id;

        const formattedJobs = jobs.map((j) => {
            const photos = filterJobPhotosForRole(j.photos, {
                role,
                userId: uid,
                jobWorkerId: j.workerId,
            });
            const invoice = j.invoices?.[0] || null;
            return {
                ...j,
                photos,
                invoice,
                customerName: j.customer?.name || j.guestName || 'Valued Customer',
                customerPhone: j.customer?.phone || j.guestPhone || null,
                customerEmail: j.customer?.email || j.guestEmail || '—',
                customerAddress: j.customer?.address || j.location || '—',
                workerName: j.worker?.name || 'Unassigned',
                chatId: j.chats?.id || null,
                displayId: j.jobNo || (j.id ? `JB-${String(j.id).slice(-4).toUpperCase()}` : 'JB-0000'),
            };
        });

        res.status(200).json({ success: true, count: jobs.length, data: formattedJobs });
    } catch (error) {
        console.error("❌ [API] getJobs error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const updateJob = async (req, res) => {
    try {
        const jobId = req.params.id;
        const user = req.user;
        const {
            customerName,
            phone,
            category,
            professionalId,
            location,
            description,
            status,
            date,
            time,
            latitude,
            longitude,
        } = req.body;

        // 1. Perform update in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // A. Get existing job first for Lead ID (Support both UUID and Short ID)
            const existingJob = await tx.job.findFirst({
                where: {
                    OR: [
                        { id: jobId },
                        { jobNo: jobId }
                    ]
                }
            });

            if (!existingJob) throw new Error("JOB_NOT_FOUND");

            if (user.role === 'WORKER') {
                if (existingJob.workerId !== user.id) {
                    throw new Error("NOT_AUTHORIZED");
                }
                if (professionalId && professionalId !== existingJob.workerId) {
                    throw new Error("NOT_AUTHORIZED");
                }
            }

            // Use the real UUID for the actual update
            const realJobId = existingJob.id;

            // B. If status is REJECTED/CANCELLED, set Lead back to OPEN
            if (status === 'REJECTED' || status === 'CANCELLED') {
                if (existingJob.leadId) {
                    await tx.lead.update({
                        where: { id: existingJob.leadId },
                        data: { status: 'OPEN' }
                    });
                }
            }

            // C. Build updates
            const updateData = {};
            if (user.role !== 'WORKER' && professionalId) updateData.workerId = professionalId;
            if (category) updateData.categoryName = category;
            if (location !== undefined && location !== null) updateData.location = String(location);
            if (description !== undefined) updateData.description = description;
            if (status) updateData.status = status;
            if (date) updateData.scheduledDate = new Date(date);
            if (time) updateData.scheduledTime = time;
            if (latitude !== undefined) {
                const v = latitude === null || latitude === '' ? null : parseFloat(latitude);
                updateData.latitude = Number.isFinite(v) ? v : null;
            }
            if (longitude !== undefined) {
                const v = longitude === null || longitude === '' ? null : parseFloat(longitude);
                updateData.longitude = Number.isFinite(v) ? v : null;
            }

            const updated = await tx.job.update({
                where: { id: realJobId },
                data: updateData
            });

            const leadSync = {};
            if (location !== undefined && location !== null) leadSync.location = String(location);
            if (latitude !== undefined) {
                const v = latitude === null || latitude === '' ? null : parseFloat(latitude);
                leadSync.latitude = Number.isFinite(v) ? v : null;
            }
            if (longitude !== undefined) {
                const v = longitude === null || longitude === '' ? null : parseFloat(longitude);
                leadSync.longitude = Number.isFinite(v) ? v : null;
            }
            if (existingJob.leadId && Object.keys(leadSync).length > 0) {
                await tx.lead.update({
                    where: { id: existingJob.leadId },
                    data: leadSync,
                });
            }

            return updated;
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        console.error("Job Update Error:", err);
        const code = err.message === "JOB_NOT_FOUND" ? 404 : err.message === "NOT_AUTHORIZED" ? 403 : 500;
        const msg =
            err.message === "JOB_NOT_FOUND"
                ? "Job not found"
                : err.message === "NOT_AUTHORIZED"
                  ? "Not authorized to update this job"
                  : "Job update failed";
        res.status(code).json({ success: false, message: msg });
    }
};

const submitCompliance = async (req, res) => {
    try {
        const param = req.params.id;
        const user = req.user;
        const existingJob = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] },
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (user.role === 'WORKER' && existingJob.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        const job = await prisma.job.update({
            where: { id: existingJob.id },
            data: { status: 'COMPLETED' }
        });
        res.status(200).json({ success: true, data: job });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Compliance submission failed' });
    }
};

const submitInspection = async (req, res) => {
    try {
        const param = req.params.id;
        const { notes, triageAnswers, signature } = req.body;
        const user = req.user;

        const existingJob = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] },
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (user.role === 'WORKER' && existingJob.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        const jobId = existingJob.id;

        const inspection = await prisma.jobInspection.upsert({
            where: { jobId },
            update: { notes: notes || '', triageAnswers, signature },
            create: { jobId, notes: notes || '', triageAnswers, signature }
        });

        res.status(200).json({ success: true, data: inspection });
    } catch (err) {
        console.error("Inspection Error:", err);
        res.status(500).json({ success: false, message: 'Inspection submission failed' });
    }
};

const createEstimate = async (req, res) => {
    try {
        const param = req.params.id;
        const user = req.user;
        const { amount, details, materials, laborHours, measurements } = req.body;

        const existingJob = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] },
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        if (user.role === 'WORKER' && existingJob.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        const jobId = existingJob.id;

        const estimate = await prisma.jobEstimate.upsert({
            where: { jobId: jobId },
            update: {
                amount: parseFloat(amount) || 0,
                details: details || '',
                materials,
                laborHours: parseFloat(laborHours) || null,
                measurements
            },
            create: {
                jobId: jobId,
                amount: parseFloat(amount) || 0,
                details: details || '',
                materials,
                laborHours: parseFloat(laborHours) || null,
                measurements
            }
        });

        await prisma.job.update({
            where: { id: jobId },
            data: { status: 'ESTIMATED' }
        });

        res.status(200).json({ success: true, data: estimate });
    } catch (err) {
        console.error("Estimate Error:", err);
        res.status(500).json({ success: false, message: 'Estimate creation failed' });
    }
};

const createInvoice = async (req, res) => {
    try {
        const param = req.params.id;
        const { amount, milestone, totalAmount } = req.body;

        // --- STRICT WORKFLOW CHECK ---
        const job = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] },
            include: { estimate: true }
        });

        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (req.user.role === 'WORKER' && job.workerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        const jobId = job.id;
        if (req.user.role !== 'ADMIN') {
            if (!job.estimate) return res.status(400).json({ success: false, message: 'Estimate is required before invoice' });
        }

        // Calculate amount based on milestone if totalAmount is provided
        let invoiceAmount = parseFloat(amount) || 0;
        if (totalAmount && milestone) {
            const total = parseFloat(totalAmount);
            if (milestone === 'DEPOSIT_15') invoiceAmount = total * 0.15;
            else if (milestone === 'PROGRESS_50') invoiceAmount = total * 0.50;
            else if (milestone === 'FINAL_35') invoiceAmount = total * 0.35;
        }

        const invoice = await prisma.jobInvoice.create({
            data: {
                jobId,
                totalAmount: parseFloat(totalAmount) || 0,
                amount: invoiceAmount,
                milestone: milestone || 'SINGLE',
                status: 'UNPAID'
            }
        });

        await prisma.job.update({
            where: { id: jobId },
            data: { status: 'INVOICED' }
        });

        res.status(200).json({ success: true, data: invoice });
    } catch (err) {
        console.error("Invoice Creation Error:", err);
        res.status(500).json({ success: false, message: 'Invoice creation failed' });
    }
};

const createJob = async (req, res) => {
    try {
        const { customerName, phone, category, professionalId, location, description, date, time, latitude, longitude } = req.body;

        // 1. Upsert Customer (find or create)
        let customer = await prisma.user.findFirst({
            where: { phone: phone }
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName,
                    phone: phone,
                    email: `${phone}@temp.com`,
                    role: 'CUSTOMER',
                    password: 'MOCK_PASSWORD'
                }
            });
        }

        const jobNo = generateShortId('J');

        // 2. Create Job with location coordinates
        const job = await prisma.job.create({
            data: {
                jobNo: jobNo,
                customerId: customer.id,
                workerId: professionalId,
                categoryName: category,
                location: location,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                description: description || '',
                status: 'SCHEDULED',
                scheduledDate: new Date(date),
                scheduledTime: time || '10:00 AM'
            },
            include: { customer: { select: { name: true } }, worker: { select: { name: true } } }
        });

        // 🟢 Create Chat for this Job (Manual Creation)
        const { v4: uuidv4 } = require('uuid');
        await prisma.chats.create({
            data: {
                id: uuidv4(),
                job_id: job.id,
                last_message: 'Manual Job Created',
                updated_at: new Date()
            }
        });

        res.status(201).json({ success: true, data: job });
    } catch (err) {
        console.error("Direct Job Creation Error:", err);
        res.status(500).json({ success: false, message: 'Job creation failed: ' + err.message });
    }
};

// @route   GET /api/v1/jobs/map
// @desc    Get all jobs with coordinates for map display (guest-accessible)
const getJobsForMap = async (req, res) => {
    try {
        const jobs = await prisma.job.findMany({
            select: {
                id: true,
                jobNo: true,
                categoryName: true,
                status: true,
                location: true,
                latitude: true,
                longitude: true,
                scheduledDate: true,
                workerId: true,
                customer: { select: { name: true } },
                guestName: true,
                worker: { select: { name: true } },
                chats: { select: { id: true } },
                photos: { orderBy: { createdAt: 'desc' }, take: 12 },
            },
            orderBy: { createdAt: 'desc' }
        });

        // Map is public-style: only guest-visible photos (cover thumb)
        const mapJobs = jobs.map((j) => {
            const publicPhotos = filterJobPhotosForRole(j.photos, {
                role: 'GUEST',
                userId: null,
                jobWorkerId: j.workerId,
            });
            return {
                id: j.id,
                jobNo: j.jobNo,
                category: j.categoryName,
                status: j.status,
                location: j.location,
                latitude: j.latitude,
                longitude: j.longitude,
                scheduledDate: j.scheduledDate,
                customerName: j.customer?.name || j.guestName || 'Customer',
                workerName: j.worker?.name || 'Unassigned',
                chatId: j.chats?.id || null,
                coverPhotoUrl: publicPhotos[0]?.url || null,
            };
        });

        res.status(200).json({ success: true, count: mapJobs.length, data: mapJobs });
    } catch (error) {
        console.error('getJobsForMap error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch map data' });
    }
};

// @route   GET /api/v1/jobs/:id
// @desc    Single job with photos filtered by role (admin / worker / guest)
const getJobById = async (req, res) => {
    try {
        const param = req.params.id;
        const user = req.user || { role: 'GUEST' };

        const job = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] },
            include: {
                customer: { select: { name: true, phone: true, email: true } },
                worker: { select: { name: true, phone: true } },
                photos: { orderBy: { createdAt: 'desc' } },
                estimate: true,
                inspection: true,
                chats: { select: { id: true } },
                lead: { select: { id: true, status: true, leadNo: true } },
            },
        });

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        if (user.role === 'WORKER' && job.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'You can only view jobs assigned to you' });
        }

        const photos = filterJobPhotosForRole(job.photos, {
            role: user.role,
            userId: user.id,
            jobWorkerId: job.workerId,
        });

        const data = {
            ...job,
            photos,
            customerName: job.customer?.name || job.guestName || 'Valued Customer',
            customerPhone: job.customer?.phone || job.guestPhone || null,
            workerName: job.worker?.name || 'Unassigned',
            chatId: job.chats?.id || null,
            displayId: job.jobNo || (job.id ? `JB-${String(job.id).slice(-4).toUpperCase()}` : 'JB-0000'),
        };

        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('getJobById error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch job' });
    }
};

const deleteJob = async (req, res) => {
    try {
        const jobId = req.params.id;
        const user = req.user;

        const job = await prisma.job.findUnique({ where: { id: jobId } });
        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        // Admin can delete anything; Worker can only delete their own assigned jobs
        if (user.role !== 'ADMIN' && job.workerId !== user.id) {
            console.warn(`⛔ [AUTH] Deletion blocked: User ${user.id} not authorized to delete job ${jobId}`);
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this job' });
        }

        await prisma.job.delete({ where: { id: jobId } });
        res.status(200).json({ success: true, message: 'Job deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Job deletion failed' });
    }
};

const getEstimates = async (req, res) => {
    try {
        const user = req.user;
        const workerFilter =
            user.role === 'WORKER' ? { job: { workerId: user.id } } : {};
        const estimates = await prisma.jobEstimate.findMany({
            where: workerFilter,
            include: {
                job: {
                    include: {
                        customer: { select: { name: true } },
                    },
                },
            },
        });
        const formatted = estimates.map((e) => ({
            ...e,
            customerName: e.job.customer?.name || e.job.guestName || 'Valued Customer',
            categoryName: e.job.categoryName,
        }));
        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch estimates' });
    }
};

const getJobHistory = async (req, res) => {
    try {
        const jobId = req.params.id;
        const user = req.user || { role: 'GUEST' };

        const job = await prisma.job.findFirst({
            where: { OR: [{ id: jobId }, { jobNo: jobId }] },
            include: {
                worker: true,
                estimate: true,
                photos: true,
                lead: true
            }
        });

        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

        if (user.role === 'WORKER' && job.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'You can only view history for your assigned jobs' });
        }

        const visiblePhotos = filterJobPhotosForRole(job.photos, {
            role: user.role,
            userId: user.id,
            jobWorkerId: job.workerId
        });

        const history = [];

        // 1. Job Created / Lead Source
        history.push({
            id: 'h1',
            title: 'Job Created',
            sub: `Lead converted to job for ${job.categoryName}.`,
            time: job.createdAt,
            icon: 'add-circle',
            color: '#4A5568',
            bg: '#EDF2F7'
        });

        // 2. Assignment
        if (job.workerId) {
            history.push({
                id: 'h2',
                title: 'Job Assigned',
                sub: `Professional ${job.worker?.name || 'Assigned'} selected.`,
                time: job.updatedAt,
                icon: 'person',
                color: '#ED8936',
                bg: '#FFFAF0'
            });
        }

        // 3. Status Updates (Simplified)
        if (
            job.status === 'ACCEPTED' ||
            job.status === 'IN_PROGRESS' ||
            job.status === 'COMPLETED' ||
            job.status === 'ESTIMATED'
        ) {
            history.push({
                id: 'h3',
                title: `Status: ${job.status}`,
                sub: `Job current progress state updated.`,
                time: job.updatedAt,
                icon: 'sync',
                color: '#3182CE',
                bg: '#EBF8FF'
            });
        }

        // 4. Estimate
        if (job.estimate) {
            history.push({
                id: 'h4',
                title: 'Estimate Created',
                sub: `Quote of $${job.estimate.amount} generated.`,
                time: job.estimate.createdAt,
                icon: 'document-text',
                color: '#805AD5',
                bg: '#F5F3FF'
            });
        }

        // 5. Photos (count only what this role can see)
        if (visiblePhotos.length > 0) {
            history.push({
                id: 'h5',
                title: 'Photos Uploaded',
                sub: `${visiblePhotos.length} site documentation photo(s) added.`,
                time: visiblePhotos[0].createdAt,
                icon: 'camera',
                color: '#38A169',
                bg: '#F0FFF4'
            });
        }

        // Sort by time descending
        history.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.status(200).json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch job history' });
    }
};

const addJobPhoto = async (req, res) => {
    try {
        const param = req.params.id;
        const { url, type } = req.body;
        const user = req.user;

        if (!url) return res.status(400).json({ success: false, message: 'Photo URL is required' });
        if (!user || (user.role !== 'ADMIN' && user.role !== 'WORKER')) {
            return res.status(403).json({ success: false, message: 'Only staff can upload job photos' });
        }

        const existingJob = await prisma.job.findFirst({
            where: { OR: [{ id: param }, { jobNo: param }] }
        });

        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        if (user.role === 'WORKER' && existingJob.workerId !== user.id) {
            return res.status(403).json({ success: false, message: 'You can only add photos to jobs assigned to you' });
        }

        let photoType = user.role === 'WORKER' ? 'PROGRESS' : 'SITE';
        if (type && typeof type === 'string' && type.length <= 32) {
            photoType = type.toUpperCase();
        }
        if (user.role === 'WORKER' && ['ADMIN_ONLY', 'INTERNAL'].includes(photoType)) {
            photoType = 'PROGRESS';
        }

        const photo = await prisma.jobPhoto.create({
            data: {
                jobId: existingJob.id,
                url,
                type: photoType,
            }
        });

        res.status(201).json({ success: true, data: photo });
    } catch (err) {
        console.error("Add Job Photo Error:", err);
        res.status(500).json({ success: false, message: 'Failed to add photo' });
    }
};

const getInvoices = async (req, res) => {
    try {
        const user = req.user;
        const workerFilter =
            user.role === 'WORKER' ? { job: { workerId: user.id } } : {};
        const invoices = await prisma.jobInvoice.findMany({
            where: workerFilter,
            include: {
                job: {
                    include: {
                        customer: { select: { name: true } },
                    },
                },
            },
        });
        const formatted = invoices.map((i) => ({
            ...i,
            customerName: i.job.customer?.name || i.job.guestName || 'Valued Customer',
            categoryName: i.job.categoryName,
        }));
        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
};

module.exports = {
    getJobs,
    getJobById,
    updateJob,
    submitCompliance,
    submitInspection,
    createEstimate,
    createInvoice,
    createJob,
    deleteJob,
    getEstimates,
    getInvoices,
    getJobHistory,
    addJobPhoto,
    getJobsForMap
};
