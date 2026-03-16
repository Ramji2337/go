import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';

// Rate limiting configuration
export const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => {
    return rateLimit({
        windowMs, // Time window in milliseconds
        max, // Max requests per window
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        // Skip rate limiting for certain IPs (optional)
        skip: (req) => {
            // Skip for localhost in development
            if (process.env.NODE_ENV === 'development' && req.ip === '::1') {
                return true;
            }
            return false;
        }
    });
};

// Specific rate limiters for different endpoints
export const authLimiter = createRateLimiter(15 * 60 * 1000, 20); // 5 requests per 15 minutes for auth
export const apiLimiter = createRateLimiter(15 * 60 * 1000, 200); // 100 requests per 15 minutes for API
export const uploadLimiter = createRateLimiter(60 * 60 * 1000, 1); // 10 uploads per hour
export const strictLimiter = createRateLimiter(15 * 60 * 1000, 5); // 3 requests per 15 minutes for sensitive operations

// Helmet configuration for security headers
export const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "https://res.cloudinary.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
});

// MongoDB injection protection
export const mongoSanitizeConfig = mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`⚠️  Sanitized potentially malicious input: ${key}`);
    }
});

// XSS protection
export const xssConfig = xss();

// HTTP Parameter Pollution protection
export const hppConfig = hpp({
    whitelist: ['category', 'status', 'role'] // Allow these parameters to appear multiple times
});

// Input validation helper
export const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        // Remove HTML tags
        return input.replace(/<[^>]*>/g, '');
    }
    return input;
};

// File upload validation
export const validateFileUpload = (file, allowedTypes = ['application/pdf'], maxSize = 10 * 1024 * 1024) => {
    const errors = [];

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
        errors.push(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file size
    if (file.size > maxSize) {
        errors.push(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
    }

    // Check file name
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.html'];
    const fileExt = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (dangerousExtensions.includes(fileExt)) {
        errors.push('Dangerous file extension detected');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// CORS configuration
export const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            'http://localhost:5173',
            'http://localhost:3000'
        ];

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
};

// Security logging middleware
export const securityLogger = (req, res, next) => {
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /\$\{/,
        /\.\.\//,
        /union.*select/i,
        /exec\s*\(/i
    ];

    const checkForSuspiciousContent = (obj, path = '') => {
        for (const key in obj) {
            const value = obj[key];
            const currentPath = path ? `${path}.${key}` : key;

            if (typeof value === 'string') {
                for (const pattern of suspiciousPatterns) {
                    if (pattern.test(value)) {
                        console.warn(`🚨 SECURITY ALERT: Suspicious pattern detected in ${currentPath}:`, value);
                        console.warn(`   IP: ${req.ip}, User-Agent: ${req.get('user-agent')}`);
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                checkForSuspiciousContent(value, currentPath);
            }
        }
    };

    // Check request body
    if (req.body) {
        checkForSuspiciousContent(req.body, 'body');
    }

    // Check query parameters
    if (req.query) {
        checkForSuspiciousContent(req.query, 'query');
    }

    next();
};

export default {
    createRateLimiter,
    authLimiter,
    apiLimiter,
    uploadLimiter,
    strictLimiter,
    helmetConfig,
    mongoSanitizeConfig,
    xssConfig,
    hppConfig,
    sanitizeInput,
    validateFileUpload,
    corsOptions,
    securityLogger
};
