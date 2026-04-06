const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

// @route   GET /api/v1/users/professionals
// @desc    Get all users with role 'WORKER'
const getProfessionals = async (req, res) => {
    try {
        const workers = await prisma.user.findMany({
            where: { role: 'WORKER' },
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        // Fetch additional stats for each worker
        const flattened = await Promise.all(workers.map(async (w) => {
            const [activeCount, completedCount] = await Promise.all([
                prisma.job.count({ where: { workerId: w.id, status: { not: 'COMPLETED' } } }),
                prisma.job.count({ where: { workerId: w.id, status: 'COMPLETED' } })
            ]);

            return {
                ...w,
                category: w.categories[0]?.category?.name || 'General',
                onlineStatus: w.isAvailable ? 'Online' : 'Offline',
                lastUpdate: w.updatedAt,
                activeJobsCount: activeCount,
                completedJobsCount: completedCount,
                earnings: completedCount * 150, // Real calculation based on completions
                rating: w.rating || 0,
                lastLocation: w.lat && w.lng ? { lat: w.lat, lng: w.lng } : null,
                trackingEnabled: !!(w.isTrackingEnabled ?? (w.lat && w.lng))
            };
        }));

        res.status(200).json({ success: true, count: flattened.length, data: flattened });
    } catch (error) {
        console.error("Fetch Professionals Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const updateLocation = async (req, res) => {
    try {
        const { lat, lng } = req.body;
        const userId = req.user.id;
        const numLat = Number(lat);
        const numLng = Number(lng);

        if (Number.isNaN(numLat) || Number.isNaN(numLng)) {
            return res.status(400).json({ success: false, message: 'lat and lng must be valid numbers' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                lat: numLat,
                lng: numLng,
                isTrackingEnabled: true
            }
        });

        // Realtime broadcast for admin live map
        try {
            const { getIO } = require('../config/socket');
            const io = getIO();
            io.to('admin_live_map').emit('update_on_map', {
                professionalId: user.id,
                lat: user.lat,
                lng: user.lng,
                updatedAt: user.updatedAt,
                trackingEnabled: !!user.isTrackingEnabled
            });
        } catch (socketErr) {
            console.warn('Socket location emit skipped:', socketErr.message);
        }

        res.status(200).json({ success: true, data: { lat: user.lat, lng: user.lng, updatedAt: user.updatedAt } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Location update failed' });
    }
};

const getProfessionalsLocations = async (req, res) => {
    try {
        const workers = await prisma.user.findMany({
            where: { role: 'WORKER' },
            include: {
                categories: { include: { category: true } },
                jobs: {
                    where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] } },
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                    include: {
                        lead: {
                            select: {
                                latitude: true,
                                longitude: true,
                                location: true,
                                guestName: true
                            }
                        },
                        customer: { select: { name: true } }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        const data = workers.map((w) => {
            const activeJob = w.jobs?.[0] || null;
            const customerLat = activeJob?.lead?.latitude ?? activeJob?.latitude ?? null;
            const customerLng = activeJob?.lead?.longitude ?? activeJob?.longitude ?? null;
            return {
                id: w.id,
                name: w.name,
                category: w.categories?.[0]?.category?.name || 'General',
                isAvailable: w.isAvailable,
                onlineStatus: w.isAvailable ? 'Online' : 'Offline',
                trackingEnabled: !!(w.isTrackingEnabled ?? false),
                lat: w.lat,
                lng: w.lng,
                updatedAt: w.updatedAt,
                currentJob: activeJob
                    ? {
                        id: activeJob.id,
                        jobNo: activeJob.jobNo,
                        location: activeJob.location || activeJob.lead?.location || null,
                        customerName: activeJob.customer?.name || activeJob.guestName || activeJob.lead?.guestName || 'Customer',
                        customerLat,
                        customerLng
                    }
                    : null
            };
        });

        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Fetch professional locations error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch professional locations' });
    }
};

const toggleAvailability = async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const userId = req.user.id;
        const user = await prisma.user.update({
            where: { id: userId },
            data: { isAvailable }
        });
        res.status(200).json({ success: true, data: { isAvailable: user.isAvailable } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Status update failed' });
    }
};

const createProfessional = async (req, res) => {
    try {
        const { name, email, phone, password, category, address, city, state, pincode } = req.body;

        const emailInUse = await prisma.user.findUnique({ where: { email } });
        if (emailInUse) return res.status(400).json({ success: false, message: 'A professional with this email already exists!' });

        const phoneInUse = await prisma.user.findUnique({ where: { phone } });
        if (phoneInUse) return res.status(400).json({ success: false, message: 'A professional with this phone number already exists!' });

        // 1. Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 2. Create User as WORKER
        const user = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                role: 'WORKER',
                address,
                city,
                state,
                pincode,
                rating: parseFloat(req.body.rating || 0)
            }
        });

        // 2. Map Category (find or create)
        let cat = await prisma.category.findFirst({ where: { name: category } });
        if (!cat) {
            cat = await prisma.category.create({ data: { name: category } });
        }

        // 3. Link Worker to Category
        await prisma.workerCategory.create({
            data: {
                userId: user.id,
                categoryId: cat.id
            }
        });

        // 4. Auto-register Location for Dashboard
        if (city) {
            const cityName = city.trim();
            const existingLoc = await prisma.location.findFirst({
                where: { city: { contains: cityName } }
            });
            if (!existingLoc && cityName) {
                await prisma.location.create({
                    data: {
                        name: cityName,
                        city: cityName,
                        state: state || '',
                        country: 'USA',
                        status: 'Active'
                    }
                });
                console.log(`[AUTO-LOCATION] New service area registered: ${cityName}`);
            }
        }

        res.status(201).json({ success: true, data: user });
    } catch (err) {
        console.error("Create Pro Error:", err);
        res.status(500).json({ success: false, message: 'Creation failed: ' + err.message });
    }
};

const updateProfessional = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, category, status, password } = req.body;

        console.log(`[ADMIN] Updating Professional: ${id}`, req.body);

        // 1. Validate Target exists
        const worker = await prisma.user.findUnique({ where: { id } });
        if (!worker) {
            return res.status(404).json({ success: false, message: `Worker with ID ${id} not found` });
        }

        // 2. Perform updates in a transaction for data integrity
        const result = await prisma.$transaction(async (tx) => {
            const dataToUpdate = {};
            if (name) dataToUpdate.name = name;

            // Map status to isAvailable field in DB
            if (status !== undefined) {
                dataToUpdate.isAvailable = (status === 'Active' || status === 'Available');
            }

            // Only update email if it changed AND isn't taken by another user
            if (email && email !== worker.email) {
                const emailInUse = await tx.user.findUnique({ where: { email } });
                if (emailInUse) throw new Error('EMAIL_EXISTS');
                dataToUpdate.email = email;
            }

            // Only update phone if it changed AND isn't taken by another user
            if (phone && phone !== worker.phone) {
                const phoneInUse = await tx.user.findUnique({ where: { phone } });
                if (phoneInUse) throw new Error('PHONE_EXISTS');
                dataToUpdate.phone = phone;
            }

            // New: Support for physical address update
            const { address, city, state, pincode, adminCommission, workerCommission } = req.body;
            if (address !== undefined) dataToUpdate.address = address;
            if (city !== undefined) dataToUpdate.city = city;
            if (state !== undefined) dataToUpdate.state = state;
            if (pincode !== undefined) dataToUpdate.pincode = pincode;
            // Performance Rating update (if editing a professional)
            if (req.body.rating !== undefined) dataToUpdate.rating = parseFloat(req.body.rating || 0);

            // New: Support for Commission adjustment
            if (adminCommission !== undefined) dataToUpdate.adminCommission = parseInt(adminCommission);
            if (workerCommission !== undefined) dataToUpdate.workerCommission = parseInt(workerCommission);

            // ─── NEW: Support for Password Update ───
            if (password && password.length > 0) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                dataToUpdate.password = hashedPassword;
            }

            // Perform the update
            const updatedUser = await tx.user.update({
                where: { id },
                data: dataToUpdate
            });

            // Handle Category linking manually (upsert requires unique field)
            if (category) {
                let cat = await tx.category.findFirst({ where: { name: category } });
                if (!cat) {
                    cat = await tx.category.create({ data: { name: category } });
                }
                
                // Clear and Re-link (MySQL schema has a unique constraint on userId, categoryId)
                await tx.workerCategory.deleteMany({ where: { userId: id } });
                await tx.workerCategory.create({
                    data: { userId: id, categoryId: cat.id }
                });
            }

            return updatedUser;
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        console.error("DEBUG - Full Update Error:", err);

        // Handle specific custom errors or Prisma Unique Constraint Errors
        if (err.message === 'EMAIL_EXISTS') {
            return res.status(400).json({ success: false, message: 'This email is already registered to another user.' });
        }
        if (err.message === 'PHONE_EXISTS') {
            return res.status(400).json({ success: false, message: 'This phone number is already registered to another user.' });
        }

        if (err.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: `The ${err.meta?.target} provided already exists.`
            });
        }

        res.status(500).json({
            success: false,
            message: 'Database Error: ' + err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

const deleteProfessional = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Professional removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Deletion failed' });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                plan: true,
                categories: { include: { category: true } },
                upgradeRequests: {
                    where: { status: 'PENDING' },
                    include: { plan: true }
                }
            }
        });
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Profile fetch failed' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const {
            name, email, phone, address, city, state, pincode,
            isAvailable, password, businessName, bio,
            availability, experience, serviceRadius, location,
            trackingEnabled, isTrackingEnabled
        } = req.body;

        const dataToUpdate = {
            name, email, phone, address,
            city: city || (location ? location.split(',')[0]?.trim() : undefined),
            state: state || (location ? location.split(',')[1]?.trim() : undefined),
            pincode, isAvailable, businessName, bio,
            availability, experience,
            serviceRadius: serviceRadius ? parseInt(serviceRadius) : undefined,
            isTrackingEnabled: typeof isTrackingEnabled === 'boolean'
                ? isTrackingEnabled
                : (typeof trackingEnabled === 'boolean' ? trackingEnabled : undefined)
        };

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            dataToUpdate.password = await bcrypt.hash(password, salt);
        }

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: dataToUpdate
        });
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Profile update failed: ' + err.message });
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        if (user.role === 'ADMIN') {
            const [totalLeads, completedJobs, totalPros, leadsToday] = await Promise.all([
                prisma.lead.count(),
                prisma.job.count({ where: { status: 'COMPLETED' } }),
                prisma.user.count({ where: { role: 'WORKER' } }),
                prisma.lead.count({ where: { createdAt: { gte: todayStart } } })
            ]);

            const conversionRate = totalLeads > 0 ? ((completedJobs / totalLeads) * 100).toFixed(1) : 0;

            // 2. Real Financials from Invoices
            const revenueResult = await prisma.jobInvoice.aggregate({
                _sum: { amount: true },
                where: { status: 'PAID' }
            });
            const totalRevenue = revenueResult._sum.amount || 0;

            const platformFees = totalRevenue * 0.15; // 15% Platform fee as per docs
            const workerRevenue = totalRevenue * 0.85;

            // 3. Top Performers
            const topWorkers = await prisma.job.groupBy({
                by: ['workerId'],
                _count: { id: true },
                where: { status: 'COMPLETED' },
                orderBy: { _count: { id: 'desc' } },
                take: 3
            });

            const workerDetails = await prisma.user.findMany({
                where: { id: { in: topWorkers.map(w => w.workerId) } },
                select: { id: true, name: true, role: true }
            });

            const performers = workerDetails.map(w => ({
                id: w.id,
                name: w.name,
                jobs: topWorkers.find(tw => tw.workerId === w.id)?._count.id || 0,
                role: w.role
            }));

            // 4. Recent Activity (Latest 5 records across systems)
            const [recentJobs, recentInvoices, recentUsers] = await Promise.all([
                prisma.job.findMany({ take: 3, orderBy: { updatedAt: 'desc' }, include: { customer: true, worker: true } }),
                prisma.jobInvoice.findMany({ take: 2, orderBy: { createdAt: 'desc' }, include: { job: { include: { worker: true } } } }),
                prisma.user.findMany({ take: 2, orderBy: { createdAt: 'desc' }, where: { role: 'WORKER' } })
            ]);

            const activities = [
                ...recentJobs.map(j => ({ id: j.id, type: 'JOB', title: `${j.worker?.name || 'Worker'} updated Job #${j.jobNo}`, time: j.updatedAt, color: '#3B82F6', icon: 'settings-outline' })),
                ...recentInvoices.map(i => ({ id: i.id, type: 'PAYMENT', title: `Invoice for $${i.amount} generated`, time: i.createdAt, color: '#8B5CF6', icon: 'cash-outline' })),
                ...recentUsers.map(u => ({ id: u.id, type: 'USER', title: `${u.name} joined as Professional`, time: u.createdAt, color: '#10B981', icon: 'checkmark-circle-outline' }))
            ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

            res.status(200).json({
                success: true,
                data: {
                    mainStats: [
                        { name: 'TOTAL LEADS', value: totalLeads, trend: '+8%', up: true },
                        { name: 'TOTAL PROFESSIONALS', value: totalPros, trend: '+12%', up: true },
                        { name: 'LEADS TODAY', value: leadsToday, trend: '+5%', up: true },
                        { name: 'CONVERSION RATE', value: conversionRate + '%', trend: '-2%', up: false }
                    ],
                    financials: {
                        platformFees,
                        workerRevenue,
                        totalRevenue
                    },
                    performers,
                    activities
                }
            });
        } else {
            // Worker Stats
            const [totalAssigned, accepted, completed, todayNew] = await Promise.all([
                prisma.job.count({ where: { workerId: user.id } }),
                prisma.job.count({ where: { workerId: user.id, status: 'ACCEPTED' } }),
                prisma.job.count({ where: { workerId: user.id, status: 'COMPLETED' } }),
                prisma.job.count({ where: { workerId: user.id, createdAt: { gte: todayStart } } })
            ]);

            res.status(200).json({
                success: true,
                data: [
                    { name: 'New Jobs Today', value: todayNew, trend: '+10%', up: true },
                    { name: 'Total Assigned', value: totalAssigned, trend: '+4%', up: true },
                    { name: 'Accepted Jobs', value: accepted, trend: '+2%', up: true },
                    { name: 'Completed Tasks', value: completed, trend: '+6%', up: true }
                ]
            });
        }
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
};

module.exports = {
    getProfessionals,
    updateLocation,
    getProfessionalsLocations,
    toggleAvailability,
    createProfessional,
    updateProfessional,
    deleteProfessional,
    getProfile,
    updateProfile,
    getDashboardStats
};
