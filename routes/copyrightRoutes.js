import express from 'express';
import {
    getAuthorCopyrightDashboard,
    uploadCopyrightForm,
    sendCopyrightMessage,
    getAllCopyrightForms,
    reviewCopyrightForm,
    uploadCameraReady,
    markCopyrightMessagesAsRead
} from '../controllers/copyrightController.js';
import jwt from 'jsonwebtoken';
import { uploadReviewFile } from '../middleware/upload.js';

const router = express.Router();

// Middleware to verify JWT
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

// Author Routes
router.get('/author/dashboard', verifyJWT, getAuthorCopyrightDashboard);
router.post('/author/upload', verifyJWT, uploadReviewFile.single('file'), uploadCopyrightForm);
router.post('/author/upload-camera-ready', verifyJWT, uploadReviewFile.single('cameraReadyPdf'), uploadCameraReady);
router.post('/message', verifyJWT, sendCopyrightMessage);
router.post('/mark-read', verifyJWT, markCopyrightMessagesAsRead);

// Admin Routes
router.get('/admin/list', verifyJWT, (req, res, next) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}, getAllCopyrightForms);

router.post('/admin/review', verifyJWT, (req, res, next) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
}, reviewCopyrightForm);

export default router;
