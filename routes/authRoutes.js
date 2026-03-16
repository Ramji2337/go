import express from 'express';
import {
    register,
    login,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    getCurrentUser,
    checkAcceptanceStatus,
    updateUserCountry
} from '../controllers/authController.js';
import { verifyJWT } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/signin', register); // Alias for register
router.post('/login', login);
router.post('/logout', logout);

// Verify email routes - support both GET and POST
router.get('/verify-email', verifyEmail);
router.post('/verify-email', verifyEmail);
router.post('/verify-email-token', verifyEmail); // Alias

// Password and verification routes
router.post('/resend-verification', resendVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', verifyJWT, getCurrentUser);
router.get('/check-acceptance-status', verifyJWT, checkAcceptanceStatus);
router.put('/update-country', verifyJWT, updateUserCountry);

export default router;

