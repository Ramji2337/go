import express from 'express';
import {
    verifyEditorAccess,
    getAssignedPapers,
    createReviewer,
    getAllReviewers,
    assignReviewers,
    getPaperReviews,
    makeFinalDecision,
    getEditorDashboardStats,
    getAllPapers,
    getPdfBase64,
    getReviewerDetails,
    sendMessage,
    getMessageThread,
    getPaperMessages,
    getAllMessages,
    getNonRespondingReviewers,
    sendReviewerReminder,
    sendBulkReminders,
    getAllPdfs,
    deletePdf,
    sendMessageToReviewer,
    sendMessageToAuthor,
    requestRevision,
    acceptPaper,
    rejectPaper,
    getRevisionStatus,
    submitRevisedPaper,
    removeReviewerFromPaper,
    sendReviewerInquiry,
    sendReReviewEmails,
    deleteReview,
    updateReview,
    getPaperReReviews,
    updateReviewerDetails,
    deleteReviewerFromSystem,
    getAllAcceptedPapers,
    getAcceptedPapersByCategory,
    getAcceptedPapersByAuthor,
    getHighRatedPapers,
    getAcceptedPaperDetails,
    getAcceptanceStatistics,
    updateAcceptanceStatus
} from '../controllers/editorController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireEditor } from '../middleware/roleCheck.js';

const router = express.Router();

// All editor routes require authentication and editor role
router.use(verifyJWT, requireEditor);

// Verify editor access
router.get('/verify-access', verifyEditorAccess);

// Paper management
router.get('/papers', getAllPapers);              // Get ALL papers (not just assigned)
router.get('/pdf/:submissionId', getPdfBase64);  // Get PDF as base64
router.get('/papers/:paperId/reviews', getPaperReviews);

// Reviewer management
router.post('/reviewers', createReviewer);
router.get('/reviewers', getAllReviewers);
router.put('/reviewers/:reviewerId', updateReviewerDetails);    // Update reviewer details
router.delete('/reviewers/:reviewerId', deleteReviewerFromSystem); // Delete reviewer
router.post('/assign-reviewers', assignReviewers);
router.post('/remove-reviewer', removeReviewerFromPaper);
router.post('/send-reviewer-inquiry', sendReviewerInquiry);

// Reviewer details and messaging
router.get('/review/:reviewId', getReviewerDetails);
router.get('/messages', getAllMessages);
router.get('/papers/:paperId/messages', getPaperMessages);
router.get('/messages/:submissionId/:reviewId', getMessageThread);
router.post('/send-message', sendMessage);
router.post('/send-message-to-reviewer', sendMessageToReviewer);
router.post('/send-message-to-author', sendMessageToAuthor);

// Decision making - Revision requests use the existing requestRevision function
router.post('/make-decision', makeFinalDecision);
router.post('/request-revision', requestRevision);     // Request revision (original function handles multiple requests)
router.post('/accept-paper', acceptPaper);
router.post('/reject-paper/:paperId', rejectPaper);    // Reject paper and store in RejectedPaper collection
router.post('/send-re-review-emails', sendReReviewEmails);

// Review management - CRUD operations
router.delete('/reviews/:reviewId', deleteReview);     // Delete a review
router.put('/reviews/:reviewId', updateReview);        // Update/edit a review
router.get('/papers/:paperId/re-reviews', getPaperReReviews); // Get re-reviews (Round 2)

// Reviewer reminders
router.get('/non-responding-reviewers', getNonRespondingReviewers);
router.post('/send-reminder', sendReviewerReminder);
router.post('/send-bulk-reminders', sendBulkReminders);

// PDF Management
router.get('/pdfs', getAllPdfs);          // Get all PDFs from Cloudinary
router.delete('/pdfs', deletePdf);        // Delete PDF from Cloudinary

// Dashboard statistics
router.get('/dashboard-stats', getEditorDashboardStats);

// ========================================
// FINAL ACCEPTANCE / ACCEPTED PAPERS MANAGEMENT
// ========================================
router.get('/accepted-papers', getAllAcceptedPapers);                           // Get all accepted papers
router.get('/accepted-papers/category/:category', getAcceptedPapersByCategory); // Get by category
router.get('/accepted-papers/author/:email', getAcceptedPapersByAuthor);        // Get by author email
router.get('/accepted-papers/high-rated', getHighRatedPapers);                  // Get high-rated papers
router.get('/accepted-papers/:submissionId', getAcceptedPaperDetails);          // Get single paper details
router.get('/acceptance-statistics', getAcceptanceStatistics);                  // Get statistics
router.put('/accepted-papers/:submissionId/status', updateAcceptanceStatus);    // Update status

// Selected users routes (shared with admin but role check is verified by verifyJWT + role Check)
router.get('/selected-users', (req, res, next) => {
    // We can reuse the adminController function if we export it properly
    import('../controllers/adminController.js').then(m => m.getConferenceSelectedUsers(req, res, next));
});
router.post('/selected-users/send-email', (req, res, next) => {
    import('../controllers/adminController.js').then(m => m.sendSelectedUserEmail(req, res, next));
});

export default router;
