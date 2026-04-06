const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

// @desc    Submit a professional request
// @route   POST /api/v1/professional-requests
// @access  Public
exports.submitRequest = async (req, res) => {
    try {
        const {
            name,
            businessName,
            email,
            phone,
            category,
            address,
            city,
            state,
            pincode,
            preferredPlan
        } = req.body;

        // Check if a request already exists with this email
        const existingRequest = await prisma.professionalRequest.findFirst({
            where: { email }
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: 'A request with this email already exists and is ' + existingRequest.status.toLowerCase()
            });
        }

        // Check if a user already exists with this email or phone
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { phone }
                ]
            }
        });

        if (existingUser) {
            const conflictField = existingUser.email === email ? 'email' : 'phone number';
            return res.status(400).json({
                success: false,
                message: `A user with this ${conflictField} already exists`
            });
        }

        const request = await prisma.professionalRequest.create({
            data: {
                name,
                businessName,
                email,
                phone,
                category,
                address,
                city,
                state,
                pincode,
                preferredPlan
            }
        });

        res.status(201).json({
            success: true,
            message: 'Your request has been submitted successfully. Admin will review it and contact you with a password soon.',
            data: request
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to submit request',
            error: error.message
        });
    }
};

// @desc    Get all professional requests
// @route   GET /api/v1/professional-requests
// @access  Private/Admin
exports.getAllRequests = async (req, res) => {
    try {
        const requests = await prisma.professionalRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests',
            error: error.message
        });
    }
};

// @desc    Approve professional request
// @route   PUT /api/v1/professional-requests/:id/approve
// @access  Private/Admin
exports.approveRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await prisma.professionalRequest.findUnique({
            where: { id }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        if (request.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: `Request is already ${request.status.toLowerCase()}`
            });
        }

        // Generate a random password if not provided
        const generatedPassword = Math.random().toString(36).slice(-10);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(generatedPassword, salt);

        // Find the subscription plan
        const plan = await prisma.subscriptionPlan.findFirst({
            where: { name: request.preferredPlan }
        });

        // Check if user already exists (just in case) before creating
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: request.email },
                    { phone: request.phone }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: `A user with this email or phone already exists in the system. Cannot create duplicate account.`
            });
        }

        // Step 1: Find or Create Category manually (since 'name' is not unique and connectOrCreate needs a unique field)
        let category = await prisma.category.findFirst({
            where: { name: request.category }
        });

        if (!category) {
            category = await prisma.category.create({
                data: { name: request.category }
            });
        }

        // Step 2: Create the worker user
        const newUser = await prisma.user.create({
            data: {
                name: request.name,
                businessName: request.businessName,
                email: request.email ? request.email.toLowerCase().trim() : '',
                phone: request.phone,
                password: hashedPassword,
                role: 'WORKER',
                address: request.address,
                city: request.city,
                state: request.state,
                pincode: request.pincode,
                planId: plan ? plan.id : null,
                // Step 3: Connect the user to the newly found/created category
                categories: {
                    create: {
                        categoryId: category.id
                    }
                }
            }
        });

        // Update the request status
        await prisma.professionalRequest.update({
            where: { id },
            data: { status: 'APPROVED' }
        });

        res.status(200).json({
            success: true,
            message: 'Request approved and professional account created.',
            data: {
                user: newUser,
                generatedPassword // Send this back so admin can give it to the pro
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to approve request',
            error: error.message
        });
    }
};

// @desc    Reject professional request
// @route   PUT /api/v1/professional-requests/:id/reject
// @access  Private/Admin
exports.rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await prisma.professionalRequest.findUnique({
            where: { id }
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }

        await prisma.professionalRequest.delete({
            where: { id }
        });

        res.status(200).json({
            success: true,
            message: 'Request has been removed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to reject request',
            error: error.message
        });
    }
};
