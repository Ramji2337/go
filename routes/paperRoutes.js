import express from 'express';
import {
    submitPaper,
    getUserSubmission,
    getPaperStatus,
    editSubmission,
    getAllPapers,
    getPaperById,
    submitRevision,
    getRevisionData,
    getAllRevisions,
    reuploadPaper,
    getPaperHistory,
    checkFinalSelection,
    uploadFinalDoc,
    submitMultiplePaper
} from '../controllers/paperController.js';
import { getPaperCounts } from '../controllers/paperCountController.js';
import { getConferenceSelectedUsers } from '../controllers/adminController.js';
import { verifyJWT } from '../middleware/auth.js';
import { uploadPaperPDF, uploadFinalDocument } from '../middleware/upload.js';
import { requireRole } from '../middleware/roleCheck.js';

const router = express.Router();

// Paper Count Analytics
router.get('/count', verifyJWT, getPaperCounts);

// Author routes
router.post('/submit', verifyJWT, uploadPaperPDF.single('pdf'), submitPaper);
router.post('/submit-multiple', verifyJWT, uploadPaperPDF.single('pdf'), submitMultiplePaper);
router.get('/my-submission', verifyJWT, getUserSubmission);
router.get('/check-selection', verifyJWT, checkFinalSelection);
router.put('/edit/:submissionId', verifyJWT, uploadPaperPDF.single('pdf'), editSubmission);
router.post('/reupload/:submissionId', verifyJWT, uploadPaperPDF.single('pdf'), reuploadPaper);
router.post('/upload-final-doc/:submissionId', verifyJWT, uploadFinalDocument.single('finalDoc'), uploadFinalDoc);
router.post('/submit-revision', verifyJWT, uploadPaperPDF.fields([
    { name: 'cleanPdf', maxCount: 1 },
    { name: 'highlightedPdf', maxCount: 1 },
    { name: 'responsePdf', maxCount: 1 }
]), submitRevision);

// Public/semi-public routes
router.get('/status/:submissionId', getPaperStatus);
router.get('/revision/:submissionId', verifyJWT, getRevisionData);  // Allow authenticated reviewers to fetch revision data
router.get('/revisions/:submissionId', verifyJWT, getAllRevisions);  // Get all revisions for a paper
router.get('/:submissionId/history', verifyJWT, getPaperHistory);  // Get full paper history

// Admin/Editor routes
router.get('/all', verifyJWT, requireRole('Admin', 'Editor'), getAllPapers);
router.get('/selected-users', verifyJWT, requireRole('Admin', 'Editor'), getConferenceSelectedUsers);
router.get('/:id', verifyJWT, requireRole('Admin', 'Editor', 'Reviewer'), getPaperById);

export default router;
