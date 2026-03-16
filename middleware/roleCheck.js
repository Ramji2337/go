// Role-based access control middleware

export const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }

        next();
    };
};

// Check if user is admin
export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'Admin') {
        return res.status(403).json({
            success: false,
            message: "Admin access required"
        });
    }
    next();
};

// Check if user is editor
export const requireEditor = (req, res, next) => {
    if (!req.user || (req.user.role !== 'Editor' && req.user.role !== 'Admin')) {
        return res.status(403).json({
            success: false,
            message: "Editor access required"
        });
    }
    next();
};

// Check if user is reviewer
export const requireReviewer = (req, res, next) => {
    if (!req.user || (req.user.role !== 'Reviewer' && req.user.role !== 'Admin')) {
        return res.status(403).json({
            success: false,
            message: "Reviewer access required"
        });
    }
    next();
};

// Alias for backward compatibility
export const isAdmin = requireAdmin;
