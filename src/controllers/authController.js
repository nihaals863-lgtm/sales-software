const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db'); // Database connection

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
        const secret = process.env.JWT_SECRET;
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

        // 1. Find User
        const user = await prisma.user.findUnique({
            where: { email: email }
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
        const secret = process.env.JWT_SECRET;
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

module.exports = {
    registerUser,
    loginUser
};
