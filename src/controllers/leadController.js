const prisma = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const generateShortId = (prefix) => {
    return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

// @route   POST /api/v1/leads
// @desc    Create a new lead from the website
const createLead = async (req, res) => {
    try {
        const { customerName, name, email, phone, categoryId, categoryName, servicePlan, location, description, preferredDate, latitude, longitude } = req.body;

        if (!email || !phone) {
            return res.status(400).json({ success: false, message: "Email and Phone are required to create a lead." });
        }

        const leadNo = generateShortId('L');

        // 1. Upsert Customer
        let customer = await prisma.user.findFirst({
            where: { OR: [{ email: email }, { phone: phone }] }
        });

        if (!customer) {
            customer = await prisma.user.create({
                data: {
                    name: customerName || name || 'Valued Customer',
                    email: email,
                    phone: phone,
                    role: 'CUSTOMER',
                    password: 'MOCK_PASSWORD'
                }
            });
        } else {
            // Update existing customer details to match newest request
            customer = await prisma.user.update({
                where: { id: customer.id },
                data: {
                    name: customerName || name || customer.name,
                    email: email || customer.email,
                    phone: phone || customer.phone
                }
            });
        }

        // 2. Resolve Category
        let finalCategoryId = categoryId;
        if (!finalCategoryId && categoryName) {
           const cat = await prisma.category.findFirst({ where: { name: { contains: categoryName } } });
           if (cat) finalCategoryId = cat.id;
        }

        if (!finalCategoryId) {
            // Check for a 'General' or first available category if none matched
            const fallback = await prisma.category.findFirst();
            finalCategoryId = fallback?.id;
        }

        if (!finalCategoryId) throw new Error("No categories found in database. Please seed categories.");

        // 3. Create Lead
        const lead = await prisma.lead.create({
            data: {
                leadNo: leadNo,
                customerId: customer.id,
                categoryId: finalCategoryId,
                location: location || 'Not Specified',
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                description: description || '',
                servicePlan: servicePlan || 'Starter',
                preferredDate: preferredDate || null,
                status: 'OPEN'
            },
            include: { category: true }
        });

        // 4. Auto-register Location for Dashboard
        if (location) {
            const locName = location.trim();
            const existingLoc = await prisma.location.findFirst({
                where: { city: { contains: locName } }
            });

            if (!existingLoc && locName) {
                await prisma.location.create({
                    data: {
                        name: locName,
                        city: locName,
                        state: 'IN', // Default or parse
                        country: 'India', 
                        status: 'Active'
                    }
                });
            }
        }

        // 5. Create Admin Notification
        await prisma.notification.create({
            data: {
                userId: null, // Broadcast to admins
                title: "New Lead Received",
                message: `Lead #${leadNo} received from ${customerName || name || 'Customer'} for ${lead.category.name}.`,
                type: 'LEAD'
            }
        });

        res.status(201).json({
            success: true,
            message: "Service request submitted successfully",
            data: lead
        });
    } catch (error) {
        console.error("Create Lead Error:", error);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
    }
};

const getLeads = async (req, res) => {
    try {
        const { status } = req.query;
        let where = {};
        
        if (status && status !== 'All') {
            where.status = status.toUpperCase();
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                customer: { select: { name: true, phone: true, email: true } },
                category: { select: { name: true } },
                job: {
                    select: { id: true, workerId: true, status: true, jobNo: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedLeads = leads.map(l => ({
            ...l,
            customerName: l.customer?.name || l.guestName || 'Valued Customer',
            customerEmail: l.customer?.email || l.guestEmail || '—',
            customerPhone: l.customer?.phone || l.guestPhone || '—',
            guestEmail: l.guestEmail,
            guestPhone: l.guestPhone,
            categoryName: l.category?.name || 'Uncategorized',
            displayId: l.leadNo
        }));

        res.status(200).json({ success: true, count: leads.length, data: formattedLeads });
    } catch (error) {
        console.error("Get Leads Error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @route   PATCH /api/v1/leads/:id/assign
// @desc    Worker accepts/Admin assigns a lead (atomic: job + chat + lead status)
const assignLead = async (req, res) => {
    try {
        const leadId = req.params.id;
        const { workerId: bodyWorkerId } = req.body;
        const workerId = bodyWorkerId || req.user.id;

        if (!workerId) {
            return res.status(400).json({ success: false, message: 'workerId is required' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.findUnique({
                where: { id: leadId },
                include: { category: true, job: true }
            });

            if (!lead) {
                const err = new Error('Lead not found');
                err.statusCode = 404;
                throw err;
            }

            // Already have a job: idempotent success (fixes "error then shows assigned" retries)
            if (lead.job) {
                if (lead.status === 'OPEN') {
                    await tx.lead.update({
                        where: { id: leadId },
                        data: { status: 'ASSIGNED' }
                    });
                }

                const isAdmin = req.user.role === 'ADMIN';
                if (isAdmin && bodyWorkerId && bodyWorkerId !== lead.job.workerId) {
                    const updatedJob = await tx.job.update({
                        where: { id: lead.job.id },
                        data: { workerId: bodyWorkerId }
                    });
                    await tx.notification.create({
                        data: {
                            userId: bodyWorkerId,
                            title: 'New Job Assigned',
                            message: `You have been assigned to Job #${lead.job.jobNo} (${lead.category.name}) at ${lead.location}.`,
                            type: 'ASSIGNMENT'
                        }
                    });
                    return { job: updatedJob, message: 'Lead reassigned!' };
                }

                return { job: lead.job, message: 'Lead already assigned.' };
            }

            // No job yet — only OPEN or recovery (ASSIGNED in DB but job missing after a failed assign)
            if (lead.status !== 'OPEN' && lead.status !== 'ASSIGNED') {
                const err = new Error(`Lead is already ${lead.status.toLowerCase()}`);
                err.statusCode = 400;
                throw err;
            }

            const jobNo = generateShortId('J');
            const newJob = await tx.job.create({
                data: {
                    jobNo: jobNo,
                    leadId: lead.id,
                    customerId: lead.customerId,
                    guestName: lead.guestName,
                    guestPhone: lead.guestPhone,
                    sessionToken: lead.sessionToken,
                    isGuest: lead.isGuest || false,
                    workerId: workerId,
                    categoryName: lead.category.name,
                    location: lead.location,
                    latitude: lead.latitude,
                    longitude: lead.longitude,
                    description: lead.description,
                    preferredDate: lead.preferredDate,
                    status: 'SCHEDULED',
                    scheduledDate: new Date(),
                    scheduledTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                }
            });

            await tx.chats.create({
                data: {
                    id: uuidv4(),
                    job_id: newJob.id,
                    last_message: 'Conversation started',
                    updated_at: new Date()
                }
            });

            if (lead.status === 'OPEN') {
                await tx.lead.update({
                    where: { id: leadId },
                    data: { status: 'ASSIGNED' }
                });
            }

            await tx.notification.create({
                data: {
                    userId: workerId,
                    title: 'New Job Assigned',
                    message: `You have been assigned to Job #${jobNo} (${lead.category.name}) at ${lead.location}.`,
                    type: 'ASSIGNMENT'
                }
            });

            return { job: newJob, message: 'Lead assigned!' };
        });

        res.status(200).json({ success: true, message: result.message, data: result.job });
    } catch (error) {
        console.error('Assign Lead Error:', error);
        const code = error.statusCode || 500;
        res.status(code).json({ success: false, message: error.message || 'Server Error' });
    }
};

const updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            customerName, customerEmail, customerPhone,
            guestName, guestPhone, guestEmail,
            location, description, status, servicePlan, preferredDate,
            categoryId, serviceCategory
        } = req.body;

        console.log(`[API] Updating Lead ${id}:`, { customerName, serviceCategory, status });

        // Resolve Category ID - Prioritize serviceCategory name from the form if provided
        let finalCategoryId = null;
        
        if (serviceCategory && serviceCategory.length > 0) {
            const catNameTrimmed = serviceCategory.trim().toLowerCase();
            const cat = await prisma.category.findFirst({
                where: { name: { contains: catNameTrimmed } }
            });
            if (cat) {
                finalCategoryId = cat.id;
            }
        }

        // Fallback to categoryId if no name provided or no match found
        if (!finalCategoryId) finalCategoryId = categoryId;

        // 1. Get current lead to find customer
        const currentLead = await prisma.lead.findUnique({
            where: { id },
            include: { customer: true }
        });

        if (!currentLead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        // 2. Update Customer details if provided and lead is NOT a guest lead
        if (currentLead.customerId) {
            await prisma.user.update({
                where: { id: currentLead.customerId },
                data: {
                    name: customerName || undefined,
                    email: customerEmail || undefined,
                    phone: customerPhone || undefined
                }
            });
        }

        // 3. Prepare Lead Update data (Filter only valid Lead fields)
        const dataToUpdate = {};
        if (location !== undefined) dataToUpdate.location = location;
        if (description !== undefined) dataToUpdate.description = description;
        if (status !== undefined) dataToUpdate.status = status.toUpperCase();
        if (servicePlan !== undefined) dataToUpdate.servicePlan = servicePlan;
        if (preferredDate !== undefined) dataToUpdate.preferredDate = preferredDate;
        
        // Only update category if we resolved a valid one
        if (finalCategoryId) dataToUpdate.categoryId = finalCategoryId;
        
        // Guest fields
        if (guestName !== undefined) dataToUpdate.guestName = guestName;
        if (guestPhone !== undefined) dataToUpdate.guestPhone = guestPhone;
        if (guestEmail !== undefined) dataToUpdate.guestEmail = guestEmail;

        const updatedLead = await prisma.lead.update({
            where: { id },
            data: dataToUpdate,
            include: { customer: true, category: true }
        });

        res.status(200).json({ success: true, message: "Lead updated successfully", data: updatedLead });
    } catch (err) {
        console.error("❌ [API] updateLead Error:", err);
        res.status(500).json({ success: false, message: 'Lead update failed: ' + err.message, error: err.stack });
    }
};

const deleteLead = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const lead = await prisma.lead.findUnique({ where: { id } });
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        // Admin can delete any lead. 
        // For Workers, we already authorized them in the route (leadRoutes.js), 
        // but here we can add extra checks if needed.
        if (user.role !== 'ADMIN' && user.role !== 'WORKER') {
             return res.status(403).json({ success: false, message: 'Not authorized to delete leads' });
        }

        await prisma.lead.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Lead deleted successfully' });
    } catch (err) {
        console.error("Delete Lead Error:", err);
        res.status(500).json({ success: false, message: 'Lead deletion failed' });
    }
};

const getCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            include: {
                _count: { select: { leads: true, workers: true } }
            }
        });
        res.status(200).json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching categories' });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name, icon } = req.body;
        const category = await prisma.category.create({ data: { name, icon } });
        res.status(201).json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Category creation failed' });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon } = req.body;
        const category = await prisma.category.update({
            where: { id },
            data: { name, icon }
        });
        res.status(200).json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Category update failed' });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.category.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Category deletion failed' });
    }
};

const getStats = async (req, res) => {
    try {
        const user = req.user;
        
        if (user.role === 'WORKER') {
            const totalAssigned = await prisma.job.count({ where: { workerId: user.id } });
            const completed = await prisma.job.count({ where: { workerId: user.id, status: 'COMPLETED' } });
            
            const today = new Date();
            today.setHours(0,0,0,0);
            const leadsToday = await prisma.job.count({
                where: { workerId: user.id, createdAt: { gte: today } }
            });

            return res.status(200).json({
                success: true,
                data: {
                    totalLeads: totalAssigned,
                    totalProfessionals: 1, // Self
                    leadsToday,
                    conversionRate: totalAssigned > 0 ? ((completed / totalAssigned) * 100).toFixed(1) : 0
                }
            });
        }

        const totalLeads = await prisma.lead.count();
        const totalPros = await prisma.user.count({ where: { role: 'WORKER' } });
        const acceptedLeads = await prisma.lead.count({ where: { status: 'ASSIGNED' } });
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const leadsToday = await prisma.lead.count({
            where: { createdAt: { gte: today } }
        });

        res.status(200).json({
            success: true,
            data: {
                totalLeads,
                totalProfessionals: totalPros,
                leadsToday,
                conversionRate: totalLeads > 0 ? ((acceptedLeads / totalLeads) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
};

const getLocations = async (req, res) => {
    try {
        const locations = await prisma.lead.findMany({
            select: { location: true },
            distinct: ['location']
        });
        res.status(200).json({ success: true, data: locations.map(l => l.location) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching locations' });
    }
};

const getSubscriptions = async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            orderBy: { price: 'asc' }
        });
        
        const formatted = plans.map(p => {
            let parsedFeatures = [];
            if (p.features) {
                try {
                    // Try parsing if it's a string, otherwise use it as is if it's already an array
                    parsedFeatures = typeof p.features === 'string' ? JSON.parse(p.features) : p.features;
                } catch (e) {
                    console.warn(`⚠️ [DB] Invalid JSON features for plan ${p.id}:`, p.features);
                    parsedFeatures = typeof p.features === 'string' ? p.features.split(',') : [];
                }
            }
            return {
                ...p,
                features: Array.isArray(parsedFeatures) ? parsedFeatures : []
            };
        });

        res.status(200).json({ success: true, data: formatted });
    } catch (err) {
        console.error("GET Subscriptions Error:", err);
        res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
    }
};

const enrollInPlan = async (req, res) => {
    try {
        const { professionalId, professionalName, planName } = req.body;
        
        let targetId = professionalId;
        if (req.user.role === 'WORKER') {
            targetId = req.user.id;
        }

        const plan = await prisma.subscriptionPlan.findUnique({
            where: { name: planName }
        });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

        let user;
        if (targetId) {
            user = await prisma.user.findUnique({ where: { id: targetId } });
        } else if (req.user.role === 'ADMIN') {
            user = await prisma.user.findFirst({
                where: { name: professionalName, role: 'WORKER' }
            });
        }

        if (!user) return res.status(404).json({ success: false, message: 'Could not resolve professional' });

        // NEW FLOW: If caller is a WORKER, we create a REQUEST for ADMIN to approve
        if (req.user.role === 'WORKER') {
            const existingRequest = await prisma.subscriptionUpgradeRequest.findFirst({
                where: { userId: user.id, planId: plan.id, status: 'PENDING' }
            });

            if (existingRequest) {
                return res.status(400).json({ success: false, message: 'Existing request for this plan is already pending admin approval.' });
            }

            const request = await prisma.subscriptionUpgradeRequest.create({
                data: {
                    userId: user.id,
                    planId: plan.id,
                    status: 'PENDING'
                }
            });

            return res.status(200).json({ 
                success: true, 
                message: 'Enrollment request submitted! Waiting for Admin Approval.',
                data: request 
            });
        }

        // AUTO-APPROVE if Admin is doing it
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { 
                planId: plan.id,
                subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
            },
            include: { plan: true }
        });

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error("Enrollment Error:", err);
        res.status(500).json({ success: false, message: 'Enrollment failed: ' + err.message });
    }
};

const getUpgradeRequests = async (req, res) => {
    try {
        const requests = await prisma.subscriptionUpgradeRequest.findMany({
            include: { user: true, plan: true },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json({ success: true, data: requests });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Fetch requests failed' });
    }
};

const approveUpgradeRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const upgradeRequest = await prisma.subscriptionUpgradeRequest.findUnique({
            where: { id },
            include: { plan: true }
        });

        if (!upgradeRequest) return res.status(404).json({ success: false, message: 'Request not found' });

        // Update User Plan
        await prisma.user.update({
            where: { id: upgradeRequest.userId },
            data: {
                planId: upgradeRequest.planId,
                subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });

        // Update Request Status
        await prisma.subscriptionUpgradeRequest.update({
            where: { id },
            data: { status: 'APPROVED' }
        });

        res.status(200).json({ success: true, message: 'Request Approved! Professional plan updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Approval failed: ' + err.message });
    }
};

const rejectUpgradeRequest = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.subscriptionUpgradeRequest.update({
            where: { id },
            data: { status: 'REJECTED' }
        });
        res.status(200).json({ success: true, message: 'Request Rejected' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Rejection failed' });
    }
};

const getActiveSubscriptions = async (req, res) => {
    try {
        const subscribers = await prisma.user.findMany({
            where: { role: 'WORKER', planId: { not: null } },
            include: { plan: true }
        });

        const formatted = subscribers.map(s => ({
            id: s.id,
            name: s.name,
            business: s.name + ' Services',
            plan: s.plan.name,
            amount: `$${s.plan.price}`,
            date: s.updatedAt.toISOString().slice(0, 10),
            status: 'Active'
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Fetch failed' });
    }
};

const createSubscriptionPlan = async (req, res) => {
    try {
        const { name, price, leads, features } = req.body;
        const plan = await prisma.subscriptionPlan.create({
            data: {
                name,
                price: parseFloat(price),
                leads: parseInt(leads) || 0,
                features: features ? (typeof features === 'string' ? features : JSON.stringify(features)) : '[]'
            }
        });
        res.status(201).json({ success: true, data: plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Plan creation failed' });
    }
};

const updateSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, leads, features } = req.body;
        const plan = await prisma.subscriptionPlan.update({
            where: { id },
            data: {
                name,
                price: parseFloat(price),
                leads: parseInt(leads) || 0,
                features: features ? (typeof features === 'string' ? features : JSON.stringify(features)) : undefined
            }
        });
        res.status(200).json({ success: true, data: plan });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Plan update failed' });
    }
};

const deleteSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.subscriptionPlan.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Plan deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Plan deletion failed' });
    }
};

module.exports = {
    createLead,
    getLeads,
    assignLead,
    updateLead,
    deleteLead,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getStats,
    getLocations,
    getSubscriptions,
    enrollInPlan,
    getActiveSubscriptions,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    getUpgradeRequests,
    approveUpgradeRequest,
    rejectUpgradeRequest
};
