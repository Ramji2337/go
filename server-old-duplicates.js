import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { connectDatabase } from './config/database.js';
import { User } from './models/User.js';
import { PaperSubmission } from './models/Paper.js';
import { sendVerificationEmail, sendOTPEmail } from './utils/emailService.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import paperRoutes from './routes/paperRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import editorRoutes from './routes/editorRoutes.js';
import reviewerRoutes from './routes/reviewerRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '10mb' }));

const corsOptions = {
  origin: ['https://icmbnt2026-yovz.vercel.app', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests
app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// Connect to database
connectDatabase();

// Root route
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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/reviewer', reviewerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// JWT verification middleware
const verifyJWT = (req, res, next) => {
    const token = req.headers["authorization"]?.replace('Bearer ', '');
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

// ==================== TEST ROUTE ====================
// Simple test route to fetch all papers without any verification
app.get('/test/paperfetch', async (req, res) => {
  const { token } = req.query;

  console.log("Received verification request with token:", token);

  if (!token) {
    console.log("Verification failed: Missing token");
    return res.status(400).json({
      success: false,
      message: "Verification token is missing"
    });
  }

  try {
    console.log("Looking for user with token:", token);

    // First try to find without expiry check to see if token exists at all
    const anyUser = await User.findOne({ verificationToken: token });
    if (!anyUser) {
      console.log("No user found with this token");
      return res.status(400).json({
        success: false,
        message: "Invalid verification token. The token may not exist in our system."
      });
    }

    // Now check with expiry
    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    });

    if (!user) {
      console.log("Token exists but may be expired");
      // Check if token is expired
      const expiredUser = await User.findOne({
        verificationToken: token,
        verificationExpires: { $lte: new Date() }
      });

      if (expiredUser) {
        console.log("Token is expired");
        return res.status(400).json({
          success: false,
          message: "Verification token has expired. Please request a new verification email."
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token. Please request a new verification email."
      });
    }

    console.log("Valid token found, updating user verification status");

    // Update user verification status
    user.verified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    console.log("User email verified successfully");

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in."
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification. Please try again.",
      error: error.message
    });
  }
});

// New verification endpoint for encoded JSON data
app.post('/verify-email-token', async (req, res) => {
  const { token, email } = req.body;

  console.log("Received verification request with token and email:", { token, email });

  if (!token || !email) {
    console.log("Verification failed: Missing token or email");
    return res.status(400).json({
      success: false,
      message: "Verification data is incomplete"
    });
  }

  try {
    // Look for a user with both the token and matching email for added security
    const user = await User.findOne({
      email: email,
      verificationToken: token,
      verificationExpires: { $gt: new Date() }
    });

    if (!user) {
      console.log("Invalid or expired verification data");
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token. Please request a new verification email."
      });
    }

    console.log("Valid token found, updating user verification status");

    // Update user verification status
    user.verified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    console.log("User email verified successfully");

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now log in."
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification. Please try again.",
      error: error.message
    });
  }
});

// Forgot password route
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes

    user.resetPasswordOTP = otp;
    user.resetPasswordExpiry = otpExpiry;
    await user.save();

    await sendOTPEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email"
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing your request",
      error: error.message
    });
  }
});

// Reset password route
app.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const user = await User.findOne({
      email,
      resetPasswordOTP: otp,
      resetPasswordExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful"
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while resetting your password",
      error: error.message
    });
  }
});

// Resend verification email
app.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.verified) {
      return res.status(400).json({ success: false, message: "Email already verified" });
    }

    // Generate a new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Update user with new token and expiry time
    user.verificationToken = verificationToken;
    user.verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    await user.save();

    // Send the verification email
    await sendVerificationEmail(email, verificationToken);

    return res.status(200).json({
      success: true,
      message: "Verification email sent. Please check your inbox."
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while sending the verification email",
      error: error.message
    });
  }
});
// Login endpoint
app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User does not exist" 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: "Incorrect password" 
            });
        }

        if (!user.verified) {
            return res.status(200).json({
                success: false,
                verified: false,
                needsVerification: true,
                message: "Please verify your email before logging in"
            });
        }

        const token = jwt.sign({
            email,
            userId: user._id,
            username: user.username,
            role: user.role
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            success: true,
            verified: true,
            token,
            email: user.email,
            username: user.username,
            role: user.role
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during login",
            error: error.message
        });
    }
});

// Register/Signin endpoint
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: "User already exists" 
            });
        }

        const hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const newUser = new User({
            username: email.split('@')[0],
            email,
            password: hash,
            verified: false,
            verificationToken,
            verificationExpires: new Date(Date.now() + 48 * 60 * 60 * 1000)
        });

        await newUser.save();

        try {
            await sendVerificationEmail(email, verificationToken);
            return res.status(201).json({
                success: true,
                message: "Account created. Please check your email to verify your account."
            });
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            return res.status(201).json({
                success: true,
                message: "Account created, but we couldn't send a verification email. Please contact support."
            });
        }
    } catch (error) {
        console.error("Registration error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during registration",
            error: error.message
        });
    }
});

// Signin (same as register)
app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: "User already exists" 
            });
        }

        const hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const newUser = new User({
            username: email.split('@')[0],
            email,
            password: hash,
            verified: false,
            verificationToken,
            verificationExpires: new Date(Date.now() + 48 * 60 * 60 * 1000)
        });

        await newUser.save();

        try {
            await sendVerificationEmail(email, verificationToken);
            return res.status(201).json({
                success: true,
                message: "Account created. Please check your email to verify your account."
            });
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            return res.status(201).json({
                success: true,
                message: "Account created, but we couldn't send a verification email. Please contact support."
            });
        }
    } catch (error) {
        console.error("Signin error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during registration",
            error: error.message
        });
    }
});

// Verify email endpoint - supports both GET and POST
app.get('/api/auth/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({
            success: false,
            message: "Verification token is required"
        });
    }
    try {
        const user = await User.findOne({
            verificationToken: token,
            verificationExpires: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification token"
            });
        }
        user.verified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Email verified successfully. You can now log in."
        });
    } catch (error) {
        console.error("Verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during verification",
            error: error.message
        });
    }
});

app.post('/api/auth/verify-email', async (req, res) => {
    const { token, email } = req.body;
    if (!token) {
        return res.status(400).json({
            success: false,
            message: "Verification token is required"
        });
    }
    try {
        let query = { verificationToken: token, verificationExpires: { $gt: new Date() } };
        if (email) query.email = email;
        const user = await User.findOne(query);
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification token"
            });
        }
        user.verified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Email verified successfully. You can now log in."
        });
    } catch (error) {
        console.error("Verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during verification",
            error: error.message
        });
    }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }
        if (user.verified) {
            return res.status(400).json({
                success: false,
                message: "Email already verified"
            });
        }
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await user.save();
        await sendVerificationEmail(email, verificationToken);
        return res.status(200).json({
            success: true,
            message: "Verification email sent. Please check your inbox."
        });
    } catch (error) {
        console.error("Resend verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while sending the verification email",
            error: error.message
        });
    }
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
        user.resetPasswordOTP = otp;
        user.resetPasswordExpiry = otpExpiry;
        await user.save();
        await sendOTPEmail(email, otp);
        return res.status(200).json({
            success: true,
            message: "OTP sent to your email"
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred",
            error: error.message
        });
    }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const user = await User.findOne({
            email,
            resetPasswordOTP: otp,
            resetPasswordExpiry: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        user.password = hash;
        user.resetPasswordOTP = undefined;
        user.resetPasswordExpiry = undefined;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Password reset successful"
        });
    } catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred",
            error: error.message
        });
    }
});

// Get current user
app.get('/api/auth/me', verifyJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        return res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching user data",
            error: error.message
        });
    }
});

// ==================== TEST ROUTES ====================
// Simple test route to fetch all papers without any verification
app.get('/test/paperfetch', async (req, res) => {
    try {
        const papers = await PaperSubmission.find({})
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        console.log(`Found ${papers.length} papers in database`);
        
        // Log the first paper to see structure
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

// ✅ Get PDF as Base64 - For editors to fetch user submissions
app.get('/api/editor/pdf/:submissionId', async (req, res) => {
    try {
        const token = req.headers["authorization"]?.replace('Bearer ', '');
        if (!token) {
            return res.status(403).json({ 
                success: false, 
                message: "A token is required for authentication" 
            });
        }

        // Verify JWT
        let decodedUser;
        try {
            decodedUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid token" 
            });
        }

        // Check if user is editor or admin
        const user = await User.findById(decodedUser.userId);
        if (!user || (user.role !== 'Editor' && user.role !== 'Admin')) {
            return res.status(403).json({
                success: false,
                message: "Only editors and admins can access PDFs"
            });
        }

        const { submissionId } = req.params;

        // Find paper in database
        const paper = await PaperSubmission.findOne({ submissionId });
        
        if (!paper || !paper.pdfBase64) {
            return res.status(404).json({
                success: false,
                message: 'Paper or PDF not found'
            });
        }

        // Return PDF as base64 string
        return res.status(200).json({
            success: true,
            submissionId,
            pdfBase64: paper.pdfBase64,
            pdfFileName: paper.pdfFileName,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName,
            email: paper.email,
            message: 'PDF fetched successfully'
        });
    } catch (error) {
        console.error('Error getting PDF:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching PDF',
            error: error.message
        });
    }
});

// ✅ Get All Papers for Editor - With User Details
app.get('/api/editor/papers', async (req, res) => {
    try {
        const token = req.headers["authorization"]?.replace('Bearer ', '');
        if (!token) {
            return res.status(403).json({ 
                success: false, 
                message: "A token is required for authentication" 
            });
        }

        // Verify JWT
        let decodedUser;
        try {
            decodedUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                success: false, 
                message: "Invalid token" 
            });
        }

        // Check if user is editor or admin
        const user = await User.findById(decodedUser.userId);
        if (!user || (user.role !== 'Editor' && user.role !== 'Admin')) {
            return res.status(403).json({
                success: false,
                message: "Only editors and admins can access papers"
            });
        }

        // Fetch all papers, excluding pdfBase64 from list view (too large)
        const papers = await PaperSubmission.find({})
            .select('-pdfBase64 -versions')
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers
        });
    } catch (error) {
        console.error("Error fetching papers:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching papers",
            error: error.message
        });
    }
});

// PDF Fetch endpoint - Streams PDF directly from Cloudinary with proper CORS handling
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

        // If publicId is provided, construct the URL
        if (publicId && process.env.CLOUDINARY_CLOUD_NAME) {
            const decodedPublicId = decodeURIComponent(publicId);
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
            // Remove .pdf extension if present in publicId and add it back to ensure proper format
            const publicIdWithoutExt = decodedPublicId.replace(/\.pdf$/, '');
            pdfUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicIdWithoutExt}.pdf`;
        }

        console.log('Fetching Cloudinary PDF:', pdfUrl);

        // Fetch the PDF
        const response = await fetch(pdfUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/pdf, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://cloudinary.com/'
            }
        });

        console.log('Cloudinary Response Status:', response.status, response.statusText);

        if (!response.ok) {
            console.error('Failed to fetch PDF:', {
                status: response.status,
                statusText: response.statusText,
                url: pdfUrl
            });
            
            // Try alternative Cloudinary format if URL is restricted
            if (response.status === 401 || response.status === 403) {
                console.log('Access denied, trying with download transformation');
                
                // Extract cloud name and public ID from URL
                const urlObj = new URL(pdfUrl);
                const pathMatch = pdfUrl.match(/\/upload\/(.+?)\.pdf$/);
                
                if (pathMatch) {
                    const transformedUrl = pdfUrl.replace(
                        /\/upload\//,
                        `/upload/fl_attachment/`
                    );
                    
                    console.log('Trying transformed URL:', transformedUrl);
                    
                    const retryResponse = await fetch(transformedUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/pdf',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    if (retryResponse.ok) {
                        const buffer = await retryResponse.arrayBuffer();
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Length', buffer.byteLength);
                        res.setHeader('Cache-Control', 'public, max-age=3600');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        return res.send(Buffer.from(buffer));
                    }
                }
            }
            
            return res.status(response.status).json({
                success: false,
                message: `Failed to fetch PDF: ${response.statusText}`,
                status: response.status,
                url: pdfUrl
            });
        }

        // Successfully fetched - set response headers and stream
        const contentType = response.headers.get('content-type') || 'application/pdf';
        const contentLength = response.headers.get('content-length');
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        const buffer = await response.arrayBuffer();
        console.log('Successfully fetched PDF size:', buffer.byteLength, 'bytes');
        
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

// Direct Cloudinary fetch endpoint (for PDFs stored in Cloudinary)
app.get('/test/cloudinary-pdf', async (req, res) => {
    try {
        const { publicId } = req.query;
        
        if (!publicId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cloudinary public ID required' 
            });
        }

        console.log('Fetching Cloudinary PDF:', publicId);
        
        // Construct Cloudinary URL with transformation to get PDF
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const pdfUrl = `https://res.cloudinary.com/${cloudName}/fl_attachment/v1/${publicId}`;
        
        console.log('Cloudinary URL:', pdfUrl);

        const response = await fetch(pdfUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/pdf',
                'Cache-Control': 'no-cache'
            }
        });

        console.log('Cloudinary Response Status:', response.status);

        if (!response.ok) {
            console.error('Cloudinary PDF fetch failed:', response.status, response.statusText);
            return res.status(response.status).json({ 
                success: false, 
                message: 'Failed to fetch PDF from Cloudinary',
                status: response.status
            });
        }

        const contentType = response.headers.get('content-type') || 'application/pdf';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline; filename="paper.pdf"');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('Cloudinary PDF Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching Cloudinary PDF',
            error: error.message
        });
    }
});

// ==================== EDITOR ROUTES ====================
// Verify editor access
app.get('/api/editor/verify-access', verifyJWT, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;

        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only editors can access this resource.'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role !== 'Editor' && user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'User does not have editor privileges'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Editor access verified',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error verifying editor access:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying editor access',
            error: error.message
        });
    }
});

// Get all papers (for editor dashboard)
app.get('/api/editor/papers', verifyJWT, async (req, res) => {
    try {
        const userRole = req.user.role;

        // Check editor access
        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only editors can view papers.'
            });
        }

        const papers = await PaperSubmission.find({})
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers
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

// Get all reviewers
app.get('/api/editor/reviewers', verifyJWT, async (req, res) => {
    try {
        const userRole = req.user.role;

        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        const reviewers = await User.find({ role: 'Reviewer' })
            .select('-password')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reviewers.length,
            reviewers
        });
    } catch (error) {
        console.error('Error fetching reviewers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching reviewers',
            error: error.message
        });
    }
});

// Create reviewer account
app.post('/api/editor/reviewers', verifyJWT, async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const userRole = req.user.role;

        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Only editors can create reviewers.'
            });
        }

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password
        const hash = await bcrypt.hash(password, 10);

        // Create new reviewer
        const newReviewer = new User({
            username: username || email.split('@')[0],
            email,
            password: hash,
            role: 'Reviewer',
            verified: true
        });

        await newReviewer.save();

        // Send credentials email
        try {
            const { sendReviewerCredentialsEmail } = await import('./utils/emailService.js');
            await sendReviewerCredentialsEmail(email, username || email.split('@')[0], password);
        } catch (emailError) {
            console.error('Error sending reviewer credentials email:', emailError);
            // Don't fail the request if email fails
        }

        return res.status(201).json({
            success: true,
            message: 'Reviewer account created successfully',
            reviewer: {
                id: newReviewer._id,
                email: newReviewer.email,
                username: newReviewer.username,
                role: newReviewer.role
            }
        });
    } catch (error) {
        console.error('Error creating reviewer:', error);
        return res.status(500).json({
            success: false,
            message: 'Error creating reviewer',
            error: error.message
        });
    }
});

// Assign reviewers to paper
app.post('/api/editor/assign-reviewers', verifyJWT, async (req, res) => {
    try {
        const { paperId, reviewerIds } = req.body;
        const userRole = req.user.role;

        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Only editors can assign reviewers.'
            });
        }

        if (!paperId || !reviewerIds || reviewerIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Paper ID and reviewer IDs are required'
            });
        }

        // Find paper
        const paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Add reviewers
        paper.assignedReviewers = [...new Set([...paper.assignedReviewers, ...reviewerIds])];
        paper.status = 'Under Review';
        await paper.save();

        // Populate reviewers for response
        await paper.populate('assignedReviewers', 'username email');

        return res.status(200).json({
            success: true,
            message: 'Reviewers assigned successfully',
            paper
        });
    } catch (error) {
        console.error('Error assigning reviewers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error assigning reviewers',
            error: error.message
        });
    }
});

// Get paper reviews
app.get('/api/editor/papers/:paperId/reviews', verifyJWT, async (req, res) => {
    try {
        const { paperId } = req.params;
        const userRole = req.user.role;

        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        const reviews = await Review.find({ paper: paperId })
            .populate('reviewer', 'username email')
            .populate('paper', 'paperTitle submissionId');

        return res.status(200).json({
            success: true,
            count: reviews.length,
            reviews
        });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message
        });
    }
});

// ==================== REVIEWER ROUTES ====================
// Get papers assigned to reviewer
app.get('/api/reviewer/papers', verifyJWT, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;

        if (userRole !== 'Reviewer' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        const papers = await PaperSubmission.find({
            assignedReviewers: userId
        })
        .populate('assignedEditor', 'username email')
        .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers
        });
    } catch (error) {
        console.error('Error fetching reviewer papers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching papers',
            error: error.message
        });
    }
});

// Submit review
app.post('/api/reviewer/submit-review', verifyJWT, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { paperId, recommendation, ratings, commentsToAuthor, confidentialCommentsToEditor, additionalQuestions } = req.body;
        const userRole = req.user.role;

        if (userRole !== 'Reviewer' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Only reviewers can submit reviews.'
            });
        }

        if (!paperId || !recommendation) {
            return res.status(400).json({
                success: false,
                message: 'Paper ID and recommendation are required'
            });
        }

        // Check if review already exists
        const existingReview = await Review.findOne({
            paper: paperId,
            reviewer: userId
        });

        let review;
        if (existingReview) {
            // Update existing review
            existingReview.recommendation = recommendation;
            existingReview.ratings = ratings;
            existingReview.commentsToAuthor = commentsToAuthor;
            existingReview.confidentialCommentsToEditor = confidentialCommentsToEditor;
            existingReview.additionalQuestions = additionalQuestions;
            existingReview.status = 'Submitted';
            await existingReview.save();
            review = existingReview;
        } else {
            // Create new review
            review = new Review({
                paper: paperId,
                reviewer: userId,
                recommendation,
                ratings,
                commentsToAuthor,
                confidentialCommentsToEditor,
                additionalQuestions,
                status: 'Submitted'
            });
            await review.save();
        }

        await review.populate('paper', 'paperTitle submissionId');

        return res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            review
        });
    } catch (error) {
        console.error('Error submitting review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error submitting review',
            error: error.message
        });
    }
});

// Get review for a specific paper (reviewer's own review)
app.get('/api/reviewer/papers/:paperId/review', verifyJWT, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { paperId } = req.params;

        const review = await Review.findOne({
            paper: paperId,
            reviewer: userId
        })
        .populate('paper', 'paperTitle submissionId pdfUrl')
        .populate('reviewer', 'username email');

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        return res.status(200).json({
            success: true,
            review
        });
    } catch (error) {
        console.error('Error fetching review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching review',
            error: error.message
        });
    }
});

// Get current user
app.get('/api/auth/me', verifyJWT, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        return res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching user data",
            error: error.message
        });
    }
});

// Legacy routes for backward compatibility
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User does not exist" 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: "Incorrect password" 
            });
        }

        if (!user.verified) {
            return res.status(200).json({
                success: false,
                verified: false,
                needsVerification: true,
                message: "Please verify your email before logging in"
            });
        }

        const token = jwt.sign({
            email,
            userId: user._id,
            username: user.username,
            role: user.role
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
            success: true,
            verified: true,
            token,
            email: user.email,
            username: user.username,
            role: user.role
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during login",
            error: error.message
        });
    }
});

app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: "User already exists" 
            });
        }

        const hash = await bcrypt.hash(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        const newUser = new User({
            username: email.split('@')[0],
            email,
            password: hash,
            verified: false,
            verificationToken,
            verificationExpires: new Date(Date.now() + 48 * 60 * 60 * 1000)
        });

        await newUser.save();

        try {
            await sendVerificationEmail(email, verificationToken);
            return res.status(201).json({
                success: true,
                message: "Account created. Please check your email to verify your account."
            });
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
            return res.status(201).json({
                success: true,
                message: "Account created, but we couldn't send a verification email. Please contact support."
            });
        }
    } catch (error) {
        console.error("Signin error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during registration",
            error: error.message
        });
    }
});

app.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).json({
            success: false,
            message: "Verification token is required"
        });
    }
    try {
        const user = await User.findOne({
            verificationToken: token,
            verificationExpires: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification token"
            });
        }
        user.verified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Email verified successfully. You can now log in."
        });
    } catch (error) {
        console.error("Verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred during verification",
            error: error.message
        });
    }
});

app.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }
        if (user.verified) {
            return res.status(400).json({
                success: false,
                message: "Email already verified"
            });
        }
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await user.save();
        await sendVerificationEmail(email, verificationToken);
        return res.status(200).json({
            success: true,
            message: "Verification email sent. Please check your inbox."
        });
    } catch (error) {
        console.error("Resend verification error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred",
            error: error.message
        });
    }
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiry = new Date();
        otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
        user.resetPasswordOTP = otp;
        user.resetPasswordExpiry = otpExpiry;
        await user.save();
        await sendOTPEmail(email, otp);
        return res.status(200).json({
            success: true,
            message: "OTP sent to your email"
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred",
            error: error.message
        });
    }
});

app.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const user = await User.findOne({
            email,
            resetPasswordOTP: otp,
            resetPasswordExpiry: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        user.password = hash;
        user.resetPasswordOTP = undefined;
        user.resetPasswordExpiry = undefined;
        await user.save();
        return res.status(200).json({
            success: true,
            message: "Password reset successful"
        });
    } catch (error) {
        console.error("Reset password error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred",
            error: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
    });
});


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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ICMBNT 2026 Research Paper Management System           ║
║   Server running on http://localhost:${PORT}                ║
║                                                           ║
║   API Endpoints:                                          ║
║   - Auth:     /api/auth                                   ║
║   - Papers:   /api/papers                                 ║
║   - Admin:    /api/admin                                  ║
║   - Editor:   /api/editor                                 ║
║   - Reviewer: /api/reviewer                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
