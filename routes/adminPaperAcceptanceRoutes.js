import express from 'express';
import {
    adminDirectAcceptPaper,
    getAllPendingPapers,
    adminUploadCameraReady
} from '../controllers/adminPaperAcceptanceController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { uploadPaperPDF } from '../middleware/upload.js';

const router = express.Router();

// Get all pending papers for admin acceptance
router.get('/pending-papers', verifyJWT, requireRole('Admin'), getAllPendingPapers);

// Admin direct accept paper without reviewer requirement
router.post('/accept-paper', verifyJWT, requireRole('Admin'), adminDirectAcceptPaper);

// Admin upload camera-ready paper on behalf of author
router.post('/upload-camera-ready/:submissionId', 
    verifyJWT, 
    requireRole('Admin'), 
    uploadPaperPDF.single('cameraReadyPdf'), 
    adminUploadCameraReady
);

export default router;
