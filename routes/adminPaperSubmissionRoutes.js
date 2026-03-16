import express from 'express';
import {
    adminSubmitPaperForAuthor,
    searchExistingAuthors
} from '../controllers/adminPaperSubmissionController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';
import { uploadPaperPDF } from '../middleware/upload.js';

const router = express.Router();

// Search existing authors (for admin to select)
router.get('/search-authors', verifyJWT, requireRole('Admin', 'Editor'), searchExistingAuthors);

// Admin submit paper on behalf of author
router.post('/submit-for-author', 
    verifyJWT, 
    requireRole('Admin', 'Editor'), 
    uploadPaperPDF.single('pdf'), 
    adminSubmitPaperForAuthor
);

export default router;
