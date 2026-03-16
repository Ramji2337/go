import { Copyright } from '../models/Copyright.js';
import { PaymentDoneFinalUser } from '../models/PaymentDoneFinalUser.js';
import FinalAcceptance from '../models/FinalAcceptance.js';
import ConferenceSelectedUser from '../models/ConferenceSelectedUser.js';
import { PaperSubmission } from '../models/Paper.js';
import { User } from '../models/User.js';
import { emitToUser, emitToAdmins } from '../socket.js';

// Escape regex special characters in a string for safe use in RegExp
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Author: Get Dashboard Data
export const getAuthorCopyrightDashboard = async (req, res) => {
    try {
        const authorEmail = req.user.email;
        const safeEmail = escapeRegex(authorEmail);

        // 1. Get all paper submissions from all possible collections
        const [mainPapers, finalAcceptedPapers] = await Promise.all([
            PaperSubmission.find({ email: { $regex: new RegExp(`^${safeEmail}$`, 'i') } }),
            FinalAcceptance.find({ authorEmail: { $regex: new RegExp(`^${safeEmail}$`, 'i') } })
        ]);

        console.log(`🔍 Dashboard fetch for ${authorEmail}: Found ${mainPapers.length} main, ${finalAcceptedPapers.length} final accepted.`);

        // 2. Merge and de-duplicate by submissionId using a Map
        // Strategy: collect all records per submissionId, then merge fields
        const submissionMap = new Map();

        // Helper: merge a paper record into the map
        const mergePaper = (p, source) => {
            const sid = p.submissionId?.toLowerCase();
            if (!sid) return;

            const pobj = p.toObject ? p.toObject() : { ...p };
            pobj._source = source; // track origin for debugging

            // Normalize email field (FinalAcceptance uses authorEmail, others use email)
            if (!pobj.email && pobj.authorEmail) pobj.email = pobj.authorEmail;
            if (!pobj.authorEmail && pobj.email) pobj.authorEmail = pobj.email;

            if (!submissionMap.has(sid)) {
                submissionMap.set(sid, pobj);
            } else {
                // Merge: fill in missing fields from this source
                const existing = submissionMap.get(sid);
                // Prefer FinalAcceptance or later-stage data for status
                if (source === 'FinalAcceptance') {
                    // FinalAcceptance is the most authoritative — override status
                    existing.status = pobj.status || existing.status;
                    existing.finalDecision = pobj.finalDecision || existing.finalDecision;
                }
                // Fill empty fields from the new source
                for (const key of Object.keys(pobj)) {
                    if ((existing[key] === undefined || existing[key] === null) && pobj[key] != null) {
                        existing[key] = pobj[key];
                    }
                }
                // Keep pdfUrl from the most recent source that has one
                if (pobj.pdfUrl && source === 'FinalAcceptance') {
                    existing.pdfUrl = pobj.pdfUrl;
                }
            }
        };

        // Process in order: papers first, then FinalAcceptance (overrides)
        mainPapers.forEach(p => mergePaper(p, 'PaperSubmission'));
        finalAcceptedPapers.forEach(p => mergePaper(p, 'FinalAcceptance'));

        const allPapers = Array.from(submissionMap.values());
        console.log(`✅ Total unique papers found for dashboard: ${allPapers.length}`);

        if (allPapers.length === 0) {
            return res.status(200).json({
                success: true,
                hasPaper: false,
                message: "No paper submission found."
            });
        }

        // 3. Enrich papers with copyright information
        const papersWithCopyright = await Promise.all(allPapers.map(async (p) => {
            // p is already a plain object from mergePaper
            const pobj = p.toObject ? p.toObject() : p;
            const safeSid = escapeRegex(pobj.submissionId);

            // Try to find an existing copyright record
            let copyright = await Copyright.findOne({
                submissionId: { $regex: new RegExp(`^${safeSid}$`, 'i') }
            });

            // Determine if paper qualifies as accepted
            const isAccepted = (
                pobj.status === 'Accepted' ||
                pobj.status === 'Published' ||
                pobj.status === 'Certificate Generated' ||
                pobj.finalDecision === 'Accept'
            );

            // If paper is Accepted/Published but no copyright record exists, create one
            if (!copyright && isAccepted) {
                try {
                    copyright = await Copyright.create({
                        paperId: pobj._id,
                        submissionId: pobj.submissionId,
                        authorEmail: authorEmail,
                        authorName: pobj.authorName || 'Author',
                        paperTitle: pobj.paperTitle || 'Untitled Paper',
                        status: 'Pending'
                    });
                    console.log(`📝 Created copyright record for ${pobj.submissionId}`);
                } catch (err) {
                    // Duplicate key means copyright was just created by another request — fetch it
                    if (err.code === 11000) {
                        copyright = await Copyright.findOne({
                            submissionId: { $regex: new RegExp(`^${safeSid}$`, 'i') }
                        });
                    } else {
                        console.error(`Error creating copyright for ${pobj.submissionId}:`, err);
                    }
                }
            }

            return { ...pobj, copyright: copyright || null };
        }));

        // Sort: Accepted papers first, then by date
        papersWithCopyright.sort((a, b) => {
            const acceptedStatuses = ['Accepted', 'Published', 'Certificate Generated'];
            const aIsAccepted = acceptedStatuses.includes(a.status) || a.finalDecision === 'Accept';
            const bIsAccepted = acceptedStatuses.includes(b.status) || b.finalDecision === 'Accept';
            if (aIsAccepted && !bIsAccepted) return -1;
            if (!aIsAccepted && bIsAccepted) return 1;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        // 4. Calculate notifications summary
        const notifications = {
            unreadMessages: 0,
            pendingCopyrights: 0,
            pendingCameraReady: 0,
            totalTasks: 0
        };

        papersWithCopyright.forEach(p => {
            const cp = p.copyright;
            if (cp) {
                // Count unread messages for author
                const unread = cp.messages ? cp.messages.filter(m => m.sender === 'Admin' && !m.isReadByAuthor).length : 0;
                p.unreadCount = unread;
                notifications.unreadMessages += unread;

                // Pending tasks
                if (cp.status === 'Pending' || cp.status === 'Rejected') {
                    p.needsCopyright = true;
                    notifications.pendingCopyrights++;
                    notifications.totalTasks++;
                }

                // Camera ready check (if accepted)
                const isAccepted = (
                    p.status === 'Accepted' ||
                    p.status === 'Published' ||
                    p.status === 'Certificate Generated' ||
                    p.finalDecision === 'Accept'
                );

                if (isAccepted && !cp.cameraReadyUrl) {
                    p.needsCameraReady = true;
                    notifications.pendingCameraReady++;
                    notifications.totalTasks++;
                }
            }
        });

        const payment = await PaymentDoneFinalUser.findOne({ authorEmail: { $regex: new RegExp(`^${safeEmail}$`, 'i') } });

        return res.status(200).json({
            success: true,
            hasPaper: true,
            notifications,
            data: {
                payment,
                paper: papersWithCopyright[0],
                allPapers: papersWithCopyright,
                copyright: papersWithCopyright[0].copyright
            }
        });
    } catch (error) {
        console.error('Error in getAuthorCopyrightDashboard:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching copyright dashboard',
            error: error.message
        });
    }
};

// Author: Upload Copyright Form
export const uploadCopyrightForm = async (req, res) => {
    try {
        const authorEmail = req.user.email;
        let { copyrightFormUrl, copyrightFormPublicId } = req.body;

        // If a file is uploaded via multer, use it
        if (req.file) {
            const { uploadPdfToCloudinary } = await import('../config/cloudinary-pdf.js');
            try {
                const cloudinaryResult = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);
                copyrightFormUrl = cloudinaryResult.url;
                copyrightFormPublicId = cloudinaryResult.publicId;
            } catch (uploadError) {
                console.error('Failed to upload Copyright to Cloudinary:', uploadError.message);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload Copyright form to Cloudinary'
                });
            }
        }

        if (!copyrightFormUrl) {
            return res.status(400).json({
                success: false,
                message: 'Copyright form URL or file is required'
            });
        }

        const { submissionId } = req.body;

        // Find copyright by both email and submissionId to be safe
        const copyright = await Copyright.findOne({ authorEmail, submissionId });
        if (!copyright) {
            return res.status(404).json({
                success: false,
                message: 'Copyright record not found for this submission'
            });
        }

        copyright.copyrightFormUrl = copyrightFormUrl;
        copyright.copyrightFormPublicId = copyrightFormPublicId;
        copyright.status = 'Submitted';
        copyright.submittedAt = new Date();
        await copyright.save();

        // Emit to Author
        emitToUser(copyright.authorEmail, 'copyright:update', {
            submissionId: copyright.submissionId,
            status: copyright.status,
            copyrightFormUrl: copyright.copyrightFormUrl
        });

        // Emit to Admins
        emitToAdmins('copyright:update', {
            submissionId: copyright.submissionId,
            authorEmail: copyright.authorEmail,
            status: copyright.status
        });

        return res.status(200).json({
            success: true,
            message: 'Copyright form uploaded successfully',
            data: copyright
        });
    } catch (error) {
        console.error('Error in uploadCopyrightForm:', error);
        return res.status(500).json({
            success: false,
            message: 'Error uploading copyright form',
            error: error.message
        });
    }
};

// Author/Admin: Send Message
export const sendCopyrightMessage = async (req, res) => {
    try {
        const { copyrightId, message } = req.body;
        const senderRole = req.user.role === 'Admin' ? 'Admin' : 'Author';
        const senderId = req.user.id;

        const copyright = await Copyright.findById(copyrightId);
        if (!copyright) {
            return res.status(404).json({
                success: false,
                message: 'Copyright record not found'
            });
        }

        // Check permission: Admin can message anyone, Author can only message their own
        if (senderRole === 'Author' && copyright.authorEmail !== req.user.email) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        const newMessage = {
            sender: senderRole,
            senderId,
            message,
            timestamp: new Date()
        };
        copyright.messages.push(newMessage);

        await copyright.save();

        // Emit message to relevant parties
        if (senderRole === 'Admin') {
            emitToUser(copyright.authorEmail, 'copyright:message', {
                submissionId: copyright.submissionId,
                message: newMessage,
                unreadCount: copyright.messages.filter(m => m.sender === 'Admin' && !m.isReadByAuthor).length
            });
        } else { // Author
            emitToAdmins('copyright:message', {
                submissionId: copyright.submissionId,
                authorEmail: copyright.authorEmail,
                message: newMessage,
                unreadCount: copyright.messages.filter(m => m.sender === 'Author' && !m.isReadByAdmin).length
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            data: copyright.messages
        });
    } catch (error) {
        console.error('Error in sendCopyrightMessage:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

// Admin: Get All Copyright Forms
export const getAllCopyrightForms = async (req, res) => {
    try {
        const copyrights = await Copyright.find().sort({ updatedAt: -1 });
        return res.status(200).json({
            success: true,
            count: copyrights.length,
            data: copyrights
        });
    } catch (error) {
        console.error('Error in getAllCopyrightForms:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching copyright forms',
            error: error.message
        });
    }
};

// Admin: Review Copyright Form
export const reviewCopyrightForm = async (req, res) => {
    try {
        const { copyrightId, status, adminComment } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const copyright = await Copyright.findById(copyrightId);
        if (!copyright) {
            return res.status(404).json({
                success: false,
                message: 'Copyright record not found'
            });
        }

        copyright.status = status;
        if (adminComment) {
            copyright.messages.push({
                sender: 'Admin',
                senderId: req.user.id,
                message: `Review: ${status}. Comment: ${adminComment}`,
                timestamp: new Date()
            });
        }

        await copyright.save();

        // Emit to Author
        emitToUser(copyright.authorEmail, 'copyright:update', {
            submissionId: copyright.submissionId,
            status: copyright.status,
            adminComment: adminComment
        });

        // Emit to Admins
        emitToAdmins('copyright:update', {
            submissionId: copyright.submissionId,
            authorEmail: copyright.authorEmail,
            status: copyright.status
        });

        // If approved, create or update record in ConferenceSelectedUser
        if (status === 'Approved') {
            try {
                // Find paper and payment details for rich metadata
                let paper = await PaperSubmission.findOne({ submissionId: copyright.submissionId })
                    .populate('assignedEditor', 'email username')
                    .populate('reviewAssignments.reviewer', 'email username');

                if (!paper) {
                    const {PaperSubmission} = await import('../models/Paper.js');
                    paper = await PaperSubmission.findOne({ submissionId: copyright.submissionId })
                        .populate('assignedEditor', 'email username')
                        .populate('reviewAssignments.reviewer', 'email username');
                }

                const payment = await PaymentDoneFinalUser.findOne({ authorEmail: copyright.authorEmail });

                // Extract reviewer names/emails
                const reviewersList = paper?.reviewAssignments?.map(a =>
                    `${a.reviewer?.username || 'Unknown'} (${a.reviewer?.email || 'N/A'})`
                ) || [];

                await ConferenceSelectedUser.findOneAndUpdate(
                    { submissionId: copyright.submissionId },
                    {
                        authorEmail: copyright.authorEmail,
                        authorName: copyright.authorName,
                        paperTitle: copyright.paperTitle,
                        submissionId: copyright.submissionId,
                        paperUrl: paper?.pdfUrl || 'N/A',
                        copyrightUrl: copyright.copyrightFormUrl,
                        paymentId: payment?._id,
                        registrationNumber: payment?.registrationNumber,
                        category: paper?.category,
                        abstract: paper?.abstract,
                        editorEmail: paper?.assignedEditor?.email,
                        reviewers: reviewersList,
                        revisionRounds: paper?.revisionCount || 0,
                        paperSubmittedAt: paper?.createdAt,
                        copyrightSubmittedAt: copyright.submittedAt || copyright.updatedAt,
                        selectionDate: new Date(),
                        status: 'Confirmed'
                    },
                    { upsert: true, new: true }
                );
                console.log(`✅ User ${copyright.authorEmail} added to ConferenceSelectedUser`);
            } catch (selectedUserError) {
                console.error('Error saving to ConferenceSelectedUser:', selectedUserError);
                // We don't fail the main request if this secondary storage fails,
                // but we log it.
            }
        }

        return res.status(200).json({
            success: true,
            message: `Copyright form ${status.toLowerCase()} successfully`,
            data: copyright
        });
    } catch (error) {
        console.error('Error in reviewCopyrightForm:', error);
        return res.status(500).json({
            success: false,
            message: 'Error reviewing copyright form',
            error: error.message
        });
    }
};

// Author: Upload Camera-Ready Paper
export const uploadCameraReady = async (req, res) => {
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

        // Upload to Cloudinary
        let fileUrl;
        if (process.env.CLOUDINARY_CLOUD_NAME) {
            const { uploadPdfToCloudinary } = await import('../config/cloudinary-pdf.js');
            const cloudinaryResult = await uploadPdfToCloudinary(req.file.buffer, req.file.originalname);
            fileUrl = cloudinaryResult.url;
            copyright.cameraReadyUrl = fileUrl; // Update copyright record
        } else {
            fileUrl = `/uploads/${req.file.filename}`;
            copyright.cameraReadyUrl = fileUrl; // Update copyright record
        }
        
        await copyright.save();

        // Notify Admins
        emitToAdmins('final:camera_ready', {
            submissionId: copyright.submissionId,
            authorName: copyright.authorName,
            paperTitle: copyright.paperTitle
        });

        // Notify Author (confirming success)
        emitToUser(copyright.authorEmail, 'copyright:update', {
            submissionId: copyright.submissionId,
            cameraReadyUploaded: true,
            cameraReadyUrl: fileUrl
        });

        return res.status(200).json({
            success: true,
            message: 'Camera-ready paper uploaded successfully',
            cameraReadyUrl: fileUrl
        });
    } catch (error) {
        console.error('Error in uploadCameraReady:', error);
        return res.status(500).json({
            success: false,
            message: 'Error uploading camera-ready paper',
            error: error.message
        });
    }
};

// Author/Admin: Mark messages as read
export const markCopyrightMessagesAsRead = async (req, res) => {
    try {
        const { copyrightId } = req.body;
        const userRole = req.user.role;

        const copyright = await Copyright.findById(copyrightId);
        if (!copyright) {
            return res.status(404).json({ success: false, message: 'Copyright record not found' });
        }

        let modified = false;
        copyright.messages.forEach(msg => {
            if (userRole === 'Author' && msg.sender === 'Admin' && !msg.isReadByAuthor) {
                msg.isReadByAuthor = true;
                modified = true;
            } else if (userRole === 'Admin' && msg.sender === 'Author' && !msg.isReadByAdmin) {
                msg.isReadByAdmin = true;
                modified = true;
            }
        });

        if (modified) {
            await copyright.save();
            // Emit to Author
            emitToUser(copyright.authorEmail, 'copyright:update', {
                submissionId: copyright.submissionId,
                status: copyright.status,
                messages: copyright.messages
            });
        }
        return res.status(200).json({ success: true, message: 'Messages marked as read' });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        return res.status(500).json({ success: false, message: 'Error marking messages as read' });
    }
};
