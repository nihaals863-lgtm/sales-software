const prisma = require('../config/db');

const generateShortId = (prefix) => {
    return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

// @route   GET /api/v1/jobs
// @desc    Get all jobs (ADMIN) or professional-specific jobs (WORKER)
const getJobs = async (req, res) => {
    try {
        const user = req.user;
        let jobs;

        if (user.role === 'ADMIN') {
            jobs = await prisma.job.findMany({
                include: { customer: { select: { name: true } }, worker: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            });
        } else {
            // Workers only see their own assigned jobs
            jobs = await prisma.job.findMany({
                where: { workerId: user.id },
                include: { customer: { select: { name: true } }, worker: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            });
        }

        const formattedJobs = jobs.map(j => ({
            ...j,
            customerName: j.customer?.name || 'Valued Customer',
            workerName: j.worker?.name || 'Unassigned',
            displayId: j.jobNo || `JB-${j.id.slice(-4).toUpperCase()}`
        }));

        res.status(200).json({ success: true, count: jobs.length, data: formattedJobs });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const updateJob = async (req, res) => {
    try {
        const jobId = req.params.id;
        const { customerName, phone, category, professionalId, location, description, status, date, time } = req.body;

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
            if (professionalId) updateData.workerId = professionalId;
            if (category) updateData.categoryName = category;
            if (location) updateData.location = location;
            if (description !== undefined) updateData.description = description;
            if (status) updateData.status = status;
            if (date) updateData.scheduledDate = new Date(date);
            if (time) updateData.scheduledTime = time;

            return await tx.job.update({
                where: { id: realJobId },
                data: updateData
            });
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        console.error("Job Update Error:", err);
        res.status(err.message === "JOB_NOT_FOUND" ? 404 : 500).json({ 
            success: false, 
            message: err.message === 'JOB_NOT_FOUND' ? 'Job not found' : 'Job update failed' 
        });
    }
};

const submitCompliance = async (req, res) => {
    try {
        const jobId = req.params.id;
        const job = await prisma.job.update({
            where: { id: jobId },
            data: { status: 'COMPLETED' }
        });
        res.status(200).json({ success: true, data: job });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Compliance submission failed' });
    }
};

const createEstimate = async (req, res) => {
    try {
        const jobId = req.params.id;
        const { amount, details } = req.body;

        // --- STRICT WORKFLOW CHECK ---
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { photos: true, inspection: true }
        });

        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (job.photos.length === 0) return res.status(400).json({ success: false, message: 'Photos are required before estimate' });
        if (!job.inspection) return res.status(400).json({ success: false, message: 'Inspection is required before estimate' });

        const estimate = await prisma.jobEstimate.create({
            data: {
                jobId: jobId,
                amount: parseFloat(amount) || 0,
                details: details || 'Standard quote setup'
            }
        });
        
        await prisma.job.update({
            where: { id: jobId },
            data: { status: 'ESTIMATED' }
        });

        res.status(200).json({ success: true, data: estimate });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Estimate creation failed' });
    }
};

const createInvoice = async (req, res) => {
    try {
        const jobId = req.params.id;
        const { amount } = req.body;

        // --- STRICT WORKFLOW CHECK ---
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { estimate: true }
        });

        if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
        if (!job.estimate) return res.status(400).json({ success: false, message: 'Estimate is required before invoice' });
        
        const invoice = await prisma.jobInvoice.create({
            data: {
                jobId: jobId,
                amount: parseFloat(amount) || 0,
                status: 'UNPAID'
            }
        });
        
        await prisma.job.update({
            where: { id: jobId },
            data: { status: 'INVOICED' }
        });

        res.status(200).json({ success: true, data: invoice });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Invoice creation failed' });
    }
};

const createJob = async (req, res) => {
    try {
        const { customerName, phone, category, professionalId, location, description, date, time } = req.body;

        // 1. Upsert Customer (find or create)
        let customer = await prisma.user.findFirst({
            where: { phone: phone }
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName,
                    phone: phone,
                    email: `${phone}@temp.com`, // Required in schema but we might only have phone
                    role: 'CUSTOMER',
                    password: 'MOCK_PASSWORD'
                }
            });
        }

        const jobNo = generateShortId('J');

        // 2. Create Job directly
        const job = await prisma.job.create({
            data: {
                jobId: jobNo, // Ensure schema compatibility if this field name differs
                jobNo: jobNo, 
                customerId: customer.id,
                workerId: professionalId,
                categoryName: category,
                location: location,
                description: description || '',
                status: 'SCHEDULED',
                scheduledDate: new Date(date),
                scheduledTime: time || '10:00 AM'
            },
            include: { customer: { select: { name: true } }, worker: { select: { name: true } } }
        });

        res.status(201).json({ success: true, data: job });
    } catch (err) {
        console.error("Direct Job Creation Error:", err);
        res.status(500).json({ success: false, message: 'Job creation failed: ' + err.message });
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

module.exports = {
    getJobs,
    updateJob,
    submitCompliance,
    createEstimate,
    createInvoice,
    createJob,
    deleteJob
};
