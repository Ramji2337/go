import { PaperSubmission } from '../models/Paper.js';
import { Revision } from '../models/Revision.js';
import { emitToUser, emitToAdmins } from '../socket.js';
import { User } from '../models/User.js';
import { generateSubmissionId, generateBookingId } from '../utils/helpers.js';
import { sendPaperSubmissionEmail, sendAcceptanceEmail, sendDecisionEmail, sendAdminNotificationEmail } from '../utils/emailService.js';
import { uploadPdfToCloudinary, deletePdfFromCloudinary } from '../config/cloudinary-pdf.js';

export const submitPaper = async (req, res) => {
    console.log('Received paper submission request:', req.body);
    console.log('File received:', req.file ? 'Yes, ' + req.file.originalname : 'No file');

    try {
        let { email, paperTitle, authorName, category, topic, abstract } = req.body;

        if (!email && req.user && req.user.email) {
            email = req.user.email;
            console.log('Email extracted from token:', email);
        }

        // Validate required fields
        if (!paperTitle || !authorName || !email || !category) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: paperTitle, authorName, email, category"
            });
        }

        // Check if PDF file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "PDF file is required"
            });
        }

        // Generate submission ID and booking ID
        const submissionId = await generateSubmissionId(category);
        const bookingId = generateBookingId();

        console.log('Generated IDs:', { submissionId, bookingId });

        // Upload PDF to Cloudinary
        let pdfUrl, pdfPublicId, pdfFileName;
        try {
            const cloudinaryResult = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);
            pdfUrl = cloudinaryResult.url;
            pdfPublicId = cloudinaryResult.publicId;
            pdfFileName = cloudinaryResult.fileName;

            console.log('PDF uploaded to Cloudinary:', {
                fileName: pdfFileName,
                url: pdfUrl,
                publicId: pdfPublicId
            });
        } catch (uploadError) {
            console.error('Failed to upload PDF to Cloudinary:', uploadError.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload PDF: ' + uploadError.message
            });
        }

        // Create new submission — always creates a new record regardless of existing submissions
        const newSubmission = new PaperSubmission({
            submissionId,
            paperTitle,
            authorName,
            email,
            category,
            topic: topic || null,
            abstract: abstract || null,
            pdfUrl,
            pdfPublicId,
            pdfFileName,
            status: 'Submitted',
            versions: [{
                version: 1,
                pdfUrl,
                pdfPublicId,
                pdfFileName,
                submittedAt: new Date()
            }]
        });

        await newSubmission.save();

        console.log('Submission saved successfully:', submissionId);

        // Send confirmation emails
        try {
            await Promise.all([
                sendPaperSubmissionEmail({
                    email,
                    authorName,
                    submissionId,
                    paperTitle,
                    category
                }),
                sendAdminNotificationEmail({
                    submissionId,
                    authorName,
                    email,
                    paperTitle,
                    category,
                    topic
                })
            ]);

            console.log('Confirmation emails sent successfully');
        } catch (emailError) {
            console.error('Error sending confirmation emails:', emailError);
            // Don't fail the submission if email fails
        }

        return res.status(201).json({
            success: true,
            message: "Paper submitted successfully",
            submissionId,
            bookingId,
            paperDetails: {
                title: paperTitle,
                category,
                status: 'Submitted',
                fileName: pdfFileName
            }
        });
    } catch (error) {
        console.error('Error submitting paper:', error);
        return res.status(500).json({
            success: false,
            message: "Error processing paper submission",
            error: error.message
        });
    }
};

// submitMultiplePaper — now delegates to PaperSubmission with isMultiple: true
export const submitMultiplePaper = async (req, res) => {
    console.log('--- MULTIPLE PAPER SUBMISSION (unified collection) ---');
    try {
        let { email, paperTitle, authorName, category, topic, abstract } = req.body;

        if (!email && req.user && req.user.email) {
            email = req.user.email;
        }

        if (!paperTitle || !authorName || !email || !category) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "PDF file is required" });
        }

        const submissionId = await generateSubmissionId(category);
        const bookingId = generateBookingId();
        const cloudinaryResult = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);

        // Save to the unified PaperSubmission collection with isMultiple flag
        const newSubmission = new PaperSubmission({
            submissionId,
            paperTitle,
            authorName,
            email,
            category,
            topic: topic || null,
            abstract: abstract || null,
            pdfUrl: cloudinaryResult.url,
            pdfPublicId: cloudinaryResult.publicId,
            pdfFileName: cloudinaryResult.fileName,
            status: 'Submitted',
            isMultiple: true,
            versions: [{
                version: 1,
                pdfUrl: cloudinaryResult.url,
                pdfPublicId: cloudinaryResult.publicId,
                pdfFileName: cloudinaryResult.fileName,
                submittedAt: new Date()
            }]
        });

        await newSubmission.save();

        await sendPaperSubmissionEmail({ email, authorName, submissionId, paperTitle, category });

        // Notify Admins
        emitToAdmins('paper:new_submission', {
            submissionId,
            paperTitle,
            authorName,
            category
        });

        return res.status(201).json({
            success: true,
            message: "Additional paper submitted successfully",
            submissionId,
            bookingId,
            paperDetails: {
                title: paperTitle,
                category,
                status: 'Submitted',
                fileName: cloudinaryResult.fileName
            }
        });
    } catch (error) {
        console.error('Error submitting multiple paper:', error);
        return res.status(500).json({
            success: false,
            message: "Error processing paper submission",
            error: error.message
        });
    }
};

export const getUserSubmission = async (req, res) => {
    try {
        const { email } = req.user;

        // Fetch all paper submissions from the single unified collection
        const paperSubmissions = await PaperSubmission.find({ email: { $regex: new RegExp(`^${email}$`, 'i') } })
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        // Check for verified payment
        const { PaymentDoneFinalUser } = await import('../models/PaymentDoneFinalUser.js');
        const payment = await PaymentDoneFinalUser.findOne({ authorEmail: email });

        return res.status(200).json({
            success: true,
            hasSubmission: paperSubmissions.length > 0,
            submission: paperSubmissions.length > 0 ? {
                ...paperSubmissions[0].toObject(),
                isPaid: !!payment
            } : null,
            submissions: paperSubmissions.map(p => ({
                ...p.toObject(),
                isPaid: !!payment
            }))
        });
    } catch (error) {
        console.error("Error fetching user submission:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching submission details",
            error: error.message
        });
    }
};

// Get paper status by submission ID
export const getPaperStatus = async (req, res) => {
    try {
        const { submissionId } = req.params;

        const submission = await PaperSubmission.findOne({ submissionId })
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email');

        if (!submission) {
            return res.status(404).json({
                success: false,
                message: "Submission not found"
            });
        }

        return res.json({
            success: true,
            submission
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error retrieving submission status",
            error: error.message
        });
    }
};

// Edit/Update submission
export const editSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { email } = req.user;

        // Verify the submission belongs to the user and get the paper
        const paperSubmission = await PaperSubmission.findOne({ submissionId, email });

        if (!paperSubmission) {
            return res.status(404).json({
                success: false,
                message: "Submission not found or you don't have permission to edit it"
            });
        }

        // Update the fields
        if (req.body.paperTitle) paperSubmission.paperTitle = req.body.paperTitle;
        if (req.body.category) paperSubmission.category = req.body.category;
        if (req.body.topic) paperSubmission.topic = req.body.topic;
        if (req.body.authorName) paperSubmission.authorName = req.body.authorName;
        if (req.body.abstract) paperSubmission.abstract = req.body.abstract;

        // Handle file upload if new file provided
        if (req.file) {
            try {
                // Upload new PDF to Cloudinary
                const { url: pdfUrl, publicId: pdfPublicId } = await uploadPdfToCloudinary(
                    req.file.buffer,
                    req.file.originalname
                );

                // Delete old PDF from Cloudinary if it exists
                if (paperSubmission.pdfPublicId) {
                    try {
                        await deletePdfFromCloudinary(paperSubmission.pdfPublicId);
                    } catch (deleteError) {
                        console.warn('Warning: Could not delete old PDF from Cloudinary:', deleteError.message);
                    }
                }

                // Update with new file
                paperSubmission.pdfUrl = pdfUrl;
                paperSubmission.pdfPublicId = pdfPublicId;
                paperSubmission.pdfFileName = req.file.originalname;

                // Add to versions
                paperSubmission.revisionCount += 1;
                paperSubmission.versions.push({
                    version: paperSubmission.revisionCount + 1,
                    pdfUrl,
                    pdfPublicId,
                    pdfFileName: req.file.originalname,
                    submittedAt: new Date()
                });
            } catch (uploadError) {
                console.error('Failed to upload updated PDF to Cloudinary:', uploadError.message);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload PDF: ' + uploadError.message
                });
            }
        }

        // Save the updated submission
        await paperSubmission.save();

        return res.status(200).json({
            success: true,
            message: "Submission updated successfully",
            submission: paperSubmission
        });
    } catch (error) {
        console.error("Error updating submission:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating submission",
            error: error.message
        });
    }
};

// Reupload paper (creates a new version)
export const reuploadPaper = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { email } = req.user;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        // Verify the submission belongs to the user
        const paperSubmission = await PaperSubmission.findOne({ submissionId, email });

        if (!paperSubmission) {
            return res.status(404).json({
                success: false,
                message: "Submission not found or you don't have permission to update it"
            });
        }

        // Block re-upload if paper is already Accepted or Rejected
        if (paperSubmission.status === 'Accepted' || paperSubmission.status === 'Rejected') {
            return res.status(400).json({
                success: false,
                message: `Paper has already been ${paperSubmission.status.toLowerCase()}. Further uploads are not permitted.`
            });
        }

        // Upload new PDF to Cloudinary
        const { url: pdfUrl, publicId: pdfPublicId } = await uploadPdfToCloudinary(
            req.file.buffer,
            req.file.originalname
        );

        // Update current reference
        paperSubmission.pdfUrl = pdfUrl;
        paperSubmission.pdfPublicId = pdfPublicId;
        paperSubmission.pdfFileName = req.file.originalname;

        // Update version count and add to history
        const nextVersion = (paperSubmission.versions?.length || 0) + 1;

        if (!paperSubmission.versions) paperSubmission.versions = [];

        paperSubmission.versions.push({
            version: nextVersion,
            pdfUrl,
            pdfPublicId,
            pdfFileName: req.file.originalname,
            submittedAt: new Date()
        });

        await paperSubmission.save();

        // Notify Editor/Admins
        if (paperSubmission.assignedEditor) {
            const editor = await User.findById(paperSubmission.assignedEditor);
            if (editor) {
                emitToUser(editor.email, 'paper:update', {
                    submissionId: paperSubmission.submissionId,
                    type: 'reupload',
                    version: nextVersion
                });
            }
        }
        emitToAdmins('paper:update', {
            submissionId: paperSubmission.submissionId,
            authorEmail: paperSubmission.email,
            type: 'reupload'
        });

        return res.status(200).json({
            success: true,
            message: `Paper version v${nextVersion} uploaded successfully`,
            version: nextVersion,
            pdfUrl
        });

    } catch (error) {
        console.error("Error reuploading paper:", error);
        return res.status(500).json({
            success: false,
            message: "Error reuploading paper",
            error: error.message
        });
    }
};

// Get all papers (for admin/editor)
export const getAllPapers = async (req, res) => {
    try {
        const { status, category, search } = req.query;

        let query = {};

        if (status) query.status = status;
        if (category) query.category = category;
        if (search) {
            query.$or = [
                { submissionId: new RegExp(search, 'i') },
                { paperTitle: new RegExp(search, 'i') },
                { authorName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') }
            ];
        }

        const papers = await PaperSubmission.find(query)
            .populate('assignedEditor', 'username email')
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
};

// Get paper by ID
export const getPaperById = async (req, res) => {
    try {
        const { id } = req.params;

        const paper = await PaperSubmission.findById(id)
            .populate('assignedEditor', 'username email role')
            .populate('assignedReviewers', 'username email role');

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        return res.status(200).json({
            success: true,
            paper
        });
    } catch (error) {
        console.error("Error fetching paper:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching paper",
            error: error.message
        });
    }
};

// Submit revised paper
export const submitRevision = async (req, res) => {
    console.log('Received revision submission request:', req.body);
    console.log('Files received:', req.files ? Object.keys(req.files).length + ' files' : 'No files');

    try {
        const { paperId, submissionId, authorEmail } = req.body;

        // Validate required fields
        if ((!paperId && !submissionId) || !authorEmail) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: paperId or submissionId, and authorEmail"
            });
        }

        // Check if all three PDF files were uploaded
        if (!req.files || !req.files.cleanPdf || !req.files.highlightedPdf || !req.files.responsePdf) {
            return res.status(400).json({
                success: false,
                message: "All three PDF files are required: Clean PDF, Highlighted PDF, and Response PDF"
            });
        }

        // Find the original submission - prioritize paperId (ObjectId) for precision
        let paper;
        if (paperId) {
            paper = await PaperSubmission.findById(paperId);
        }

        // Fallback to submissionId if paperId not found or not provided
        if (!paper && submissionId) {
            paper = await PaperSubmission.findOne({ submissionId });
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify the user is the author
        if (paper.email !== authorEmail) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You can only revise your own paper"
            });
        }

        // Upload all three PDFs to Cloudinary
        let cleanPdfUrl, cleanPdfPublicId, cleanPdfFileName;
        let highlightedPdfUrl, highlightedPdfPublicId, highlightedPdfFileName;
        let responsePdfUrl, responsePdfPublicId, responsePdfFileName;

        try {
            // Parallelize all three Cloudinary uploads
            const [cleanResult, highlightedResult, responseResult] = await Promise.all([
                uploadPdfToCloudinary(req.files.cleanPdf[0].buffer, `${submissionId}_clean.pdf`),
                uploadPdfToCloudinary(req.files.highlightedPdf[0].buffer, `${submissionId}_highlighted.pdf`),
                uploadPdfToCloudinary(req.files.responsePdf[0].buffer, `${submissionId}_response.pdf`)
            ]);

            cleanPdfUrl = cleanResult.url;
            cleanPdfPublicId = cleanResult.publicId;
            cleanPdfFileName = cleanResult.fileName;

            highlightedPdfUrl = highlightedResult.url;
            highlightedPdfPublicId = highlightedResult.publicId;
            highlightedPdfFileName = highlightedResult.fileName;

            responsePdfUrl = responseResult.url;
            responsePdfPublicId = responseResult.publicId;
            responsePdfFileName = responseResult.fileName;

            console.log('✅ All revision PDFs uploaded in parallel');
        } catch (uploadError) {
            console.error('Failed to upload PDFs to Cloudinary:', uploadError.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload PDFs: ' + uploadError.message
            });
        }

        // Update or create revision record with all three PDFs
        let revision = await Revision.findOne({ paperId: paper._id });

        if (revision) {
            // Update existing revision
            revision.cleanPdfUrl = cleanPdfUrl;
            revision.cleanPdfPublicId = cleanPdfPublicId;
            revision.cleanPdfFileName = cleanPdfFileName;

            revision.highlightedPdfUrl = highlightedPdfUrl;
            revision.highlightedPdfPublicId = highlightedPdfPublicId;
            revision.highlightedPdfFileName = highlightedPdfFileName;

            revision.responsePdfUrl = responsePdfUrl;
            revision.responsePdfPublicId = responsePdfPublicId;
            revision.responsePdfFileName = responsePdfFileName;

            revision.revisionStatus = 'Submitted';
            revision.revisedPaperSubmittedAt = new Date();
        } else {
            // Create new revision record
            revision = new Revision({
                submissionId: paper.submissionId,
                paperId: paper._id,
                authorEmail: paper.email,
                authorName: paper.authorName,
                editorEmail: paper.assignedEditor?.email || '',
                editorName: paper.assignedEditor?.username || '',
                cleanPdfUrl,
                cleanPdfPublicId,
                cleanPdfFileName,
                highlightedPdfUrl,
                highlightedPdfPublicId,
                highlightedPdfFileName,
                responsePdfUrl,
                responsePdfPublicId,
                responsePdfFileName,
                revisionStatus: 'Submitted',
                revisedPaperSubmittedAt: new Date()
            });
        }

        await revision.save();
        console.log('Revision record saved with all three PDFs');

        // Update paper status
        paper.status = 'Revised Submitted';
        paper.pdfUrl = cleanPdfUrl; // Main PDF is the clean version
        paper.pdfPublicId = cleanPdfPublicId;
        paper.pdfFileName = cleanPdfFileName;

        // Increment revision count
        paper.revisionCount = (paper.revisionCount || 0) + 1;

        await paper.save();
        console.log('Paper updated with revision status');

        // Notify Editor/Admins via Socket
        if (paper.assignedEditor) {
            const editor = await User.findById(paper.assignedEditor);
            if (editor) {
                emitToUser(editor.email, 'paper:revision_submitted', {
                    submissionId: paper.submissionId,
                    authorName: paper.authorName,
                    paperTitle: paper.paperTitle
                });
            }
        }
        emitToAdmins('paper:revision_submitted', {
            submissionId: paper.submissionId,
            authorName: paper.authorName,
            authorEmail: paper.email
        });

        // Send email notification to editor
        try {
            const editor = await User.findById(paper.assignedEditor);
            if (editor) {
                const nodemailer = (await import('nodemailer')).default;
                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: editor.email,
                    subject: `Revised Paper Submitted - ${submissionId}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                            <div style="background-color: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                                <h2 style="margin: 0; color: #155724;">✓ Revised Paper Submitted</h2>
                            </div>
                            <p style="font-size: 14px; line-height: 1.6;">
                                <strong>${paper.authorName}</strong> has submitted their revised paper for <strong>${paper.paperTitle}</strong> (${submissionId}).
                            </p>
                            <p style="font-size: 14px; line-height: 1.6; margin: 15px 0;">
                                <strong>Documents submitted:</strong>
                                <ul style="margin: 10px 0;">
                                    <li><a href="${cleanPdfUrl}" style="color: #0066cc;">Clean PDF</a> - Final corrected paper</li>
                                    <li><a href="${highlightedPdfUrl}" style="color: #0066cc;">Highlighted PDF</a> - Shows all corrections</li>
                                    <li><a href="${responsePdfUrl}" style="color: #0066cc;">Response Document</a> - Explains corrections</li>
                                </ul>
                            </p>
                            <p style="font-size: 13px; color: #666;">
                                Please review the revised submission and proceed with your evaluation.
                            </p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log('📧 Revision submission email sent to editor');
            }
        } catch (emailError) {
            console.error('Failed to send editor notification email:', emailError);
        }

        return res.status(200).json({
            success: true,
            message: 'Revised paper submitted successfully with all three PDFs',
            revision: {
                submissionId: revision.submissionId,
                cleanPdfUrl,
                highlightedPdfUrl,
                responsePdfUrl,
                status: 'Submitted'
            }
        });

    } catch (error) {
        console.error("Error submitting revision:", error);
        return res.status(500).json({
            success: false,
            message: "Error submitting revision",
            error: error.message
        });
    }
};

// Get revision data for a paper (used by reviewers to see revision details)
export const getRevisionData = async (req, res) => {
    try {
        const { submissionId: id } = req.params;
        const { revisionNumber = 1 } = req.query;  // Get revision number from query params
        console.log(`🔍 Looking for revision ${revisionNumber} with ID:`, id);

        // Build query - check both paperId (ObjectId) and submissionId (string)
        const query = { revisionNumber: parseInt(revisionNumber) };
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            query.paperId = id;
        } else {
            query.submissionId = id;
        }

        // Find the specific revision
        const revision = await Revision.findOne(query);
        console.log('📋 Revision found:', !!revision, revision ? `Highlighted: ${revision.highlightedPdfUrl ? '✅' : '❌'}` : 'N/A');

        if (!revision) {
            return res.status(404).json({
                success: false,
                message: `No revision ${revisionNumber} found for this paper`
            });
        }

        return res.status(200).json({
            success: true,
            revision: {
                submissionId: revision.submissionId,
                paperId: revision.paperId,
                revisionNumber: revision.revisionNumber,
                revisionRound: revision.revisionRound,
                cleanPdfUrl: revision.cleanPdfUrl,
                highlightedPdfUrl: revision.highlightedPdfUrl,
                responsePdfUrl: revision.responsePdfUrl,
                revisionStatus: revision.revisionStatus,
                submittedAt: revision.revisedPaperSubmittedAt
            }
        });
    } catch (error) {
        console.error('Error fetching revision data:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching revision data',
            error: error.message
        });
    }
};

// Get all revisions for a paper (to know how many revisions exist)
export const getAllRevisions = async (req, res) => {
    try {
        const { submissionId: id } = req.params;

        // Build query
        const query = {};
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            query.paperId = id;
        } else {
            query.submissionId = id;
        }

        // Find all revisions for this submission
        const revisions = await Revision.find(query)
            .sort({ revisionNumber: 1 })
            .select('submissionId paperId revisionNumber revisionStatus submittedAt');

        return res.status(200).json({
            success: true,
            totalRevisions: revisions.length,
            revisions: revisions
        });
    } catch (error) {
        console.error('Error fetching revisions:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching revisions',
            error: error.message
        });
    }
};
// Get complete history of a paper (submissions, reviews, messages)
export const getPaperHistory = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { role, email } = req.user;

        // Support searching by either ID or Email
        let query = { submissionId: submissionId };
        if (submissionId.includes('@')) {
            query = { email: submissionId.toLowerCase() };
        }

        const paper = await PaperSubmission.findOne(query)
            .populate('assignedEditor', 'username email')
            .populate('reviewAssignments.reviewer', 'username email');

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Permission check: Admin/Editor can see anything. Author can only see THEIR paper.
        if (role !== 'Admin' && role !== 'Editor' && paper.email !== email) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view this paper's history"
            });
        }

        // Get reviews
        const { Review } = await import('../models/Review.js');
        const reviews = await Review.find({ paper: paper._id })
            .populate('reviewer', 'username email')
            .sort({ createdAt: 1 });

        // Get messages
        const { PaperMessage } = await import('../models/PaperMessage.js');
        const paperMessages = await PaperMessage.findOne({ submissionId });

        // Build timeline
        const timeline = [];

        // 1. Initial Submission
        timeline.push({
            type: 'submission',
            date: paper.createdAt,
            title: 'Initial Submission',
            description: `Paper submitted by ${paper.authorName}`,
            details: {
                title: paper.paperTitle,
                category: paper.category,
                topic: paper.topic,
                pdfUrl: paper.pdfUrl
            }
        });

        // 1.5. Version History (Author uploads)
        if (paper.versions && paper.versions.length > 0) {
            paper.versions.forEach(ver => {
                timeline.push({
                    type: 'version_upload',
                    date: ver.submittedAt,
                    title: `Paper Version v${ver.version} Uploaded`,
                    description: `Author uploaded a new version of the paper: ${ver.pdfFileName}`,
                    details: {
                        version: ver.version,
                        pdfUrl: ver.pdfUrl,
                        fileName: ver.pdfFileName
                    }
                });
            });
        }

        // 2. Editor Assignment
        if (paper.assignedEditor) {
            timeline.push({
                type: 'assignment',
                date: paper.updatedAt, // Approximate
                title: 'Editor Assigned',
                description: `Editor ${paper.assignedEditor.username} assigned to manage the paper.`,
                details: {
                    editor: paper.assignedEditor.email
                }
            });
        }

        // 3. Reviewer Assignments & Rejections
        paper.reviewAssignments.forEach(asm => {
            timeline.push({
                type: 'reviewer_assigned',
                date: asm.assignedAt,
                title: 'Reviewer Invited',
                description: `Reviewer ${asm.reviewer?.username || 'Unknown'} invited to review.`,
                status: asm.status,
                details: {
                    reviewer: asm.reviewer?.email,
                    deadline: asm.deadline
                }
            });

            if (asm.respondedAt) {
                timeline.push({
                    type: 'reviewer_response',
                    date: asm.respondedAt,
                    title: `Reviewer ${asm.status}`,
                    description: `Reviewer ${asm.reviewer?.username || 'Unknown'} ${asm.status.toLowerCase()} the invitation.`,
                    details: {
                        reviewer: asm.reviewer?.email
                    }
                });
            }
        });

        // 4. Review Submissions
        reviews.forEach(review => {
            timeline.push({
                type: 'review_submitted',
                date: review.createdAt,
                title: 'Review Submitted',
                description: `Reviewer ${review.reviewer?.username || 'Unknown'} submitted their feedback.`,
                details: {
                    recommendation: review.recommendation,
                    overall: review.ratings?.overall
                }
            });
        });

        // 5. Revision Model Data (Detailed Corrected Paper Uploads)
        const detailedRevisions = await Revision.find({ submissionId }).sort({ revisionNumber: 1 });
        detailedRevisions.forEach(rev => {
            timeline.push({
                type: 'revision_cycle',
                date: rev.revisionRequestedAt,
                title: `Revision Cycle Started (v${rev.revisionNumber})`,
                description: `Revision requested by ${rev.editorName}.`,
                details: {
                    deadline: rev.revisionDeadline,
                    message: rev.revisionMessage
                }
            });

            if (rev.revisedPaperSubmittedAt) {
                timeline.push({
                    type: 'revised_submission_detailed',
                    date: rev.revisedPaperSubmittedAt,
                    title: `Corrected Paper Uploaded (v${rev.revisionNumber})`,
                    description: 'Author uploaded clean, highlighted, and response PDFs.',
                    details: {
                        cleanPdf: rev.cleanPdfUrl,
                        highlightedPdf: rev.highlightedPdfUrl,
                        responsePdf: rev.responsePdfUrl
                    }
                });
            }

            if (rev.finalOutcome && rev.finalOutcome !== 'Pending') {
                timeline.push({
                    type: 'revision_outcome',
                    date: rev.updatedAt,
                    title: `Revision Outcome (v${rev.revisionNumber})`,
                    description: `Revision was ${rev.finalOutcome.toLowerCase()}.`,
                    details: {
                        outcome: rev.finalOutcome
                    }
                });
            }
        });

        // 6. Messages
        if (paperMessages && paperMessages.messages) {
            paperMessages.messages.forEach(msg => {
                timeline.push({
                    type: 'message',
                    date: msg.timestamp,
                    title: `Message from ${msg.sender}`,
                    description: msg.message,
                    details: {
                        senderName: msg.senderName
                    }
                });
            });
        }

        // 7. Final Decision
        if (paper.status === 'Accepted' || paper.status === 'Rejected') {
            timeline.push({
                type: 'final_decision',
                date: paper.updatedAt,
                title: `Paper ${paper.status}`,
                description: `The final decision has been recorded as ${paper.status}.`,
                details: {
                    decision: paper.status
                }
            });
        }

        // Sort all events by date
        timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        return res.status(200).json({
            success: true,
            submissionId,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName,
            currentStatus: paper.status,
            timeline
        });
    } catch (error) {
        console.error("Error fetching paper history:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching paper history",
            error: error.message
        });
    }
};

// Check if user is final selected
export const checkFinalSelection = async (req, res) => {
    try {
        const { email } = req.user;
        const ConferenceSelectedUser = (await import('../models/ConferenceSelectedUser.js')).default;

        const selectedUsers = await ConferenceSelectedUser.find({ authorEmail: email });

        if (!selectedUsers || selectedUsers.length === 0) {
            return res.status(200).json({
                success: true,
                isSelected: false,
                selectedUsers: []
            });
        }

        return res.status(200).json({
            success: true,
            isSelected: true,
            selectedUsers,
            // For backward compatibility
            selectedUser: selectedUsers[0]
        });
    } catch (error) {
        console.error('Error checking final selection:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking selection status'
        });
    }
};

export const uploadFinalDoc = async (req, res) => {
    console.log('--- FINAL DOC UPLOAD ATTEMPT ---');
    console.log('Submission ID from params:', req.params.submissionId);
    console.log('User email from token:', req.user?.email);
    console.log('File received:', req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    } : 'NO FILE');

    try {
        const { submissionId } = req.params;
        const { email } = req.user;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const ConferenceSelectedUser = (await import('../models/ConferenceSelectedUser.js')).default;

        // Case-insensitive search for submissionId
        const selectedUser = await ConferenceSelectedUser.findOne({
            submissionId: { $regex: new RegExp(`^${submissionId}$`, 'i') },
            authorEmail: email
        });

        console.log('Selected user search result:', selectedUser ? 'Found' : 'Not Found');
        if (selectedUser) {
            console.log('User submissionId in DB:', selectedUser.submissionId);
        }

        if (!selectedUser) {
            console.error('Final upload unauthorized: User not found in selected list for ID:', submissionId);
            return res.status(403).json({
                success: false,
                message: 'You are not authorized for final submission or your paper is not yet confirmed in the selected list.'
            });
        }

        // Upload to Cloudinary
        const cloudinaryResult = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);

        // Delete old if exists
        if (selectedUser.finalDocPublicId) {
            try {
                await deletePdfFromCloudinary(selectedUser.finalDocPublicId);
            } catch (delErr) {
                console.warn('Old file deletion failed:', delErr.message);
            }
        }

        selectedUser.finalDocUrl = cloudinaryResult.url;
        selectedUser.finalDocPublicId = cloudinaryResult.publicId;
        selectedUser.finalDocSubmittedAt = new Date();

        await selectedUser.save();

        return res.status(200).json({
            success: true,
            message: 'Final document uploaded successfully',
            finalDocUrl: selectedUser.finalDocUrl,
            selectedUser: selectedUser
        });
    } catch (error) {
        console.error('Error uploading final doc:', error, error.stack);
        return res.status(500).json({
            success: false,
            message: 'Error uploading final document',
            error: error.message
        });
    }
};
