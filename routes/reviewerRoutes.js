import express from 'express';
import {
    getAssignedPapers,
    getPaperForReview,
    submitReview,
    getReviewDraft,
    getReviewerDashboardStats,
    acceptReviewerAssignment,
    rejectReviewerAssignment,
    getRejectionForm,
    getAssignmentDetails,
    acceptAssignment,
    rejectAssignment,
    submitReReview,
    acceptAssignmentBySubmission,
    getMessageThread,
    sendMessage,
    getAllMessageThreads
} from '../controllers/reviewerController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireReviewer } from '../middleware/roleCheck.js';

const router = express.Router();

// Public routes (no authentication required for confirmation page)
router.get('/assignment/:assignmentId', getAssignmentDetails); // Get assignment details for confirmation page
router.post('/accept-assignment', acceptAssignment); // Accept assignment via confirmation page (no auth)
router.post('/reject-assignment', rejectAssignment); // Reject assignment via confirmation page (no auth)

// Legacy token-based acceptance/rejection (for backward compatibility)
router.post('/accept-with-token', acceptReviewerAssignment);
router.post('/reject-with-token', rejectReviewerAssignment);
router.get('/rejection-form', getRejectionForm);

// All reviewer routes below require authentication and reviewer role
router.use(verifyJWT, requireReviewer);

// Paper review
router.get('/papers', getAssignedPapers);
router.get('/papers/:submissionId', getPaperForReview);
router.get('/papers/:submissionId/draft', getReviewDraft);
router.post('/papers/:submissionId/submit-review', submitReview);
router.post('/papers/:submissionId/submit-re-review', submitReReview); // Submit re-review (Round 2)
router.post('/papers/:submissionId/accept-assignment', acceptAssignmentBySubmission); // Accept assignment using submissionId

// Dashboard statistics
router.get('/dashboard-stats', getReviewerDashboardStats);

// Messaging
router.get('/messages', getAllMessageThreads);
router.get('/messages/:submissionId', getMessageThread);
router.post('/send-message', sendMessage);

export default router;
