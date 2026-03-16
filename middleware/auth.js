import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

// JWT verification middleware
export const verifyJWT = (req, res, next) => {
    // First try to get token from cookie, then fall back to header
    const token = req.cookies.token || req.headers["authorization"]?.replace('Bearer ', '');

    console.log('🔐 JWT Verification:', {
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
        headers: req.headers["authorization"] ? 'present' : 'missing'
    });

    if (!token) {
        console.log('❌ No token provided');
        return res.status(403).json({
            success: false,
            message: "Access denied. No token provided."
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token verified:', { userId: decoded.userId, email: decoded.email, role: decoded.role });
        req.user = decoded;
        next();
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

// Optional JWT verification (doesn't fail if no token)
export const optionalJWT = (req, res, next) => {
    // First try to get token from cookie, then fall back to header
    const token = req.cookies.token || req.headers["authorization"]?.replace('Bearer ', '');

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // Token is invalid, but we don't fail the request
            req.user = null;
        }
    }

    next();
};

// Get user from database
export const getUserFromToken = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        req.userDoc = user;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching user data"
        });
    }
};

// Auth middleware (alias for verifyJWT)
export const authMiddleware = verifyJWT;

// Admin middleware - checks if user is admin
export const adminMiddleware = async (req, res, next) => {
    try {
        console.log('👮 Admin Middleware Check:', {
            hasUser: !!req.user,
            userId: req.user?.userId,
            userEmail: req.user?.email
        });

        // User should already be authenticated via authMiddleware
        // JWT uses 'userId' field, not 'id'
        if (!req.user || !req.user.userId) {
            console.log('❌ No user in request');
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Fetch user from database
        const user = await User.findById(req.user.userId);

        console.log('📋 User from DB:', {
            found: !!user,
            role: user?.role,
            email: user?.email
        });

        if (!user) {
            console.log('❌ User not found in database');
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user is admin
        if (user.role !== 'Admin') {
            console.log('❌ User is not admin. Role:', user.role);
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        console.log('✅ Admin access granted');
        // Attach user document to request
        req.userDoc = user;
        next();
    } catch (error) {
        console.error('❌ Admin middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying admin access'
        });
    }
};

// Alias for backward compatibility
export const verifyToken = verifyJWT;
