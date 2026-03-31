const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

// @desc    Protect routes - verify token
const protect = async (req, res, next) => {
    let token;

    // 1. Check for Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            const secret = process.env.JWT_SECRET;
            if (!secret) {
                console.error("❌ [AUTH] JWT_SECRET is not defined in environment variables!");
                return res.status(500).json({ success: false, message: 'Server configuration error' });
            }

            // 2. Verify token
            const decoded = jwt.verify(token, secret);
            
            console.log("🔓 [AUTH] Decoded Token:", decoded);

            // 3. Get user from db to ensure they still exist and have correct role
            req.user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { id: true, name: true, email: true, role: true }
            });

            if (!req.user) {
                console.warn("⚠️ [AUTH] Token valid but user no longer exists in DB");
                return res.status(401).json({ success: false, message: 'User account no longer exists' });
            }

            console.log(`✅ [AUTH] Authenticated: ${req.user.name} (${req.user.role})`);
            next();
        } catch (error) {
            console.error("❌ [AUTH] Token Verification Failed:", error.message);
            // Always 401 for authentication failure (invalid/expired token)
            return res.status(401).json({ 
                success: false, 
                message: 'Not authorized, session expired or invalid token' 
            });
        }
    }

    if (!token) {
        console.warn("🚫 [AUTH] No token provided in headers");
        return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }
};

// @desc    Authorize specific roles
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        if (!roles.includes(req.user.role)) {
            console.warn(`⛔ [AUTH] Forbidden: User ${req.user.name} (${req.user.role}) attempted to access restricted route. Required: [${roles.join(', ')}]`);
            return res.status(403).json({
                success: false,
                message: `Access denied: Role ${req.user.role} is not authorized for this resource`
            });
        }

        next();
    };
};

module.exports = {
    protect,
    authorize
};
