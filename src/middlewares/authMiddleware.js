const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { getJwtSecret } = require('../config/env');

// @desc    Protect routes - verify token
const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const secret = getJwtSecret();
            if (!secret) {
                console.error("❌ [AUTH] JWT_SECRET is not defined in environment variables!");
                return res.status(500).json({ success: false, message: 'Server configuration error' });
            }

            // Verify token
            const decoded = jwt.verify(token, secret);

            // Get user from db to ensure they still exist and have correct role
            req.user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    isAvailable: true,
                    planId: true,
                    plan: true
                }
            });

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'User account no longer exists' });
            }
            next();
        } catch (error) {
            console.error("❌ [AUTH] Token Verification Failed:", error.message);
            return res.status(401).json({
                success: false,
                message: 'Not authorized, session expired or invalid token'
            });
        }
    } else {
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
        }
    }
};

// @desc    Optional Protect - allow guests
const optionalProtect = async (req, res, next) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const secret = getJwtSecret();
            if (secret) {
                const decoded = jwt.verify(token, secret);
                
                req.user = await prisma.user.findUnique({
                    where: { id: decoded.id },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        isAvailable: true,
                        planId: true,
                        plan: true
                    }
                });
            }
        } catch (error) {
            console.warn("⚠️ [AUTH] Invalid token in optionalProtect, continuing as guest");
        }
    }
    
    if (!req.user) {
        req.user = { role: 'GUEST', name: 'Guest User' };
    }
    next();
};

// @desc    Authorize specific roles
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required for this action' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied: Role ${req.user.role} is not authorized`
            });
        }

        next();
    };
};

// @desc    Admin Only access
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Access denied: Admin role required' });
    }
};

module.exports = {
    protect,
    optionalProtect,
    authorize,
    adminOnly
};
