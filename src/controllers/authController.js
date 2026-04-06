const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db'); // Database connection
const { getJwtSecret } = require('../config/env');

// @route   POST /api/v1/auth/register
// @desc    Register a new user (Customer, Worker, or Admin)
const registerUser = async (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;

        // 1. Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { phone: phone }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email or phone already exists."
            });
        }

        // Restrict WORKER role to invite-only
        if (role === 'WORKER') {
            return res.status(403).json({
                success: false,
                message: "Worker registration is invite-only. Please use an invitation link."
            });
        }

        // 2. Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create User in Database
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                role: role || 'CUSTOMER', // Default role if not provided
            }
        });

        // 4. Generate JWT Token
        const secret = getJwtSecret();
        if (!secret) {
            console.error("JWT_SECRET NOT DEFINED IN ENV");
            return res.status(500).json({ success: false, message: "Server Configuration Error" });
        }

        const token = jwt.sign(
            { id: newUser.id, role: newUser.role },
            secret,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                },
                token
            }
        });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @route   POST /api/v1/auth/login
// @desc    Authenticate user & get token
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Find User by Email
        const user = await prisma.user.findFirst({
            where: { email: email.trim() }
        });

        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        // 2. Check Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        // 3. Generate JWT
        const secret = getJwtSecret();
        if (!secret) {
            console.error("JWT_SECRET NOT DEFINED IN ENV");
            return res.status(500).json({ success: false, message: "Server Configuration Error" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            secret,
            { expiresIn: '30d' }
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @route   POST /api/v1/auth/reset-password
// @desc    Direct password reset (Admin/Pro convenience)
const resetPassword = async (req, res) => {
    try {
        const { email, phone, newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });
        }

        // 1. Find User by Email or Phone
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email || '_NOT_SET_' },
                    { phone: phone || '_NOT_SET_' }
                ]
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found with this email/phone." });
        }

        // 2. Hash New Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Update in Database
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword }
        });

        res.status(200).json({
            success: true,
            message: "Password updated successfully! You can now login."
        });

    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// @route   POST /api/v1/auth/invite
// @desc    Admin generates an invitation for a worker
const generateInvite = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });

        // Generate 6-digit random token
        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const invitation = await prisma.invitation.upsert({
            where: { email },
            update: { token, status: 'PENDING', expiresAt },
            create: {
                id: Math.random().toString(36).substring(2, 11),
                email,
                token,
                expiresAt
            }
        });

        res.status(201).json({ 
            success: true, 
            message: "Invite generated", 
            inviteCode: token,
            link: `https://salesapp.com/invite/${token}` 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   POST /api/v1/auth/register-invited
// @desc    Register a worker using an invite token
const registerWorkerByInvite = async (req, res) => {
    try {
        const { token, name, phone, password } = req.body;

        const invite = await prisma.invitation.findUnique({
            where: { token }
        });

        if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: "Invalid or expired invitation code" });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email: invite.email }, { phone }] }
        });

        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                name,
                email: invite.email,
                phone,
                password: hashedPassword,
                role: 'WORKER'
            }
        });

        // Mark invite as accepted
        await prisma.invitation.update({
            where: { id: invite.id },
            data: { status: 'ACCEPTED' }
        });

        const jwtSecret = getJwtSecret();
        if (!jwtSecret) {
            return res.status(500).json({ success: false, message: "Server Configuration Error" });
        }
        const jwtToken = jwt.sign({ id: newUser.id, role: newUser.role }, jwtSecret, { expiresIn: '30d' });

        res.status(201).json({
            success: true,
            data: {
                user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
                token: jwtToken
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    resetPassword,
    generateInvite,
    registerWorkerByInvite
};
