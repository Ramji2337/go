import express from 'express';
import FinalAcceptance from '../models/FinalAcceptance.js';
import { PaperSubmission } from '../models/Paper.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * DEBUG ENDPOINT: Check user's paper status
 * This endpoint helps debug why a user might not be showing as an author
 */
router.get('/debug/my-papers', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;

        console.log('🔍 DEBUG: Checking papers for email:', userEmail);

        // Check PaperSubmission collection
        const submissions = await PaperSubmission.find({ email: userEmail })
            .select('submissionId paperTitle status createdAt')
            .sort({ createdAt: -1 });

        // Check FinalAcceptance collection
        const acceptances = await FinalAcceptance.find({ authorEmail: userEmail })
            .select('submissionId paperTitle acceptanceDate paymentStatus')
            .sort({ acceptanceDate: -1 });

        // Also check with case-insensitive search
        const submissionsCI = await PaperSubmission.find({
            email: { $regex: new RegExp(`^${userEmail}$`, 'i') }
        })
            .select('submissionId paperTitle email status createdAt')
            .sort({ createdAt: -1 });

        const acceptancesCI = await FinalAcceptance.find({
            authorEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') }
        })
            .select('submissionId paperTitle authorEmail acceptanceDate paymentStatus')
            .sort({ acceptanceDate: -1 });

        res.json({
            success: true,
            userEmail,
            summary: {
                totalSubmissions: submissions.length,
                totalAcceptances: acceptances.length,
                totalSubmissionsCI: submissionsCI.length,
                totalAcceptancesCI: acceptancesCI.length
            },
            submissions: {
                exact: submissions,
                caseInsensitive: submissionsCI
            },
            acceptances: {
                exact: acceptances,
                caseInsensitive: acceptancesCI
            },
            diagnosis: {
                hasSubmissions: submissions.length > 0 || submissionsCI.length > 0,
                hasAcceptances: acceptances.length > 0 || acceptancesCI.length > 0,
                shouldShowAsAuthor: acceptances.length > 0 || acceptancesCI.length > 0,
                reason: acceptances.length > 0 || acceptancesCI.length > 0
                    ? 'User has accepted papers and should show as Author'
                    : submissions.length > 0 || submissionsCI.length > 0
                        ? 'User has submissions but no accepted papers yet'
                        : 'No papers found for this user'
            }
        });

    } catch (error) {
        console.error('❌ Error in debug endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch debug info',
            error: error.message
        });
    }
});

/**
 * DEBUG ENDPOINT: Search for papers by email
 * Allows searching for any email address
 */
router.get('/debug/search-papers/:email', async (req, res) => {
    try {
        const searchEmail = req.params.email;

        console.log('🔍 DEBUG: Searching papers for email:', searchEmail);

        // Check PaperSubmission collection
        const submissions = await PaperSubmission.find({
            email: { $regex: new RegExp(`^${searchEmail}$`, 'i') }
        })
            .select('submissionId paperTitle email status createdAt')
            .sort({ createdAt: -1 });

        // Check FinalAcceptance collection
        const acceptances = await FinalAcceptance.find({
            authorEmail: { $regex: new RegExp(`^${searchEmail}$`, 'i') }
        })
            .select('submissionId paperTitle authorEmail acceptanceDate paymentStatus')
            .sort({ acceptanceDate: -1 });

        res.json({
            success: true,
            searchEmail,
            found: {
                submissions: submissions.length,
                acceptances: acceptances.length
            },
            submissions,
            acceptances
        });

    } catch (error) {
        console.error('❌ Error in search endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search papers',
            error: error.message
        });
    }
});

export default router;
