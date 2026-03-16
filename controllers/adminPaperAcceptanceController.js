import { PaperSubmission } from '../models/Paper.js';
import FinalAcceptance from '../models/FinalAcceptance.js';
import { Copyright } from '../models/Copyright.js';
import { sendAcceptanceEmail } from '../utils/emailService.js';
import { emitToUser } from '../socket.js';

// Admin: Direct paper acceptance without reviewer requirement
export const adminDirectAcceptPaper = async (req, res) => {
    try {
        const { submissionId, paperTitle, authorEmail, authorName, category } = req.body;

        if (!submissionId || !paperTitle || !authorEmail) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: submissionId, paperTitle, authorEmail'
            });
        }

        // Find the paper
        const paper = await PaperSubmission.findOne({ submissionId });
        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Update paper status to Accepted
        paper.status = 'Accepted';
        paper.finalDecision = 'Accept';
        paper.acceptedAt = new Date();
        paper.acceptedBy = req.user.id;
        paper.acceptedByAdmin = true;
        await paper.save();

        // Create FinalAcceptance record
        const finalAcceptance = new FinalAcceptance({
            submissionId: paper.submissionId,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName || authorName,
            authorEmail: paper.email || authorEmail,
            category: paper.category || category,
            pdfUrl: paper.pdfUrl,
            pdfPublicId: paper.pdfPublicId,
            pdfFileName: paper.pdfFileName,
            status: 'Accepted',
            finalDecision: 'Accept',
            acceptedAt: new Date(),
            acceptedBy: req.user.id
        });
        await finalAcceptance.save();

        // Create Copyright record for accepted paper
        const copyright = new Copyright({
            submissionId: paper.submissionId,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName || authorName,
            authorEmail: paper.email || authorEmail,
            category: paper.category || category,
            paperId: paper._id,
            status: 'Pending',
            messages: []
        });
        await copyright.save();

        // Send acceptance email
        try {
            await sendAcceptanceEmail(
                paper.email || authorEmail,
                paper.authorName || authorName,
                paper.paperTitle,
                paper.submissionId
            );
        } catch (emailError) {
            console.error('Failed to send acceptance email:', emailError);
        }

        // Notify Author via Socket
        emitToUser(paper.email || authorEmail, 'paper:status_changed', {
            submissionId: paper.submissionId,
            status: 'Accepted',
            paperTitle: paper.paperTitle
        });

        return res.status(200).json({
            success: true,
            message: 'Paper accepted successfully by Admin',
            paper: {
                submissionId: paper.submissionId,
                paperTitle: paper.paperTitle,
                status: 'Accepted',
                finalDecision: 'Accept'
            }
        });
    } catch (error) {
        console.error('Error in adminDirectAcceptPaper:', error);
        return res.status(500).json({
            success: false,
            message: 'Error accepting paper',
            error: error.message
        });
    }
};

// Admin: Get all pending papers for direct acceptance
export const getAllPendingPapers = async (req, res) => {
    try {
        const { PaperSubmission } = await import('../models/Paper.js');
        
        // Get all papers that are not yet accepted or rejected
        const pendingPapers = await PaperSubmission.find({
            status: { $nin: ['Accepted', 'Rejected', 'Published', 'Certificate Generated'] }
        }).sort({ submittedAt: -1 });

        // Get all papers that are already accepted (for reference)
        const acceptedPapers = await PaperSubmission.find({
            status: { $in: ['Accepted', 'Published', 'Certificate Generated'] }
        }).sort({ acceptedAt: -1 }).limit(20);

        return res.status(200).json({
            success: true,
            pendingPapers,
            acceptedPapers,
            count: {
                pending: pendingPapers.length,
                accepted: acceptedPapers.length
            }
        });
    } catch (error) {
        console.error('Error in getAllPendingPapers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching papers',
            error: error.message
        });
    }
};

// Admin: Upload camera-ready paper on behalf of author
export const adminUploadCameraReady = async (req, res) => {
    try {
        const { submissionId } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Find the copyright record
        const copyright = await Copyright.findOne({ submissionId });
        if (!copyright) {
            return res.status(404).json({
                success: false,
                message: 'Copyright record not found'
            });
        }

        // Upload to Cloudinary would happen here via middleware
        // For now, use the file info from the request
        const fileUrl = req.file.path || req.file.url || `/uploads/${req.file.filename}`;
        
        copyright.cameraReadyUrl = fileUrl;
        copyright.cameraReadyFileName = req.file.originalname;
        copyright.cameraReadyUploadedAt = new Date();
        copyright.cameraReadyUploadedBy = req.user.id;
        await copyright.save();

        return res.status(200).json({
            success: true,
            message: 'Camera-ready paper uploaded successfully',
            cameraReadyUrl: fileUrl
        });
    } catch (error) {
        console.error('Error in adminUploadCameraReady:', error);
        return res.status(500).json({
            success: false,
            message: 'Error uploading camera-ready paper',
            error: error.message
        });
    }
};
