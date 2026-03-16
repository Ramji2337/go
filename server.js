import express from 'express';
import { createServer } from 'http';
import { initializeSocket } from './utils/socket.js';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import xss from 'xss-clean';
import { connectDatabase } from './config/database.js';
import { User } from './models/User.js';
import { PaperSubmission } from './models/Paper.js';
import { Review } from './models/Review.js';



import authRoutes from './routes/authRoutes.js';
import paperRoutes from './routes/paperRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import editorRoutes from './routes/editorRoutes.js';
import reviewerRoutes from './routes/reviewerRoutes.js';
import paymentRegistrationRoutes from './routes/paymentRegistration.js';
import committeeRoutes from './routes/committee.js';
import membershipRoutes from './routes/membershipRoutes.js';
import listenerRoutes from './routes/listenerRoutes.js';
import debugRoutes from './routes/debugRoutes.js';
import copyrightRoutes from './routes/copyrightRoutes.js';
import paperMessageRoutes from './routes/paperMessageRoutes.js';
import supportMessageRoutes from './routes/supportMessageRoutes.js';
import adminPaperSubmissionRoutes from './routes/adminPaperSubmissionRoutes.js';
import adminPaperAcceptanceRoutes from './routes/adminPaperAcceptanceRoutes.js';


dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.io
initializeSocket(httpServer);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 2. Data Sanitization against NoSQL Injection
app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`⚠️ Sanitized potentially malicious data in ${key}`);
    }
}));

// 3. Prevent HTTP Parameter Pollution attacks
app.use(hpp({
    whitelist: ['email', 'category', 'status', 'role', 'participantType', 'isInternational']
}));

// 4. Security Headers
app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (formerly Feature Policy)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Remove X-Powered-By header to hide Express
    res.removeHeader('X-Powered-By');

    next();
});

// 5. CORS Configuration with strict origin checking
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:5173'];

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`⚠️ Blocked CORS request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600 // Cache preflight requests for 10 minutes
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 6. Static files with security
app.use('/public', express.static('public', {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Add security headers for static files
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// ============================================
// DATABASE CONNECTION
// ============================================
connectDatabase();


const verifyJWT = (req, res, next) => {
    // First try to get token from cookie, then fall back to header
    const token = req.cookies.token || req.headers["authorization"]?.replace('Bearer ', '');
    if (!token) {
        return res.status(403).json({
            success: false,
            message: "A token is required for authentication"
        });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};



app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'ICMBNT 2026 Research Paper Management System API',
        version: '2.0.0',
        endpoints: {
            auth: '/api/auth',
            papers: '/api/papers',
            admin: '/api/admin',
            editor: '/api/editor',
            reviewer: '/api/reviewer'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});


// Security Middleware (Rate limiting removed as per user request)

// Apply Helmet for security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now to avoid breaking existing functionality
    crossOriginEmbedderPolicy: false
}));

// Apply XSS protection
app.use(xss());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/reviewer', reviewerRoutes);
app.use('/api/registration', paymentRegistrationRoutes);
app.use('/api/committee', committeeRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/listener', listenerRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/copyright', copyrightRoutes);
app.use('/api/paper-messages', paperMessageRoutes);
app.use('/api/support-messages', supportMessageRoutes);
app.use('/api/admin-paper-submission', adminPaperSubmissionRoutes);
app.use('/api/admin-paper-acceptance', adminPaperAcceptanceRoutes);



app.get('/user-submission', verifyJWT, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const { PaperSubmission } = await import('./models/Paper.js');

        // Fetch all paper submissions for this email from the single collection
        const paperSubmissions = await PaperSubmission.find({ email: userEmail })
            .sort({ createdAt: -1 });

        if (paperSubmissions.length === 0) {
            return res.status(200).json({
                success: true,
                hasSubmission: false,
                submission: null,
                submissions: []
            });
        }

        return res.status(200).json({
            success: true,
            hasSubmission: true,
            submission: paperSubmissions[0],
            submissions: paperSubmissions
        });
    } catch (error) {
        console.error('Error fetching user submission:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching submission',
            error: error.message
        });
    }
});

// Get revision status for author
app.get('/revision-status', verifyJWT, async (req, res) => {
    try {
        const { Revision } = await import('./models/Revision.js');
        const userEmail = req.user.email;

        const revisions = await Revision.find({ authorEmail: userEmail })
            .populate('reviewerComments.reviewerId', 'username email');

        return res.status(200).json({
            success: true,
            hasRevision: revisions.length > 0,
            revisions
        });
    } catch (error) {
        console.error('Error fetching revision status:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching revision status',
            error: error.message
        });
    }
});

// Submit revised paper endpoint
app.post('/submit-revised-paper', verifyJWT, async (req, res) => {
    try {
        const { submissionId, authorResponse } = req.body;
        const userEmail = req.user.email;

        if (!submissionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing submissionId'
            });
        }

        // For now, store the PDF URL from the upload (this would come from Cloudinary in real implementation)
        // In production, you'd handle file upload to Cloudinary here
        const { Revision } = await import('./models/Revision.js');

        const revision = await Revision.findOne({ submissionId, authorEmail: userEmail });
        if (!revision) {
            return res.status(404).json({
                success: false,
                message: 'Revision record not found'
            });
        }

        // Update revision with revised paper info
        revision.authorResponse = authorResponse || '';
        revision.revisedPaperSubmittedAt = new Date();
        revision.revisionStatus = 'Resubmitted';
        await revision.save();

        // Update paper status
        const paper = await PaperSubmission.findOne({ submissionId });
        if (paper) {
            paper.status = 'Revised Submitted';
            paper.revisionCount = (paper.revisionCount || 0) + 1;
            await paper.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Revised paper submitted successfully',
            revision
        });
    } catch (error) {
        console.error('Error submitting revised paper:', error);
        return res.status(500).json({
            success: false,
            message: 'Error submitting revised paper',
            error: error.message
        });
    }
});

// ==================== TEST ROUTES ====================
app.get('/test/paperfetch', async (req, res) => {
    try {
        const papers = await PaperSubmission.find({})
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        console.log(`Found ${papers.length} papers in database`);

        if (papers.length > 0) {
            console.log('First paper:', JSON.stringify(papers[0], null, 2));
        }

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers: papers
        });
    } catch (error) {
        console.error('Error fetching papers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching papers',
            error: error.message
        });
    }
});

// PDF Fetch endpoint - Streams PDF directly from Cloudinary
app.get('/test/pdf-fetch', async (req, res) => {
    try {
        const { url, publicId } = req.query;

        if (!url && !publicId) {
            return res.status(400).json({
                success: false,
                message: 'PDF URL or publicId required'
            });
        }

        let pdfUrl = url ? decodeURIComponent(url) : null;

        if (publicId && process.env.CLOUDINARY_CLOUD_NAME) {
            const decodedPublicId = decodeURIComponent(publicId);
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            const publicIdWithoutExt = decodedPublicId.replace(/\.pdf$/, '');
            pdfUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicIdWithoutExt}.pdf`;
        }

        console.log('Fetching Cloudinary PDF:', pdfUrl);

        const response = await fetch(pdfUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/pdf, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });

        if (!response.ok) {
            console.error('Failed to fetch PDF:', response.status, response.statusText);
            return res.status(response.status).json({
                success: false,
                message: `Failed to fetch PDF: ${response.statusText}`,
                status: response.status,
                url: pdfUrl
            });
        }

        const contentType = response.headers.get('content-type') || 'application/pdf';
        const contentLength = response.headers.get('content-length');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');

        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('PDF Fetch Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Error fetching PDF',
            error: error.message
        });
    }
});

// Direct Cloudinary fetch endpoint
app.get('/test/cloudinary-pdf', async (req, res) => {
    try {
        const { publicId } = req.query;

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'Cloudinary public ID required'
            });
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const pdfUrl = `https://res.cloudinary.com/${cloudName}/fl_attachment/v1/${publicId}`;

        const response = await fetch(pdfUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/pdf',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                message: 'Failed to fetch PDF from Cloudinary',
                status: response.status
            });
        }

        const contentType = response.headers.get('content-type') || 'application/pdf';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline; filename="paper.pdf"');

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching Cloudinary PDF',
            error: error.message
        });
    }
});

// ==================== ERROR HANDLING ====================
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    // Multer errors
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    // Mongoose validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Default error
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ==================== SERVER STARTUP ====================
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ICMBNT 2026 Research Paper Management System           ║
║   Server running on http://localhost:${PORT}                ║
║   WebSocket Enabled: Yes                                   ║
║                                                           ║
║   API Endpoints:                                          ║
║   - Auth:     /api/auth                                   ║
║   - Papers:   /api/papers                                 ║
║   - Admin:    /api/admin                                  ║
║   - Editor:   /api/editor                                 ║
║   - Reviewer: /api/reviewer                               ║
║                                                           ║
║   Environment:                                            ║
║   - Node:     ${process.env.NODE_ENV || 'development'}                           ║
║   - CORS:     Configured for frontend deployment        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
