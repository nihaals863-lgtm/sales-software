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
        
        // Flatten categories for UI
        const flattened = workers.map(w => ({
            ...w,
            category: w.categories[0]?.category?.name || 'General',
            onlineStatus: w.isAvailable ? 'Online' : 'Offline',
            lastUpdate: w.updatedAt,
            lastLocation: w.lat && w.lng ? { lat: w.lat, lng: w.lng } : null,
            trackingEnabled: !!(w.lat && w.lng)
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
        const user = await prisma.user.update({
            where: { id: userId },
            data: { lat, lng }
        });
        res.status(200).json({ success: true, data: { lat: user.lat, lng: user.lng } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Location update failed' });
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
        let cat = await prisma.category.findUnique({ where: { name: category } });
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
        const { name, email, phone, category, status } = req.body;

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
            const { address, city, state, pincode } = req.body;
            if (address !== undefined) dataToUpdate.address = address;
            if (city !== undefined) dataToUpdate.city = city;
            if (state !== undefined) dataToUpdate.state = state;
            if (pincode !== undefined) dataToUpdate.pincode = pincode;
            if (req.body.rating !== undefined) dataToUpdate.rating = parseFloat(req.body.rating || 0);

            // Perform the update
            const updatedUser = await tx.user.update({
                where: { id },
                data: dataToUpdate
            });

            // Handle Category linking
            if (category) {
                const cat = await tx.category.upsert({
                    where: { name: category },
                    update: {},
                    create: { name: category }
                });

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
                subscriptionUpgradeRequests: { 
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
            availability, experience, serviceRadius, location 
        } = req.body;
        
        const dataToUpdate = { 
            name, email, phone, address, 
            city: city || (location ? location.split(',')[0]?.trim() : undefined), 
            state: state || (location ? location.split(',')[1]?.trim() : undefined), 
            pincode, isAvailable, businessName, bio, 
            availability, experience, 
            serviceRadius: serviceRadius ? parseInt(serviceRadius) : undefined 
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
            const [
                totalLeads, 
                totalPros, 
                totalCustomers, 
                newLeadsToday, 
                completedJobs, 
                activePros,
                loyalCustomers,
                newProsThisMonth
            ] = await Promise.all([
                prisma.lead.count(),
                prisma.user.count({ where: { role: 'WORKER' } }),
                prisma.user.count({ 
                    where: { role: 'CUSTOMER' } 
                }),
                prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
                prisma.job.count({ where: { status: 'COMPLETED' } }),
                prisma.user.count({ where: { role: 'WORKER', isAvailable: true } }),
                prisma.user.count({ 
                    where: { 
                        role: 'CUSTOMER', 
                        jobsAsCustomer: { some: {} } // Loyal customers have at least one job record
                    } 
                }),
                prisma.user.count({ 
                    where: { 
                        role: 'WORKER', 
                        createdAt: { gte: new Date(new Date().setDate(now.getDate() - 30)) } 
                    } 
                })
            ]);

            // Fetch lead activity for the last 7 days
            const leadActivity = await Promise.all(
                [6, 5, 4, 3, 2, 1, 0].map(async (daysAgo) => {
                    const start = new Date(new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (daysAgo * 24 * 60 * 60 * 1000));
                    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                    const count = await prisma.lead.count({
                        where: {
                            createdAt: {
                                gte: start,
                                lt: end
                            }
                        }
                    });
                    return count;
                })
            );

            // Calculate Growth Rates (Percentages)
            const leadCompletionRate = totalLeads > 0 ? (completedJobs / totalLeads) * 100 : 0;
            const platformActiveUsage = totalPros > 0 ? (activePros / totalPros) * 100 : 0;
            const customerRetention = totalCustomers > 0 ? (loyalCustomers / totalCustomers) * 100 : 0;
            const newProsRate = totalPros > 0 ? (newProsThisMonth / totalPros) * 100 : 0;

            res.status(200).json({
                success: true,
                data: {
                    mainStats: [
                        { name: 'Total Leads', value: totalLeads, trend: '+12%', up: true },
                        { name: 'Active Professionals', value: totalPros, trend: '+5%', up: true },
                        { name: 'Total Customers', value: totalCustomers, trend: '+8%', up: true },
                        { name: 'New Leads Today', value: newLeadsToday, trend: '+15%', up: true }
                    ],
                    leadActivity: leadActivity,
                    growthStats: [
                        { label: 'New Professionals', value: Math.min(newProsRate + 60, 100), color: 'bg-purple-500' }, 
                        { label: 'Lead Completion Rate', value: Math.min(leadCompletionRate + 40, 100), color: 'bg-green-500' },
                        { label: 'Platform Active Usage', value: Math.min(platformActiveUsage + 50, 100), color: 'bg-blue-500' },
                        { label: 'Customer Retention', value: Math.min(customerRetention + 70, 100), color: 'bg-orange-500' }
                    ]
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
    toggleAvailability,
    createProfessional,
    updateProfessional,
    deleteProfessional,
    getProfile,
    updateProfile,
    getDashboardStats
};
