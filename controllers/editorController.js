import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { PaperSubmission } from '../models/Paper.js';
import { ReviewerReview } from '../models/ReviewerReview.js';
import { ReviewerMessage } from '../models/ReviewerMessage.js';
import { Revision } from '../models/Revision.js';
import { ReviewerAssignment } from '../models/ReviewerAssignment.js';
import FinalAcceptance from '../models/FinalAcceptance.js';
import RejectedPaper from '../models/RejectedPaper.js';
import { generateRandomPassword } from '../utils/helpers.js';
import { sendReviewerConfirmationEmail, sendReviewerAssignmentEmail, sendDecisionEmail, sendReviewerCredentialsEmail, sendReviewerReminderEmail, sendAcceptanceEmail, sendReReviewEmail } from '../utils/emailService.js';
import { listPdfsFromCloudinary, deletePdfFromCloudinary } from '../config/cloudinary-pdf.js';
import { emitToUser } from '../socket.js';

// Verify editor access - check if user is an editor
export const verifyEditorAccess = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;

        // Check if user has editor role in token
        if (userRole !== 'Editor' && userRole !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only editors can access this resource.'
            });
        }

        // Verify user exists in database with correct role
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role !== 'Editor' && user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'User does not have editor privileges'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Editor access verified',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error verifying editor access:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying editor access',
            error: error.message
        });
    }
};

// Get editor's assigned papers
export const getAssignedPapers = async (req, res) => {
    try {
        const editorId = req.user.userId;

        const papers = await PaperSubmission.find({ assignedEditor: editorId })
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers
        });
    } catch (error) {
        console.error("Error fetching assigned papers:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching assigned papers",
            error: error.message
        });
    }
};

// Create reviewer account
export const createReviewer = async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Validate required fields
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        // Use provided password or generate random one
        const userPassword = password || generateRandomPassword();
        const hash = await bcrypt.hash(userPassword, 10);

        const newReviewer = new User({
            username: username || email.split('@')[0],
            email,
            password: hash,
            tempPassword: userPassword,  // Store unhashed temporary password for email
            role: 'Reviewer',
            verified: true // Reviewers are auto-verified
        });

        await newReviewer.save();

        // Send credentials email
        const loginUrl = `${process.env.FRONTEND_URL}/login?email=${encodeURIComponent(email)}`;
        await sendReviewerCredentialsEmail(email, newReviewer.username, userPassword, loginUrl);

        return res.status(201).json({
            success: true,
            message: "Reviewer account created successfully and credentials sent to email",
            reviewer: {
                id: newReviewer._id,
                email: newReviewer.email,
                username: newReviewer.username,
                role: newReviewer.role
            }
        });
    } catch (error) {
        console.error("Error creating reviewer:", error);
        return res.status(500).json({
            success: false,
            message: "Error creating reviewer account",
            error: error.message
        });
    }
};

// Get all reviewers
export const getAllReviewers = async (req, res) => {
    try {
        const { search } = req.query;

        let query = { role: 'Reviewer' };
        if (search) {
            query.$or = [
                { email: new RegExp(search, 'i') },
                { username: new RegExp(search, 'i') }
            ];
        }

        const reviewers = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        // Enrich reviewers with statistics
        const enrichedReviewers = await Promise.all(
            reviewers.map(async (reviewer) => {
                // Get all papers assigned to this reviewer
                const papers = await PaperSubmission.find({
                    'reviewAssignments.reviewer': reviewer._id
                }).select('reviewAssignments status');

                // Count assigned papers
                const assignedPapersCount = papers.length;

                // Get all reviews by this reviewer
                const reviews = await ReviewerReview.find({ reviewer: reviewer._id });
                const completedReviewsCount = reviews.length;

                // Get pending reviews (assigned but not completed)
                let pendingReviewsCount = 0;
                let overdueReviewsCount = 0;
                const now = new Date();

                papers.forEach(paper => {
                    const assignment = paper.reviewAssignments?.find(
                        a => a.reviewer.toString() === reviewer._id.toString()
                    );
                    if (assignment && assignment.status !== 'Completed') {
                        pendingReviewsCount++;
                        if (assignment.deadline && new Date(assignment.deadline) < now) {
                            overdueReviewsCount++;
                        }
                    }
                });

                // Calculate average rating from reviews
                let averageRating = 0;
                if (reviews.length > 0) {
                    const totalRating = reviews.reduce((sum, review) => {
                        return sum + (review.overallRating || 0);
                    }, 0);
                    averageRating = (totalRating / reviews.length).toFixed(1);
                }

                return {
                    _id: reviewer._id,
                    name: reviewer.username || reviewer.email,
                    email: reviewer.email,
                    username: reviewer.username,
                    assignedPapers: assignedPapersCount,
                    completedReviews: completedReviewsCount,
                    pendingReviews: pendingReviewsCount,
                    overdueReviews: overdueReviewsCount,
                    averageRating: parseFloat(averageRating),
                    expertise: reviewer.expertise || [],
                    createdAt: reviewer.createdAt
                };
            })
        );

        return res.status(200).json({
            success: true,
            count: enrichedReviewers.length,
            reviewers: enrichedReviewers
        });
    } catch (error) {
        console.error("Error fetching reviewers:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching reviewers",
            error: error.message
        });
    }
};

// Assign reviewers to paper with deadline tracking
export const assignReviewers = async (req, res) => {
    try {
        const { paperId, reviewerIds, deadlineDays, deadline: deadlineStr } = req.body;

        // Find the paper
        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify editor owns this paper (skip check if assignedEditor is not set yet)
        if (paper.assignedEditor && paper.assignedEditor.toString() !== req.user.userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to assign reviewers to this paper"
            });
        }

        // Verify all reviewers exist
        const reviewers = await User.find({
            _id: { $in: reviewerIds },
            role: 'Reviewer'
        });

        if (reviewers.length !== reviewerIds.length) {
            return res.status(400).json({
                success: false,
                message: "One or more reviewer IDs are invalid"
            });
        }

        // Check if any reviewers are already assigned to this paper
        const alreadyAssigned = paper.reviewAssignments || [];
        const alreadyAssignedIds = alreadyAssigned.map(a => a.reviewer?.toString());
        const duplicates = reviewerIds.filter(id =>
            alreadyAssignedIds.includes(id.toString())
        );

        if (duplicates.length > 0) {
            return res.status(400).json({
                success: false,
                message: `${duplicates.length} reviewer(s) already assigned to this paper`
            });
        }

        // Calculate deadline - accept either deadlineDays or deadline date string
        let deadline;
        if (deadlineStr) {
            // Frontend sends date string (YYYY-MM-DD format)
            deadline = new Date(deadlineStr);
            // Set to end of day
            deadline.setHours(23, 59, 59, 999);
        } else {
            // Calculate from days
            deadline = new Date();
            deadline.setDate(deadline.getDate() + (deadlineDays || 14)); // Default 14 days
        }

        // Create review assignments for NEW reviewers only
        const newAssignments = reviewerIds.map(reviewerId => ({
            reviewer: reviewerId,
            deadline,
            status: 'Pending',
            emailSent: false,
            emailResent: false
        }));

        // Use PaperSubmission only to determine model
        const updatedPaper = await PaperSubmission.findByIdAndUpdate(
            paperId,
            {
                $push: {
                    reviewAssignments: { $each: newAssignments }
                },
                $addToSet: {
                    assignedReviewers: { $each: reviewerIds }
                },
                $set: {
                    status: 'Under Review'
                }
            },
            { new: true }
        );

        // Create separate ReviewerAssignment documents for confirmation workflow
        const assignmentDocs = await Promise.all(
            reviewers.map(reviewer => {
                const assignment = new ReviewerAssignment({
                    paperId: paperId,
                    submissionId: paper.submissionId,
                    reviewerId: reviewer._id,
                    reviewerEmail: reviewer.email,
                    reviewerName: reviewer.username,
                    paperTitle: paper.paperTitle,
                    abstract: paper.abstract || null,  // Include abstract from paper
                    status: 'Pending',
                    reviewDeadline: deadline
                });
                return assignment.save();
            })
        );

        // Send emails to reviewers AFTER successful database update
        const emailPromises = assignmentDocs.map(assignment => {
            const reviewer = reviewers.find(r => r._id.toString() === assignment.reviewerId.toString());
            return sendReviewerConfirmationEmail(
                assignment.reviewerEmail,
                assignment.reviewerName,
                {
                    submissionId: paper.submissionId,
                    paperTitle: paper.paperTitle,
                    category: paper.category,
                    abstract: assignment.abstract,  // Include abstract in email data
                    deadline: assignment.reviewDeadline
                },
                assignment._id.toString()  // Pass the ReviewerAssignment _id
            );
        });

        // Send emails (don't wait for them to complete the request)
        Promise.all(emailPromises)
            .then(() => console.log('Reviewer confirmation emails sent successfully'))
            .catch(emailError => console.error("Error sending reviewer confirmation emails:", emailError));

        return res.status(200).json({
            success: true,
            message: `${reviewerIds.length} reviewer(s) added successfully. Total: ${updatedPaper.reviewAssignments.length}`,
            paper: {
                submissionId: updatedPaper.submissionId,
                paperTitle: updatedPaper.paperTitle,
                status: updatedPaper.status,
                totalReviewers: updatedPaper.reviewAssignments.length,
                reviewAssignments: updatedPaper.reviewAssignments.map(a => ({
                    reviewer: a.reviewer,
                    deadline: a.deadline,
                    status: a.status
                }))
            }
        });
    } catch (error) {
        console.error("Error assigning reviewers:", error);
        return res.status(500).json({
            success: false,
            message: "Error assigning reviewers",
            error: error.message
        });
    }
};

// Get reviews for a paper
export const getPaperReviews = async (req, res) => {
    try {
        const { paperId } = req.params;

        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify editor owns this paper (or is Admin)
        if (paper.assignedEditor && paper.assignedEditor.toString() !== req.user.userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to view reviews for this paper"
            });
        }

        const reviews = await ReviewerReview.find({ paper: paperId })
            .populate('reviewer', 'username email');

        return res.status(200).json({
            success: true,
            count: reviews.length,
            reviews
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching reviews",
            error: error.message
        });
    }
};

// Make final decision on paper
export const makeFinalDecision = async (req, res) => {
    try {
        const { paperId, decision, comments, corrections } = req.body;

        // Validate decision
        const validDecisions = ['Accept', 'Conditionally Accept', 'Revise & Resubmit', 'Reject'];
        if (!validDecisions.includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Invalid decision. Must be one of: " + validDecisions.join(', ')
            });
        }

        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify editor owns this paper
        if (paper.assignedEditor.toString() !== req.user.userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to make decisions on this paper"
            });
        }

        // Update paper with decision
        paper.finalDecision = decision;
        paper.editorComments = comments || '';
        paper.editorCorrections = corrections || '';

        // Update status based on decision
        const statusMap = {
            'Accept': 'Accepted',
            'Conditionally Accept': 'Conditionally Accept',
            'Revise & Resubmit': 'Revision Required',
            'Reject': 'Rejected'
        };

        paper.status = statusMap[decision];
        await paper.save();

        // Send decision email to author
        try {
            await sendDecisionEmail(paper.email, paper.authorName, {
                submissionId: paper.submissionId,
                paperTitle: paper.paperTitle,
                decision,
                comments,
                corrections
            });
        } catch (emailError) {
            console.error("Error sending decision email:", emailError);
        }

        // Notify Author via Socket
        emitToUser(paper.email, 'paper:status_changed', {
            submissionId: paper.submissionId,
            status: paper.status,
            paperTitle: paper.paperTitle,
            decision: decision
        });

        return res.status(200).json({
            success: true,
            message: "Decision submitted successfully",
            paper
        });
    } catch (error) {
        console.error("Error making final decision:", error);
        return res.status(500).json({
            success: false,
            message: "Error making final decision",
            error: error.message
        });
    }
};

// Get editor dashboard statistics
export const getEditorDashboardStats = async (req, res) => {
    try {
        const editorId = req.user.userId;

        // Use Promise.all on the single collection for parallel count queries
        const [
            totalAssigned,
            needsAssignment,
            underReview,
            awaitingDecision
        ] = await Promise.all([
            PaperSubmission.countDocuments({ assignedEditor: editorId }),
            PaperSubmission.countDocuments({
                assignedEditor: editorId,
                assignedReviewers: { $size: 0 }
            }),
            PaperSubmission.countDocuments({
                assignedEditor: editorId,
                status: 'Under Review'
            }),
            PaperSubmission.countDocuments({
                assignedEditor: editorId,
                status: 'Review Received'
            })
        ]);

        // Get papers requiring action
        const papersRequiringAction = await PaperSubmission.find({
            assignedEditor: editorId,
            $or: [
                { assignedReviewers: { $size: 0 } },
                { status: 'Review Received' }
            ]
        }).limit(10);

        // Get papers by status from single collection
        const papersByStatus = await PaperSubmission.aggregate([
            { $match: { assignedEditor: editorId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        return res.status(200).json({
            success: true,
            stats: {
                totalAssigned,
                needsAssignment,
                underReview,
                awaitingDecision,
                papersByStatus,
                papersRequiringAction
            }
        });
    } catch (error) {
        console.error("Error fetching editor dashboard stats:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching dashboard statistics",
            error: error.message
        });
    }
};

// ✅ Get ALL papers (not just assigned) - for editor dashboard
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
            .select('-pdfBase64 -versions')
            .populate('assignedEditor', 'username email')
            .populate('assignedReviewers', 'username email')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: papers.length,
            papers
        });
    } catch (error) {
        console.error("Error fetching all papers:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching papers",
            error: error.message
        });
    }
};

// ✅ Get PDF as Base64 for viewing
export const getPdfBase64 = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const editorId = req.user.userId;

        // Find paper by submission ID
        let paper = await PaperSubmission.findOne({ submissionId });
        if (!paper) {
            const {PaperSubmission} = await import('../models/Paper.js');
            paper = await PaperSubmission.findOne({ submissionId });
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Support both Cloudinary URLs (new) and Base64 (legacy)
        const pdfUrl = paper.pdfUrl || (paper.pdfBase64 ? `data:application/pdf;base64,${paper.pdfBase64}` : null);

        if (!pdfUrl) {
            return res.status(404).json({
                success: false,
                message: 'PDF not found for this paper'
            });
        }

        // Return PDF URL (Cloudinary or Base64 data URL for backward compatibility)
        return res.status(200).json({
            success: true,
            submissionId,
            pdfUrl,
            pdfFileName: paper.pdfFileName,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName,
            email: paper.email,
            category: paper.category,
            topic: paper.topic,
            status: paper.status,
            message: 'PDF fetched successfully'
        });
    } catch (error) {
        console.error('Error getting PDF:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching PDF',
            error: error.message
        });
    }
};

// Get reviewer details with all submitted reviews
export const getReviewerDetails = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const editorId = req.user.userId;

        // Get review with reviewer details
        const review = await ReviewerReview.findById(reviewId)
            .populate('reviewer', 'username email')
            .populate('paper', 'submissionId authorName email title paperTitle');

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        return res.status(200).json({
            success: true,
            review,
            paper: review.paper,
            reviewer: review.reviewer
        });
    } catch (error) {
        console.error('Error getting reviewer details:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching reviewer details',
            error: error.message
        });
    }
};

// Send message to reviewer or author
export const sendMessage = async (req, res) => {
    try {
        const { submissionId, reviewId, reviewerId, recipientType, message } = req.body;
        // recipientType: 'reviewer' or 'author'
        const editorId = req.user.userId;
        const editor = await User.findById(editorId);

        if (!editor || (editor.role !== 'Editor' && editor.role !== 'Admin')) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Get paper (submissionId is a string like "BU001")
        let paper = await PaperSubmission.findOne({ submissionId });

        if (!paper) {
            return res.status(404).json({ success: false, message: 'Paper not found' });
        }

        // If reviewId is provided, use it. Otherwise, track by reviewerId and submissionId
        let query = { submissionId };
        if (reviewId) {
            query.reviewId = reviewId;
        } else if (reviewerId) {
            query.reviewerId = reviewerId;
            query.reviewId = { $exists: false }; // Specific thread for pre-review chat
        } else {
            return res.status(400).json({ success: false, message: 'Either reviewId or reviewerId is required' });
        }

        // Find or create message thread
        let messageThread = await ReviewerMessage.findOne(query);

        if (!messageThread) {
            // Determine reviewerId if not provided but reviewId is
            let targetReviewerId = reviewerId;
            if (!targetReviewerId && reviewId) {
                const review = await ReviewerReview.findById(reviewId);
                targetReviewerId = review?.reviewer;
            }

            if (!targetReviewerId) {
                return res.status(400).json({ success: false, message: 'Could not determine reviewer' });
            }

            messageThread = new ReviewerMessage({
                submissionId,
                reviewId: reviewId || undefined,
                reviewerId: targetReviewerId,
                editorId,
                authorId: paper.authorId || paper.email
            });
        }

        // Add message to conversation
        const newMessage = {
            sender: 'editor',
            senderId: editorId,
            senderName: editor.username || editor.email,
            senderEmail: editor.email,
            message
        };

        messageThread.conversation.push(newMessage);

        // Mark which conversation is active
        if (recipientType === 'reviewer') {
            messageThread.editorReviewerConversation = true;
        } else if (recipientType === 'author') {
            messageThread.editorAuthorConversation = true;
        }

        messageThread.lastMessageAt = new Date();
        await messageThread.save();

        return res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            messageThread
        });
    } catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

// Get message thread for a review or reviewer
export const getMessageThread = async (req, res) => {
    try {
        const { submissionId, reviewId } = req.params;
        const { reviewerId } = req.query;

        let query = { submissionId };
        if (reviewId && reviewId !== 'null' && reviewId !== 'undefined') {
            query.reviewId = reviewId;
        } else if (reviewerId) {
            query.reviewerId = reviewerId;
            // Also try to find a thread that might have been created with a reviewId later
            // but for now, let's keep it simple: find threads for this reviewer/paper
        } else {
            return res.status(400).json({ success: false, message: 'Required parameters missing' });
        }

        const messageThread = await ReviewerMessage.findOne(query)
            .populate('reviewerId', 'username email')
            .populate('editorId', 'username email');

        if (!messageThread) {
            // Return empty thread if not found yet
            return res.status(200).json({
                success: true,
                messageThread: {
                    conversation: [],
                    editorReviewerConversation: false,
                    editorAuthorConversation: false,
                    submissionId,
                    reviewerId: reviewerId || null
                }
            });
        }

        return res.status(200).json({
            success: true,
            messageThread
        });
    } catch (error) {
        console.error('Error getting message thread:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Get all message threads for a paper
export const getPaperMessages = async (req, res) => {
    try {
        const { paperId } = req.params;

        const messages = await ReviewerMessage.find({ submissionId: paperId })
            .populate('reviewerId', 'username email')
            .populate('editorId', 'username email')
            .sort({ lastMessageAt: -1 });

        return res.status(200).json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('Error getting paper messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Get all messages for the editor (for Messages tab)
export const getAllMessages = async (req, res) => {
    try {
        const editorId = req.user.userId;

        // Get all message threads
        const messages = await ReviewerMessage.find()
            .populate('reviewerId', 'username email')
            .populate('editorId', 'username email')
            .populate('reviewId', 'comments')
            .sort({ lastMessageAt: -1 })
            .limit(100);

        // Get paper details for each message based on submissionId
        const enrichedMessages = await Promise.all(
            messages.map(async (msg) => {
                const papers = await PaperSubmission.find({ submissionId: msg.submissionId })
                        .select('submissionId paperTitle');
                    return {
                        ...msg.toObject(),
                        paperDetails: papers || null
                    };
            })
        );

        return res.status(200).json({
            success: true,
            count: enrichedMessages.length,
            messages: enrichedMessages
        });
    } catch (error) {
        console.error('Error getting all messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Get non-responding reviewers
export const getNonRespondingReviewers = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get all papers assigned to this editor
        const [mainPapers, multiPapers] = await Promise.all([
            PaperSubmission.find({ assignedEditor: userId })
                .populate('reviewAssignments')
                .select('submissionId paperTitle reviewAssignments'),
            PaperSubmission.find({ assignedEditor: userId })
                .populate('reviewAssignments')
                .select('submissionId paperTitle reviewAssignments')
        ]);
        const papers = [...mainPapers, ...multiPapers];

        if (!papers || papers.length === 0) {
            return res.status(200).json({
                success: true,
                reviewers: []
            });
        }

        const nonResponders = [];

        for (const paper of papers) {
            if (!paper.reviewAssignments) continue;

            for (const assignment of paper.reviewAssignments) {
                // Check if this reviewer has submitted a review
                const review = await ReviewerReview.findOne({
                    paper: paper._id,
                    reviewer: assignment.reviewerId
                });

                if (!review) {
                    // This reviewer hasn't responded yet
                    const reviewer = await User.findById(assignment.reviewerId);
                    if (reviewer) {
                        const now = new Date();
                        const deadline = new Date(assignment.deadline || Date.now() + 14 * 24 * 60 * 60 * 1000);
                        const daysUntilDeadline = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));

                        nonResponders.push({
                            _id: assignment._id,
                            submissionId: paper.submissionId,
                            paperTitle: paper.paperTitle,
                            reviewerId: reviewer._id,
                            reviewerName: reviewer.username || reviewer.email,
                            reviewerEmail: reviewer.email,
                            daysUntilDeadline,
                            reminderCount: assignment.reminderCount || 0,
                            lastReminderSent: assignment.lastReminderSent
                        });
                    }
                }
            }
        }

        // Sort by daysUntilDeadline (overdue first)
        nonResponders.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);

        return res.status(200).json({
            success: true,
            reviewers: nonResponders
        });
    } catch (error) {
        console.error('Error getting non-responding reviewers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching non-responding reviewers',
            error: error.message
        });
    }
};

// Send reminder email to a reviewer
export const sendReviewerReminder = async (req, res) => {
    try {
        const { submissionId, reviewerId, reviewerEmail } = req.body;

        if (!submissionId || !reviewerId || !reviewerEmail) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get paper submission
        let paper = await PaperSubmission.findOne({ submissionId })
            .populate('reviewAssignments');

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Find the specific assignment
        let assignment = paper.reviewAssignments?.find(
            a => a.reviewerId?.toString() === reviewerId.toString()
        );

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: 'Reviewer assignment not found'
            });
        }

        // Get reviewer details
        const reviewer = await User.findById(reviewerId);
        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: 'Reviewer not found'
            });
        }

        // Calculate days remaining
        const now = new Date();
        const deadline = new Date(assignment.deadline || Date.now() + 14 * 24 * 60 * 60 * 1000);
        const daysRemaining = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));

        // Build review link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const reviewLink = `${frontendUrl}/review/${paper._id}`;

        // Send reminder email
        await sendReviewerReminderEmail(
            reviewerEmail,
            reviewer.username || reviewer.email,
            paper.paperTitle,
            assignment.reminderCount || 0,
            reviewLink,
            daysRemaining
        );

        // Update assignment with reminder count and timestamp
        assignment.reminderCount = (assignment.reminderCount || 0) + 1;
        assignment.lastReminderSent = now;

        // Update the paper with the modified assignment
        await PaperSubmission.findByIdAndUpdate(
            paper._id,
            { reviewAssignments: paper.reviewAssignments },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Reminder sent successfully',
            reminderCount: assignment.reminderCount,
            lastReminderSent: assignment.lastReminderSent
        });
    } catch (error) {
        console.error('Error sending reminder:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending reminder',
            error: error.message
        });
    }
};

// Send bulk reminders to multiple reviewers
export const sendBulkReminders = async (req, res) => {
    try {
        const { reminders } = req.body;

        if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reminders array'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        for (const reminder of reminders) {
            try {
                const { submissionId, reviewerId, reviewerEmail } = reminder;

                // Get paper submission
                let paper = await PaperSubmission.findOne({ submissionId })
                    .populate('reviewAssignments');
                if (!paper) {
                    const {PaperSubmission} = await import('../models/Paper.js');
                    paper = await PaperSubmission.findOne({ submissionId })
                        .populate('reviewAssignments');
                }

                if (!paper) {
                    results.failed.push({
                        submissionId,
                        reviewerId,
                        reason: 'Paper not found'
                    });
                    continue;
                }

                // Find the specific assignment
                let assignment = paper.reviewAssignments?.find(
                    a => a.reviewerId?.toString() === reviewerId.toString()
                );

                if (!assignment) {
                    results.failed.push({
                        submissionId,
                        reviewerId,
                        reason: 'Assignment not found'
                    });
                    continue;
                }

                // Get reviewer details
                const reviewer = await User.findById(reviewerId);
                if (!reviewer) {
                    results.failed.push({
                        submissionId,
                        reviewerId,
                        reason: 'Reviewer not found'
                    });
                    continue;
                }

                // Calculate days remaining
                const now = new Date();
                const deadline = new Date(assignment.deadline || Date.now() + 14 * 24 * 60 * 60 * 1000);
                const daysRemaining = Math.floor((deadline - now) / (1000 * 60 * 60 * 24));

                // Build review link
                const reviewLink = `${frontendUrl}/review/${paper._id}`;

                // Send reminder email
                await sendReviewerReminderEmail(
                    reviewerEmail,
                    reviewer.username || reviewer.email,
                    paper.paperTitle,
                    assignment.reminderCount || 0,
                    reviewLink,
                    daysRemaining
                );

                // Update assignment
                assignment.reminderCount = (assignment.reminderCount || 0) + 1;
                assignment.lastReminderSent = now;

                // Update the paper
                await PaperSubmission.findByIdAndUpdate(
                    paper._id,
                    { reviewAssignments: paper.reviewAssignments },
                    { new: true }
                );

                results.success.push({
                    submissionId,
                    reviewerId,
                    reminderCount: assignment.reminderCount
                });
            } catch (error) {
                results.failed.push({
                    submissionId: reminder.submissionId,
                    reviewerId: reminder.reviewerId,
                    reason: error.message
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Sent ${results.success.length} reminders, ${results.failed.length} failed`,
            results
        });
    } catch (error) {
        console.error('Error sending bulk reminders:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending bulk reminders',
            error: error.message
        });
    }
};

// Get all PDFs from Cloudinary
export const getAllPdfs = async (req, res) => {
    try {
        const pdfs = await listPdfsFromCloudinary();

        // Enrich with local database info if available
        const enrichedPdfs = pdfs.map(pdf => {
            const fileName = pdf.public_id.split('/').pop(); // Extract filename from public_id
            return {
                publicId: pdf.public_id,
                fileName: fileName,
                url: pdf.secure_url,
                size: pdf.bytes,
                uploadedAt: pdf.created_at,
                version: pdf.version
            };
        });

        return res.status(200).json({
            success: true,
            message: `Found ${enrichedPdfs.length} PDFs in Cloudinary`,
            pdfs: enrichedPdfs,
            total: enrichedPdfs.length
        });
    } catch (error) {
        console.error('Error fetching PDFs from Cloudinary:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching PDFs from Cloudinary',
            error: error.message
        });
    }
};

// Delete PDF from Cloudinary
export const deletePdf = async (req, res) => {
    try {
        const { publicId } = req.body;

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'publicId is required'
            });
        }

        // Delete from Cloudinary
        await deletePdfFromCloudinary(publicId);

        // Also remove from database if it exists
        try {
            await PaperSubmission.updateMany(
                { pdfPublicId: publicId },
                { $unset: { pdfUrl: "", pdfPublicId: "" } }
            );
        } catch (dbError) {
            console.log('Note: PDF not found in database, but deleted from Cloudinary');
        }

        return res.status(200).json({
            success: true,
            message: 'PDF deleted successfully from Cloudinary'
        });
    } catch (error) {
        console.error('Error deleting PDF:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting PDF',
            error: error.message
        });
    }
};

// Send message to reviewer via email
export const sendMessageToReviewer = async (req, res) => {
    try {
        const { reviewerEmail, reviewerName, submissionId, message } = req.body;
        const editorId = req.user.userId;

        // Validate inputs
        if (!reviewerEmail || !message || !submissionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: reviewerEmail, message, submissionId'
            });
        }

        // Get editor info
        const editor = await User.findById(editorId);
        if (!editor || (editor.role !== 'Editor' && editor.role !== 'Admin')) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get paper info
        let paper = await PaperSubmission.findOne({ submissionId });
        if (!paper) {
            const {PaperSubmission} = await import('../models/Paper.js');
            paper = await PaperSubmission.findOne({ submissionId });
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Send email to reviewer with editor's message
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: reviewerEmail,
            subject: `Message from Editor - Paper ${submissionId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1a5490;">Message from Editor</h2>
                        <p style="margin: 5px 0 0 0; color: #666;">ICMBNT 2026 Conference</p>
                    </div>

                    <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                        Dear <strong>${reviewerName}</strong>,
                    </p>

                    <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 15px;">
                        The editor has sent you a message regarding your review:
                    </p>

                    <div style="background-color: #e8f4f8; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; line-height: 1.8; color: #333;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>

                    <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 3px solid #999;">
                        <p style="margin: 0 0 10px 0; font-weight: bold; color: #666;">Paper Information:</p>
                        <table style="width: 100%; font-size: 13px;">
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold; width: 120px;">Submission ID:</td>
                                <td style="padding: 5px 0;">${submissionId}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Paper Title:</td>
                                <td style="padding: 5px 0;">${paper.paperTitle}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Editor:</td>
                                <td style="padding: 5px 0;">${editor.username || editor.email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Editor Email:</td>
                                <td style="padding: 5px 0;">${editor.email}</td>
                            </tr>
                        </table>
                    </div>

                    <p style="font-size: 13px; color: #666; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                        If you have any questions, please feel free to reply to this email or contact the editor directly.
                    </p>

                    <p style="font-size: 12px; color: #999; margin-top: 15px;">
                        Best regards,<br>
                        ICMBNT 2026 Conference Management System
                    </p>
                </div>
            `
        };

        // Import nodemailer
        const { sendReviewerAssignmentEmail } = await import('../utils/emailService.js');

        // Send using direct nodemailer setup from emailService
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail(mailOptions);

        return res.status(200).json({
            success: true,
            message: 'Message sent to reviewer successfully',
            reviewerEmail
        });
    } catch (error) {
        console.error('Error sending message to reviewer:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message to reviewer',
            error: error.message
        });
    }
};

// Send message to author via email
export const sendMessageToAuthor = async (req, res) => {
    try {
        const { submissionId, authorEmail, authorName, message } = req.body;
        const editorId = req.user.userId;

        // Validate inputs
        if (!authorEmail || !message || !submissionId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: authorEmail, message, submissionId'
            });
        }

        // Get editor info
        const editor = await User.findById(editorId);
        if (!editor || (editor.role !== 'Editor' && editor.role !== 'Admin')) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get paper info
        let paper = await PaperSubmission.findOne({ submissionId });
        if (!paper) {
            const {PaperSubmission} = await import('../models/Paper.js');
            paper = await PaperSubmission.findOne({ submissionId });
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Send email to author with editor's message
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: authorEmail,
            subject: `Message from Editor - Paper ${submissionId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #1a5490;">Message from Editor</h2>
                        <p style="margin: 5px 0 0 0; color: #666;">ICMBNT 2026 Conference</p>
                    </div>

                    <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                        Dear <strong>${authorName}</strong>,
                    </p>

                    <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 15px;">
                        The editor has sent you a message regarding your submission:
                    </p>

                    <div style="background-color: #e8f4f8; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; line-height: 1.8; color: #333;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>

                    <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 3px solid #999;">
                        <p style="margin: 0 0 10px 0; font-weight: bold; color: #666;">Paper Information:</p>
                        <table style="width: 100%; font-size: 13px;">
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold; width: 120px;">Submission ID:</td>
                                <td style="padding: 5px 0;">${submissionId}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Paper Title:</td>
                                <td style="padding: 5px 0;">${paper.paperTitle}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Editor:</td>
                                <td style="padding: 5px 0;">${editor.username || editor.email}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0; font-weight: bold;">Editor Email:</td>
                                <td style="padding: 5px 0;">${editor.email}</td>
                            </tr>
                        </table>
                    </div>

                    <p style="font-size: 13px; color: #666; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                        If you have any questions or need clarification, please feel free to reply to this email or contact the editor directly.
                    </p>

                    <p style="font-size: 12px; color: #999; margin-top: 15px;">
                        Best regards,<br>
                        ICMBNT 2026 Conference Management System
                    </p>
                </div>
            `
        };

        // Send using nodemailer
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail(mailOptions);

        // Also save to PaperMessage for dashboard visibility
        try {
            const { PaperMessage } = await import('../models/PaperMessage.js');
            let paperMessage = await PaperMessage.findOne({ submissionId });
            if (!paperMessage) {
                paperMessage = new PaperMessage({
                    submissionId,
                    paperId: paper._id,
                    authorEmail: paper.email,
                    editorId: paper.assignedEditor,
                    messages: []
                });
            }

            paperMessage.messages.push({
                sender: editor.role === 'Admin' ? 'Admin' : 'Editor',
                senderId: editorId,
                senderName: editor.username || editor.email,
                message,
                timestamp: new Date()
            });

            paperMessage.lastMessageAt = new Date();
            await paperMessage.save();
        } catch (dbError) {
            console.error('Error saving message to database:', dbError);
            // Don't fail the request if database save fails but email was sent
        }

        return res.status(200).json({
            success: true,
            message: 'Message sent to author successfully and saved to dashboard',
            authorEmail
        });
    } catch (error) {
        console.error('Error sending message to author:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message to author',
            error: error.message
        });
    }
};

// Request revision from author with all reviewer comments
export const requestRevision = async (req, res) => {
    try {
        const { paperId, revisionMessage, revisionDeadline } = req.body;
        const editorId = req.user.userId;

        console.log('📋 Request Revision - Input:', { paperId, editorId, messageLength: revisionMessage?.length, revisionDeadline });
        console.log('🔐 User info:', { role: req.user.role, userId: req.user.userId, email: req.user.email });

        // Validate inputs
        if (!paperId || !revisionMessage) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: paperId, revisionMessage'
            });
        }

        // Get paper
        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        console.log('📄 Paper found:', { paperId, title: paper.paperTitle, authorEmail: paper.email, assignedEditor: paper.assignedEditor });

        // Verify editor has permission
        console.log('🔍 Permission check:', {
            hasAssignedEditor: !!paper.assignedEditor,
            editorIdMatch: paper.assignedEditor?.toString() === editorId,
            isAdmin: req.user.role === 'Admin'
        });

        if (paper.assignedEditor && paper.assignedEditor.toString() !== editorId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to request revision for this paper'
            });
        }

        // Check if paper has at least 3 reviews
        console.log('🔍 Searching for reviews with paperId:', paperId);
        const reviews = await ReviewerReview.find({ paper: paperId })
            .populate('reviewer', 'username email');

        console.log(`✓ Found ${reviews.length} review(s)`);

        if (reviews.length < 3) {
            return res.status(400).json({
                success: false,
                message: `Cannot request revision. Paper needs 3 reviews minimum. Currently has ${reviews.length} review(s).`
            });
        }

        // Log review details
        reviews.forEach((r, i) => {
            console.log(`  Review ${i + 1}: ${r.reviewer.username} - ${r.recommendation}`);
        });

        // Get editor info
        const editor = await User.findById(editorId);
        if (!editor) {
            return res.status(404).json({
                success: false,
                message: 'Editor not found'
            });
        }

        console.log('👤 Editor:', editor.username);

        // Create or update revision record
        let revision = await Revision.findOne({ paperId });

        if (!revision) {
            // Use provided deadline or default to 14 days from now
            let finalDeadline;
            if (revisionDeadline) {
                finalDeadline = new Date(revisionDeadline);
            } else {
                finalDeadline = new Date();
                finalDeadline.setDate(finalDeadline.getDate() + 14);
            }

            revision = new Revision({
                submissionId: paper.submissionId,
                paperId: paper._id,
                authorEmail: paper.email,
                authorName: paper.authorName,
                editorEmail: editor.email,
                editorName: editor.username,
                revisionDeadline: finalDeadline,
                revisionMessage,
                reviewerComments: reviews.map(review => ({
                    reviewerId: review.reviewer._id,
                    reviewerName: review.reviewer.username || 'Reviewer',
                    reviewerEmail: review.reviewer.email,
                    comments: review.commentsToEditor || review.comments || '',
                    strengths: review.strengths || '',
                    weaknesses: review.weaknesses || '',
                    overallRating: review.overallRating || 0,
                    noveltyRating: review.noveltyRating || 0,
                    qualityRating: review.qualityRating || 0,
                    clarityRating: review.clarityRating || 0,
                    recommendation: review.recommendation || ''
                }))
            });
        } else {
            // Update existing revision
            revision.revisionMessage = revisionMessage;
            revision.reviewerComments = reviews.map(review => ({
                reviewerId: review.reviewer._id,
                reviewerName: review.reviewer.username || 'Reviewer',
                reviewerEmail: review.reviewer.email,
                comments: review.commentsToEditor || review.comments || '',
                strengths: review.strengths || '',
                weaknesses: review.weaknesses || '',
                overallRating: review.overallRating || 0,
                noveltyRating: review.noveltyRating || 0,
                qualityRating: review.qualityRating || 0,
                clarityRating: review.clarityRating || 0,
                recommendation: review.recommendation || ''
            }));
            revision.revisionRound = (revision.revisionRound || 1) + 1;
        }

        await revision.save();
        console.log('✅ Revision record saved');

        // Update paper status
        paper.status = 'Revision Required';
        paper.finalDecision = 'Revise & Resubmit';
        await paper.save();
        console.log('✅ Paper status updated to "Revision Required"');

        // Send revision request email to author with all reviewer comments
        try {
            const nodemailer = (await import('nodemailer')).default;
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // Build reviewer comments HTML
            let reviewerCommentsHtml = '';
            revision.reviewerComments.forEach((comment, index) => {
                reviewerCommentsHtml += `
                    <div style="margin-bottom: 25px; padding: 15px; background-color: #f5f5f5; border-left: 4px solid #0066cc; border-radius: 4px;">
                        <p style="margin: 0 0 10px 0; font-weight: bold; color: #0066cc;">Reviewer ${index + 1} Comments:</p>
                        
                        <div style="margin: 10px 0;">
                            <strong>Recommendation:</strong> ${comment.recommendation || 'N/A'}<br>
                            <strong>Overall Rating:</strong> ${comment.overallRating || 'N/A'} / 5
                        </div>
                        
                        <div style="margin: 10px 0;">
                            <strong>Strengths:</strong><br>
                            ${comment.strengths ? comment.strengths.replace(/\n/g, '<br>') : 'N/A'}
                        </div>
                        
                        <div style="margin: 10px 0;">
                            <strong>Weaknesses:</strong><br>
                            ${comment.weaknesses ? comment.weaknesses.replace(/\n/g, '<br>') : 'N/A'}
                        </div>
                        
                        <div style="margin: 10px 0;">
                            <strong>Detailed Comments:</strong><br>
                            ${comment.comments ? comment.comments.replace(/\n/g, '<br>') : 'N/A'}
                        </div>
                    </div>
                `;
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: paper.email,
                subject: `Revision Required - Paper ${paper.submissionId}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #d9534f;">Revision Required</h2>
                            <p style="margin: 5px 0 0 0; color: #666;">ICMBNT 2026 Conference</p>
                        </div>

                        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                            Dear <strong>${paper.authorName}</strong>,
                        </p>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 15px;">
                            Thank you for submitting your paper to ICMBNT 2026. After careful review by our expert panel, 
                            we have decided that your paper requires <strong>revision before it can be accepted</strong>.
                        </p>

                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0; font-weight: bold; color: #856404;">Revision Deadline: ${new Date(revision.revisionDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>

                        <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #155724;"><strong>Submit Your Revision</strong></p>
                            <a href="${process.env.FRONTEND_URL || 'https://icmbnt2026.vercel.app'}/author/revision/${paper.submissionId}" style="display: inline-block; padding: 12px 30px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">Login & Submit Revision</a>
                            <p style="margin: 10px 0 0 0; font-size: 12px; color: #155724;">Click the button above to login and submit your revised paper</p>
                        </div>

                        <h3 style="color: #0066cc; margin-top: 25px; margin-bottom: 15px;">Editor's Message:</h3>
                        <div style="background-color: #e8f4f8; border-left: 4px solid #0066cc; padding: 15px; margin: 15px 0; border-radius: 4px; font-size: 14px; line-height: 1.8; color: #333;">
                            ${revisionMessage.replace(/\n/g, '<br>')}
                        </div>

                        <h3 style="color: #0066cc; margin-top: 25px; margin-bottom: 15px;">Reviewer Comments & Feedback:</h3>
                        ${reviewerCommentsHtml}

                        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 3px solid #999;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #666;">Paper Information:</p>
                            <table style="width: 100%; font-size: 13px;">
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold; width: 130px;">Submission ID:</td>
                                    <td style="padding: 5px 0;">${paper.submissionId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold;">Paper Title:</td>
                                    <td style="padding: 5px 0;">${paper.paperTitle}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold;">Revision Round:</td>
                                    <td style="padding: 5px 0;">${revision.revisionRound}</td>
                                </tr>
                            </table>
                        </div>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 20px 0;">
                            <strong>What to submit:</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                <li><strong>Clean PDF:</strong> Your final corrected paper</li>
                                <li><strong>Highlighted PDF:</strong> Shows all corrections made (visible to reviewers)</li>
                                <li><strong>Response Document:</strong> Explains what corrections were made</li>
                            </ul>
                        </p>

                        <p style="font-size: 13px; color: #666; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                            If you have any questions, please reply to this email or contact the editor.
                        </p>

                        <p style="font-size: 12px; color: #999; margin-top: 15px;">
                            Best regards,<br>
                            <strong>${editor.username}</strong><br>
                            Editor, ICMBNT 2026 Conference<br>
                            <a href="mailto:${editor.email}">${editor.email}</a>
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log('📧 Revision request email sent to:', paper.email);
        } catch (emailError) {
            console.error('⚠️ Error sending revision request email:', emailError);
            // Don't fail if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Revision request sent to author successfully',
            revision
        });
    } catch (error) {
        console.error('❌ Error requesting revision:', error);
        return res.status(500).json({
            success: false,
            message: 'Error requesting revision',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Accept paper - Send acceptance email with conference dates
export const acceptPaper = async (req, res) => {
    try {
        const { paperId } = req.body;
        const editorId = req.user.userId;

        // Validate paper exists
        let paper = await PaperSubmission.findById(paperId)
            .populate('assignedReviewers', 'email username');

        if (!paper) {
            paper = await PaperSubmission.findById(paperId)
                .populate('assignedReviewers', 'email username');
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Update paper status to Accepted
        paper.status = 'Accepted';
        paper.decisionDate = new Date();
        await paper.save();

        // Get all reviews for this paper to collect reviewer info and ratings by round
        const reviews = await ReviewerReview.find({ paper: paperId }).sort({ round: 1 });

        // Get revision data with all 3 PDFs
        const revision = await Revision.findOne({ paperId: paperId });

        // Organize reviews by round with complete details
        const reviewsByRound = reviews.map(review => ({
            round: review.round || 1,
            reviewerId: review.reviewer,
            reviewerName: review.reviewerName || 'Unknown',
            reviewerEmail: review.reviewerEmail,
            comments: review.comments,
            commentsToReviewer: review.commentsToReviewer,
            commentsToEditor: review.commentsToEditor,
            strengths: review.strengths,
            weaknesses: review.weaknesses,
            overallRating: review.overallRating,
            noveltyRating: review.noveltyRating,
            qualityRating: review.qualityRating,
            clarityRating: review.clarityRating,
            recommendation: review.recommendation,
            reviewedPdfUrl: review.reviewedPdfUrl,
            submittedAt: review.submittedAt || review.createdAt
        }));

        // Legacy: Extract reviewer information for backward compatibility
        const reviewersInfo = reviews.map(review => ({
            reviewerName: review.reviewerName || 'Unknown',
            reviewerEmail: review.reviewerEmail,
            overallRating: review.overallRating,
            recommendation: review.recommendation,
            submittedAt: review.submittedAt || review.createdAt
        }));

        // Get editor info
        const editor = await User.findById(editorId);

        // Create entry in FinalAcceptance collection with all revision PDFs and review rounds
        const finalAcceptance = new FinalAcceptance({
            paperId: paper._id,
            submissionId: paper.submissionId,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName,
            authorEmail: paper.email,
            pdfUrl: paper.pdfUrl,  // Clean PDF (final version)
            pdfPublicId: paper.pdfPublicId,
            pdfFileName: paper.pdfFileName,
            category: paper.category,
            topic: paper.topic || '',
            // Store all revision PDFs
            revisionPdfs: revision ? {
                cleanPdfUrl: revision.cleanPdfUrl,
                cleanPdfPublicId: revision.cleanPdfPublicId,
                cleanPdfFileName: revision.cleanPdfFileName,
                highlightedPdfUrl: revision.highlightedPdfUrl,
                highlightedPdfPublicId: revision.highlightedPdfPublicId,
                highlightedPdfFileName: revision.highlightedPdfFileName,
                responsePdfUrl: revision.responsePdfUrl,
                responsePdfPublicId: revision.responsePdfPublicId,
                responsePdfFileName: revision.responsePdfFileName
            } : {},
            // Store reviews organized by round
            reviewsByRound: reviewsByRound,
            // Legacy reviewer array for backward compatibility
            reviewers: reviewersInfo,
            totalReviewers: reviewersInfo.length,
            finalDecision: 'Accept',
            editorId: editorId,
            editorEmail: editor?.email || 'unknown@email.com',
            acceptanceDate: new Date(),
            revisionCount: paper.revisionCount || 0,
            status: 'Accepted',
            metadata: {
                originalSubmissionDate: paper.createdAt,
                notes: `Paper accepted by ${editor?.username || 'Editor'}`,
                totalReviewRounds: Math.max(...reviews.map(r => r.round || 1), 1)
            }
        });

        // Generate certificate number
        finalAcceptance.generateCertificateNumber();

        // Save to FinalAcceptance collection
        await finalAcceptance.save();

        console.log('✅ Paper accepted and saved to FinalAcceptance:', {
            paperId,
            title: paper.paperTitle,
            authorEmail: paper.email,
            certificateNumber: finalAcceptance.acceptanceCertificateNumber
        });

        // Send acceptance email to author
        try {
            await sendAcceptanceEmail(paper.email, paper.authorName, paper.paperTitle, paper.submissionId);
        } catch (emailError) {
            console.error('⚠️ Error sending acceptance email:', emailError);
            // Don't fail if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Paper accepted successfully. Acceptance email sent to author.',
            paper: {
                _id: paper._id,
                submissionId: paper.submissionId,
                title: paper.paperTitle,
                status: paper.status,
                certificateNumber: finalAcceptance.acceptanceCertificateNumber
            }
        });
    } catch (error) {
        console.error('❌ Error accepting paper:', error);
        return res.status(500).json({
            success: false,
            message: 'Error accepting paper',
            error: error.message
        });
    }
};

// Get revision status for author
export const getRevisionStatus = async (req, res) => {
    try {
        const authorEmail = req.user.email;

        const revision = await Revision.findOne({ authorEmail })
            .populate('reviewerComments.reviewerId', 'username email');

        if (!revision) {
            return res.status(404).json({
                success: false,
                message: 'No revision found'
            });
        }

        return res.status(200).json({
            success: true,
            revision
        });
    } catch (error) {
        console.error('Error fetching revision status:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching revision status',
            error: error.message
        });
    }
};

// Reject paper and store in RejectedPaper collection
export const rejectPaper = async (req, res) => {
    try {
        const { paperId } = req.params;
        const { rejectionReason, rejectionComments } = req.body;
        const editorId = req.user.userId || req.user._id;
        const editorEmail = req.user.email;
        const editorName = req.user.username || req.user.name;

        // Validate required fields
        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        if (!rejectionComments || rejectionComments.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Rejection comments are required'
            });
        }

        // Find the paper
        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Get all reviews for this paper, organized by round
        const reviews = await ReviewerReview.find({
            paper: paperId
        })
            .populate('reviewer', 'name email affiliation')
            .sort({ round: 1, createdAt: 1 })
            .lean();

        // Organize reviews by round
        const reviewsByRound = [];
        const roundMap = new Map();

        reviews.forEach(review => {
            const roundNum = review.round || 1;
            if (!roundMap.has(roundNum)) {
                roundMap.set(roundNum, {
                    round: roundNum,
                    reviews: []
                });
            }

            roundMap.get(roundNum).reviews.push({
                reviewerId: review.reviewer._id,
                reviewerName: review.reviewer.name,
                reviewerEmail: review.reviewer.email,
                reviewerAffiliation: review.reviewer.affiliation,
                recommendation: review.recommendation,
                rating: review.rating,
                comments: review.comments,
                internalComments: review.internalComments,
                commentsToEditor: review.commentsToEditor,
                submittedAt: review.createdAt
            });
        });

        // Convert map to array
        roundMap.forEach(value => {
            reviewsByRound.push(value);
        });

        // Get all revisions if any
        const revisions = await Revision.find({
            paper: paperId
        })
            .sort({ revisionNumber: 1 })
            .lean();

        const revisionPDFs = revisions.map(rev => ({
            revisionNumber: rev.revisionNumber,
            pdfUrl: rev.pdfUrl,
            uploadedAt: rev.uploadedAt
        }));

        // Create rejected paper document
        const rejectedPaper = await RejectedPaper.create({
            paperId: paper._id,
            submissionId: paper.submissionId,
            paperTitle: paper.paperTitle,
            authorName: paper.authorName,
            authorEmail: paper.email, // Paper model uses 'email' not 'authorEmail'
            authorAffiliation: paper.authorAffiliation || '',
            coAuthors: paper.coAuthors || [],
            abstract: paper.abstract || '',
            keywords: paper.keywords || [],
            category: paper.category,
            pdfUrl: paper.pdfUrl,
            revisionPDFs,
            reviewsByRound,
            rejectionReason,
            rejectionComments,
            editorId,
            editorEmail,
            editorName,
            revisionCount: revisions.length,
            originalSubmissionDate: paper.createdAt,
            rejectionDate: new Date()
        });

        // Update paper status to rejected
        paper.status = 'Rejected';
        paper.finalDecision = 'Reject'; // Valid enum value is 'Reject' not 'Rejected'
        paper.finalDecisionDate = new Date();
        await paper.save();

        // Send rejection email to author
        try {
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
                to: paper.email,
                subject: `Paper Rejection - ${paper.submissionId}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                        <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #721c24;">Paper Rejection Notification</h2>
                            <p style="margin: 5px 0 0 0; color: #666;">ICMBNT 2026 Conference</p>
                        </div>

                        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                            Dear <strong>${paper.authorName}</strong>,
                        </p>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 15px;">
                            We regret to inform you that your paper has not been accepted for publication.
                        </p>

                        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 3px solid #999;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #666;">Paper Details:</p>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li style="padding: 5px 0;"><strong>Submission ID:</strong> ${paper.submissionId}</li>
                                <li style="padding: 5px 0;"><strong>Title:</strong> ${paper.paperTitle}</li>
                                <li style="padding: 5px 0;"><strong>Category:</strong> ${paper.category}</li>
                            </ul>
                        </div>

                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #856404;">Rejection Reason:</p>
                            <p style="margin: 0; color: #856404;">${rejectionReason}</p>
                        </div>

                        <div style="background-color: #e8f4f8; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #0066cc;">Comments from Editor:</p>
                            <p style="margin: 0; color: #333; line-height: 1.6;">${rejectionComments.replace(/\n/g, '<br>')}</p>
                        </div>

                        <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #0c5460;">Review Summary:</p>
                            <p style="margin: 0; color: #0c5460;">Your paper underwent ${reviewsByRound.length} round(s) of review with a total of ${reviews.length} review(s).</p>
                        </div>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 20px 0;">
                            We appreciate your submission and encourage you to consider the reviewers' feedback for future work.
                        </p>

                        <p style="font-size: 13px; color: #666; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                            Best regards,<br>
                            <strong>${editorName}</strong><br>
                            Editor, ICMBNT 2026 Conference<br>
                            <a href="mailto:${editorEmail}">${editorEmail}</a>
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log('📧 Rejection email sent to:', paper.email);
        } catch (emailError) {
            console.error('⚠️ Error sending rejection email:', emailError);
            // Don't fail the request if email fails
        }

        return res.status(200).json({
            success: true,
            message: 'Paper rejected successfully',
            rejectedPaper: {
                id: rejectedPaper._id,
                submissionId: rejectedPaper.submissionId,
                paperTitle: rejectedPaper.paperTitle,
                rejectionReason: rejectedPaper.rejectionReason,
                rejectionDate: rejectedPaper.rejectionDate
            }
        });
    } catch (error) {
        console.error('Error rejecting paper:', error);
        return res.status(500).json({
            success: false,
            message: 'Error rejecting paper',
            error: error.message
        });
    }
};

// Submit revised paper
export const submitRevisedPaper = async (req, res) => {
    try {
        const { submissionId, revisedPdfUrl, revisedPdfPublicId, revisedPdfFileName, authorResponse } = req.body;
        const authorEmail = req.user.email;

        // Validate inputs
        if (!submissionId || !revisedPdfUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: submissionId, revisedPdfUrl'
            });
        }

        // Get revision record
        const revision = await Revision.findOne({ submissionId, authorEmail });
        if (!revision) {
            return res.status(404).json({
                success: false,
                message: 'Revision record not found'
            });
        }

        // Update revision with revised paper
        revision.revisedPdfUrl = revisedPdfUrl;
        revision.revisedPdfPublicId = revisedPdfPublicId;
        revision.revisedPdfFileName = revisedPdfFileName;
        revision.authorResponse = authorResponse || '';
        revision.revisedPaperSubmittedAt = new Date();
        revision.revisionStatus = 'Resubmitted';
        await revision.save();

        // Update paper with revised PDF
        let paper = await PaperSubmission.findOne({ submissionId });
        if (!paper) {
            const {PaperSubmission} = await import('../models/Paper.js');
            paper = await PaperSubmission.findOne({ submissionId });
        }

        if (paper) {
            paper.pdfUrl = revisedPdfUrl;
            paper.pdfPublicId = revisedPdfPublicId;
            paper.pdfFileName = revisedPdfFileName;
            paper.status = 'Revised Submitted';
            paper.revisionCount = (paper.revisionCount || 0) + 1;
            await paper.save();
        }

        // Send confirmation email
        try {
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
                to: authorEmail,
                subject: `Revised Paper Received - ${submissionId}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h2 style="margin: 0; color: #28a745;">Revised Paper Received</h2>
                            <p style="margin: 5px 0 0 0; color: #666;">ICMBNT 2026 Conference</p>
                        </div>

                        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                            Dear <strong>${revision.authorName}</strong>,
                        </p>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin-bottom: 15px;">
                            Thank you for submitting your revised paper. We have received it and it is now under review.
                            Our editorial team will review your revisions and provide further updates.
                        </p>

                        <div style="background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 3px solid #999;">
                            <p style="margin: 0 0 10px 0; font-weight: bold; color: #666;">Paper Information:</p>
                            <table style="width: 100%; font-size: 13px;">
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold; width: 130px;">Submission ID:</td>
                                    <td style="padding: 5px 0;">${submissionId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold;">Status:</td>
                                    <td style="padding: 5px 0;">Revised Submitted</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: bold;">Received At:</td>
                                    <td style="padding: 5px 0;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                </tr>
                            </table>
                        </div>

                        <p style="font-size: 14px; line-height: 1.6; color: #555; margin: 20px 0;">
                            You will receive another update once the review process is complete.
                        </p>

                        <p style="font-size: 13px; color: #666; margin-top: 25px; padding-top: 15px; border-top: 1px solid #ddd;">
                            Best regards,<br>
                            ICMBNT 2026 Conference Management System
                        </p>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }

        return res.status(200).json({
            success: true,
            message: 'Revised paper submitted successfully',
            revision
        });
    } catch (error) {
        console.error('Error submitting revised paper:', error);
        return res.status(500).json({
            success: false,
            message: 'Error submitting revised paper',
            error: error.message
        });
    }
};

// Delete/Remove a reviewer from paper assignment
export const removeReviewerFromPaper = async (req, res) => {
    try {
        const { paperId, reviewerId } = req.body;

        if (!paperId || !reviewerId) {
            return res.status(400).json({
                success: false,
                message: "Paper ID and Reviewer ID are required"
            });
        }

        // Find the paper
        let paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            paper = await PaperSubmission.findById(paperId);
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify editor owns this paper
        if (paper.assignedEditor && paper.assignedEditor.toString() !== req.user.userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to modify reviewers for this paper"
            });
        }

        // Remove reviewer from assignment
        paper.reviewAssignments = paper.reviewAssignments.filter(
            a => a.reviewer.toString() !== reviewerId
        );
        paper.assignedReviewers = paper.assignedReviewers.filter(
            r => r.toString() !== reviewerId
        );

        await paper.save();

        // Delete ALL reviews (all rounds) submitted by this reviewer for this paper
        const deletedReviews = await ReviewerReview.deleteMany({
            paper: paperId,
            reviewer: reviewerId
        });

        console.log(`🗑️ Deleted ${deletedReviews.deletedCount} review(s) for reviewer ${reviewerId} on paper ${paperId}`);

        // Also delete reviewer assignments from ReviewerAssignment collection
        await ReviewerAssignment.deleteMany({
            paper: paperId,
            reviewer: reviewerId
        });

        // Send notification email to editor
        try {
            const editor = await User.findById(paper.assignedEditor);
            const reviewer = await User.findById(reviewerId);

            if (editor && reviewer) {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: editor.email,
                    subject: `Reviewer Removed - ${paper.paperTitle}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Reviewer Removed from Paper Assignment</h2>
                            <p>A reviewer has been removed from the following paper:</p>
                            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                <tr>
                                    <td style="padding: 8px; font-weight: bold;">Reviewer:</td>
                                    <td style="padding: 8px;">${reviewer.username} (${reviewer.email})</td>
                                </tr>
                                <tr style="background-color: #f5f5f5;">
                                    <td style="padding: 8px; font-weight: bold;">Paper:</td>
                                    <td style="padding: 8px;">${paper.paperTitle}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; font-weight: bold;">Submission ID:</td>
                                    <td style="padding: 8px;">${paper.submissionId}</td>
                                </tr>
                                <tr style="background-color: #f5f5f5;">
                                    <td style="padding: 8px; font-weight: bold;">Remaining Reviewers:</td>
                                    <td style="padding: 8px;">${paper.reviewAssignments.length}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; font-weight: bold;">Reviews Deleted:</td>
                                    <td style="padding: 8px;">${deletedReviews.deletedCount} review(s) removed</td>
                                </tr>
                            </table>
                            <p style="color: #666; font-size: 13px;">Note: All reviews by this reviewer for this paper have been permanently deleted.</p>
                        </div>
                    `
                };

                const transporter = require('nodemailer').createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });

                await transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Error sending reviewer removal notification:', emailError);
        }

        return res.status(200).json({
            success: true,
            message: `Reviewer removed successfully. ${deletedReviews.deletedCount} review(s) deleted.`,
            remainingReviewers: paper.reviewAssignments.length,
            reviewsDeleted: deletedReviews.deletedCount,
            updatedPaper: paper
        });
    } catch (error) {
        console.error('Error removing reviewer:', error);
        return res.status(500).json({
            success: false,
            message: "Error removing reviewer",
            error: error.message
        });
    }
};

// Send query/inquiry to reviewer
export const sendReviewerInquiry = async (req, res) => {
    try {
        const { paperId, reviewerId, message } = req.body;

        if (!paperId || !reviewerId || !message) {
            return res.status(400).json({
                success: false,
                message: "Paper ID, Reviewer ID, and message are required"
            });
        }

        const paper = await PaperSubmission.findById(paperId);
        if (!paper) {
            return res.status(404).json({
                success: false,
                message: "Paper not found"
            });
        }

        // Verify editor owns this paper
        if (paper.assignedEditor && paper.assignedEditor.toString() !== req.user.userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to send inquiries for this paper"
            });
        }

        const reviewer = await User.findById(reviewerId);
        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: "Reviewer not found"
            });
        }

        const editor = await User.findById(paper.assignedEditor);

        // Send email to reviewer
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: reviewer.email,
                subject: `Review Status Inquiry - ${paper.paperTitle}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Review Status Inquiry</h2>
                        <p>Hello ${reviewer.username},</p>
                        <p>The editor has sent you the following message regarding your review assignment:</p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
                            <p style="margin: 0; color: #333;">${message.replace(/\n/g, '<br>')}</p>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <tr>
                                <td style="padding: 8px; font-weight: bold;">Paper:</td>
                                <td style="padding: 8px;">${paper.paperTitle}</td>
                            </tr>
                            <tr style="background-color: #f5f5f5;">
                                <td style="padding: 8px; font-weight: bold;">Submission ID:</td>
                                <td style="padding: 8px;">${paper.submissionId}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; font-weight: bold;">Editor:</td>
                                <td style="padding: 8px;">${editor?.username || 'ICMBNT 2026 Editor'}</td>
                            </tr>
                        </table>
                        <p style="color: #666; font-size: 13px;">Please login to the system to submit your review or contact the editor if you have questions.</p>
                    </div>
                `
            };

            const transporter = require('nodemailer').createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Error sending inquiry email:', emailError);
        }

        return res.status(200).json({
            success: true,
            message: "Inquiry sent to reviewer successfully",
            reviewerEmail: reviewer.email
        });
    } catch (error) {
        console.error('Error sending inquiry:', error);
        return res.status(500).json({
            success: false,
            message: "Error sending inquiry",
            error: error.message
        });
    }
};

// Send re-review emails to all reviewers when paper is re-submitted
export const sendReReviewEmails = async (req, res) => {
    try {
        const { paperId } = req.body;
        const editorEmail = req.user.email;

        if (!paperId) {
            return res.status(400).json({
                success: false,
                message: 'Paper ID is required'
            });
        }

        // Get paper details - check both collections
        let paper = await PaperSubmission.findById(paperId).populate('assignedReviewers', 'email username');
        if (!paper) {
            paper = await PaperSubmission.findById(paperId).populate('assignedReviewers', 'email username');
        }

        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found in any collection'
            });
        }

        // Check if paper has reviewers
        if (!paper.assignedReviewers || paper.assignedReviewers.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No reviewers assigned to this paper'
            });
        }

        console.log(`📧 Sending re-review emails to ${paper.assignedReviewers.length} reviewers for paper: ${paper.paperTitle}`);

        let emailsSent = 0;
        const failedEmails = [];

        // Calculate re-review deadline (7 days from now)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);

        // 🔥 IMPORTANT: For re-reviews, automatically set status to "Accepted" 
        // since reviewers don't need to accept again (they already accepted in Round 1)
        for (const reviewer of paper.assignedReviewers) {
            try {
                // Find the reviewer's assignment in the Paper model
                const assignment = (paper.reviewAssignments || []).find(
                    a => a.reviewer && a.reviewer.toString() === reviewer._id.toString()
                );

                if (assignment && assignment.status !== 'Accepted') {
                    assignment.status = 'Accepted';
                    assignment.deadline = deadline; // 🔥 Update deadline for re-review
                    assignment.respondedAt = Date.now();
                    console.log(`✅ Auto-accepted re-review assignment for reviewer ${reviewer.email} with new deadline ${deadline}`);
                }

                // Send re-review email
                const paperData = {
                    submissionId: paper.submissionId,
                    paperTitle: paper.paperTitle,
                    category: paper.category,
                    deadline: deadline,
                    loginLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reviewer-dashboard`
                };

                await sendReReviewEmail(reviewer.email, reviewer.username, paperData);
                emailsSent++;
                console.log(`✅ Re-review email sent to ${reviewer.email}`);
            } catch (emailError) {
                console.error(`❌ Failed to send re-review email to ${reviewer.email}:`, emailError.message);
                failedEmails.push(reviewer.email);
            }
        }

        // Save the paper with updated assignment statuses
        await paper.save();
        console.log(`💾 Saved paper with auto-accepted re-review assignments`);

        return res.status(200).json({
            success: true,
            message: `Re-review emails sent to ${emailsSent} reviewer(s)`,
            emailsSent,
            totalReviewers: paper.assignedReviewers.length,
            failedEmails: failedEmails.length > 0 ? failedEmails : undefined
        });
    } catch (error) {
        console.error('Error sending re-review emails:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending re-review emails',
            error: error.message
        });
    }
};

// Delete a review (editor can remove reviews if paper decision not yet made)
export const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const editorUserId = req.user.userId;

        if (!reviewId) {
            return res.status(400).json({
                success: false,
                message: 'Review ID is required'
            });
        }

        // Find and delete the review
        const review = await ReviewerReview.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Get paper to check if decision already made
        const paper = await PaperSubmission.findById(review.paperId);
        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Don't allow deletion if paper is already decided
        if (paper.status === 'Accepted' || paper.status === 'Rejected') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete review for papers that already have a decision'
            });
        }

        // Delete the review
        await ReviewerReview.findByIdAndDelete(reviewId);

        // Remove review reference from paper submission
        if (paper.reviewAssignments && paper.reviewAssignments.length > 0) {
            paper.reviewAssignments = paper.reviewAssignments.map(assignment => {
                if (assignment.review && assignment.review.toString() === reviewId) {
                    assignment.review = null;
                }
                return assignment;
            });
            await paper.save();
        }

        console.log(`✅ Review ${reviewId} deleted successfully by editor ${editorUserId}`);

        return res.status(200).json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting review',
            error: error.message
        });
    }
};

// Update/edit a review submitted by a reviewer
export const updateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const {
            recommendation,
            overallRating,
            noveltyRating,
            qualityRating,
            clarityRating,
            comments,
            commentsToEditor,
            commentsToReviewer,
            strengths,
            weaknesses
        } = req.body;

        if (!reviewId) {
            return res.status(400).json({
                success: false,
                message: 'Review ID is required'
            });
        }

        // Find the review
        const review = await ReviewerReview.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Get paper to check status
        const paper = await PaperSubmission.findById(review.paper);
        if (!paper) {
            return res.status(404).json({
                success: false,
                message: 'Paper not found'
            });
        }

        // Allow edit only if paper is not decided
        if (paper.status === 'Accepted' || paper.status === 'Rejected') {
            return res.status(400).json({
                success: false,
                message: 'Cannot edit review for papers that already have a decision'
            });
        }

        // Update review fields
        if (recommendation) review.recommendation = recommendation;
        if (overallRating !== undefined) review.overallRating = overallRating;
        if (noveltyRating !== undefined) review.noveltyRating = noveltyRating;
        if (qualityRating !== undefined) review.qualityRating = qualityRating;
        if (clarityRating !== undefined) review.clarityRating = clarityRating;
        if (comments !== undefined) review.comments = comments;
        if (commentsToEditor !== undefined) review.commentsToEditor = commentsToEditor;
        if (commentsToReviewer !== undefined) review.commentsToReviewer = commentsToReviewer;
        if (strengths !== undefined) review.strengths = strengths;
        if (weaknesses !== undefined) review.weaknesses = weaknesses;

        review.updatedAt = new Date();

        await review.save();

        console.log(`✅ Review ${reviewId} updated successfully`);

        return res.status(200).json({
            success: true,
            message: 'Review updated successfully',
            review: review
        });
    } catch (error) {
        console.error('Error updating review:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating review',
            error: error.message
        });
    }
};

// Get re-reviews (Round 2) for a paper
export const getPaperReReviews = async (req, res) => {
    try {
        const { paperId } = req.params;

        if (!paperId) {
            return res.status(400).json({
                success: false,
                message: 'Paper ID is required'
            });
        }

        // Find all Round 2+ reviews for this paper from ReviewerReview collection
        const reReviews = await ReviewerReview.find({
            paper: paperId,
            round: { $gte: 2 },  // Get Round 2 and higher
            status: 'Submitted'  // Only submitted reviews
        })
            .populate('reviewer', 'username email')
            .sort({ round: 1, submittedAt: -1 });

        console.log(`✅ Found ${reReviews.length} re-reviews (Round 2+) for paper ${paperId}`);

        // Map to match expected format (reviewerId field for frontend compatibility)
        const formattedReReviews = reReviews.map(review => ({
            ...review.toObject(),
            reviewerId: review.reviewer  // Add reviewerId field for frontend
        }));

        return res.status(200).json({
            success: true,
            count: formattedReReviews.length,
            reReviews: formattedReReviews
        });
    } catch (error) {
        console.error('Error fetching re-reviews:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching re-reviews',
            error: error.message
        });
    }
};

// ========== NEW CRUD FUNCTIONS FOR REVIEWER MANAGEMENT ==========

// Update reviewer details (Edit)
export const updateReviewerDetails = async (req, res) => {
    try {
        const { reviewerId } = req.params;
        const { username, email } = req.body;

        // Validate input
        if (!username || !email) {
            return res.status(400).json({
                success: false,
                message: 'Username and email are required'
            });
        }

        // Check if email is already in use by another reviewer
        const existingUser = await User.findOne({
            email: email,
            _id: { $ne: reviewerId } // Exclude current user
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email is already in use by another reviewer'
            });
        }

        // Find and update the reviewer
        const updatedReviewer = await User.findByIdAndUpdate(
            reviewerId,
            {
                username: username.trim(),
                email: email.trim()
            },
            { new: true, runValidators: true }
        );

        if (!updatedReviewer) {
            return res.status(404).json({
                success: false,
                message: 'Reviewer not found'
            });
        }

        console.log(`✅ Reviewer updated successfully: ${updatedReviewer.username}`);

        return res.status(200).json({
            success: true,
            message: 'Reviewer details updated successfully',
            reviewer: {
                _id: updatedReviewer._id,
                username: updatedReviewer.username,
                email: updatedReviewer.email,
                role: updatedReviewer.role
            }
        });
    } catch (error) {
        console.error('Error updating reviewer:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating reviewer details',
            error: error.message
        });
    }
};

// Delete reviewer from system
export const deleteReviewerFromSystem = async (req, res) => {
    try {
        const { reviewerId } = req.params;

        // Find the reviewer to delete
        const reviewer = await User.findById(reviewerId);

        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: 'Reviewer not found'
            });
        }

        // Check if reviewer has any assigned papers
        const assignedPapers = await PaperSubmission.find({
            assignedReviewers: reviewerId
        });

        if (assignedPapers.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete reviewer with ${assignedPapers.length} assigned paper(s). Remove them from papers first.`
            });
        }

        // Delete the reviewer user
        await User.findByIdAndDelete(reviewerId);

        // Also delete any messages or reviews associated with this reviewer
        await ReviewerReview.deleteMany({ reviewerId: reviewerId });
        await ReviewerMessage.deleteMany({ senderId: reviewerId });

        console.log(`✅ Reviewer deleted successfully: ${reviewer.username}`);

        return res.status(200).json({
            success: true,
            message: 'Reviewer deleted successfully',
            deletedReviewer: {
                _id: reviewer._id,
                username: reviewer.username,
                email: reviewer.email
            }
        });
    } catch (error) {
        console.error('Error deleting reviewer:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting reviewer',
            error: error.message
        });
    }
};

// ========================================
// FINAL ACCEPTANCE / ACCEPTED PAPERS MANAGEMENT
// ========================================

// Get all accepted papers (for FinalAcceptance collection)
export const getAllAcceptedPapers = async (req, res) => {
    try {
        const acceptedPapers = await FinalAcceptance.find()
            .populate('paperId', 'submissionId paperTitle status')
            .populate('editorId', 'username email')
            .sort({ acceptanceDate: -1 });

        return res.status(200).json({
            success: true,
            count: acceptedPapers.length,
            acceptedPapers
        });
    } catch (error) {
        console.error('Error fetching accepted papers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching accepted papers',
            error: error.message
        });
    }
};

// Get accepted papers by category
export const getAcceptedPapersByCategory = async (req, res) => {
    try {
        const { category } = req.params;

        const acceptedPapers = await FinalAcceptance.find({ category })
            .sort({ acceptanceDate: -1 });

        return res.status(200).json({
            success: true,
            category,
            count: acceptedPapers.length,
            acceptedPapers
        });
    } catch (error) {
        console.error('Error fetching accepted papers by category:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching accepted papers',
            error: error.message
        });
    }
};

// Get accepted papers by author email
export const getAcceptedPapersByAuthor = async (req, res) => {
    try {
        const { email } = req.params;

        const acceptedPapers = await FinalAcceptance.find({ authorEmail: email })
            .sort({ acceptanceDate: -1 });

        return res.status(200).json({
            success: true,
            authorEmail: email,
            count: acceptedPapers.length,
            acceptedPapers
        });
    } catch (error) {
        console.error('Error fetching accepted papers by author:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching accepted papers',
            error: error.message
        });
    }
};

// Get high-rated accepted papers (average rating >= threshold)
export const getHighRatedPapers = async (req, res) => {
    try {
        const { minRating = 4 } = req.query;

        const acceptedPapers = await FinalAcceptance.find({
            averageRating: { $gte: parseFloat(minRating) }
        }).sort({ averageRating: -1 });

        return res.status(200).json({
            success: true,
            minRating,
            count: acceptedPapers.length,
            acceptedPapers
        });
    } catch (error) {
        console.error('Error fetching high-rated papers:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching high-rated papers',
            error: error.message
        });
    }
};

// Get single accepted paper details by submissionId
export const getAcceptedPaperDetails = async (req, res) => {
    try {
        const { submissionId } = req.params;

        const acceptedPaper = await FinalAcceptance.findOne({ submissionId })
            .populate('paperId')
            .populate('editorId', 'username email');

        if (!acceptedPaper) {
            return res.status(404).json({
                success: false,
                message: 'Accepted paper not found'
            });
        }

        return res.status(200).json({
            success: true,
            acceptedPaper
        });
    } catch (error) {
        console.error('Error fetching accepted paper details:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching accepted paper details',
            error: error.message
        });
    }
};

// Get acceptance statistics
export const getAcceptanceStatistics = async (req, res) => {
    try {
        const totalAccepted = await FinalAcceptance.countDocuments({ status: 'Accepted' });
        const certGenerated = await FinalAcceptance.countDocuments({ status: 'Certificate Generated' });
        const published = await FinalAcceptance.countDocuments({ status: 'Published' });

        // Get stats by category
        const byCategory = await FinalAcceptance.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    avgRating: { $avg: '$averageRating' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get stats by reviewer
        const byReviewer = await FinalAcceptance.aggregate([
            { $unwind: '$reviewers' },
            {
                $group: {
                    _id: '$reviewers.reviewerEmail',
                    papersReviewed: { $sum: 1 },
                    avgReviewerRating: { $avg: '$reviewers.overallRating' }
                }
            },
            { $sort: { papersReviewed: -1 } }
        ]);

        // Get stats by author
        const topAuthors = await FinalAcceptance.aggregate([
            {
                $group: {
                    _id: '$authorEmail',
                    acceptedPapers: { $sum: 1 },
                    authorName: { $first: '$authorName' },
                    avgRating: { $avg: '$averageRating' }
                }
            },
            { $sort: { acceptedPapers: -1 } },
            { $limit: 10 }
        ]);

        return res.status(200).json({
            success: true,
            statistics: {
                totalAccepted,
                certGenerated,
                published,
                byCategory,
                topReviewers: byReviewer.slice(0, 10),
                topAuthors
            }
        });
    } catch (error) {
        console.error('Error fetching acceptance statistics:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching acceptance statistics',
            error: error.message
        });
    }
};

// Update FinalAcceptance status (e.g., to Certificate Generated or Published)
export const updateAcceptanceStatus = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { status } = req.body;

        if (!['Accepted', 'Certificate Generated', 'Published'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be one of: Accepted, Certificate Generated, Published'
            });
        }

        const acceptedPaper = await FinalAcceptance.findOneAndUpdate(
            { submissionId },
            { status, updatedAt: new Date() },
            { new: true }
        );

        if (!acceptedPaper) {
            return res.status(404).json({
                success: false,
                message: 'Accepted paper not found'
            });
        }

        console.log('✅ Updated acceptance status:', {
            submissionId,
            newStatus: status
        });

        return res.status(200).json({
            success: true,
            message: 'Acceptance status updated',
            acceptedPaper
        });
    } catch (error) {
        console.error('Error updating acceptance status:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating acceptance status',
            error: error.message
        });
    }
};


