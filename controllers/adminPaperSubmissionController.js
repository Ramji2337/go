import { PaperSubmission } from '../models/Paper.js';
import { User } from '../models/User.js';
import { generateSubmissionId, generateBookingId } from '../utils/helpers.js';
import { sendPaperSubmissionEmail, sendAdminNotificationEmail } from '../utils/emailService.js';
import { uploadPdfToCloudinary } from '../config/cloudinary-pdf.js';
import bcrypt from 'bcryptjs';

// Admin paper submission on behalf of author
export const adminSubmitPaperForAuthor = async (req, res) => {
    console.log('Admin paper submission for author:', req.body);
    console.log('File received:', req.file ? 'Yes, ' + req.file.originalname : 'No file');

    try {
        const { 
            authorEmail, 
            authorName, 
            authorPassword,
            paperTitle, 
            category, 
            topic, 
            abstract,
            createAccountIfNotExists = true
        } = req.body;

        // Validate required fields
        if (!authorEmail || !authorName || !paperTitle || !category) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: authorEmail, authorName, paperTitle, category"
            });
        }

        // Check if PDF file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "PDF file is required"
            });
        }

        // Check if user exists
        let user = await User.findOne({ email: authorEmail.toLowerCase() });
        let isNewUser = false;

        if (!user) {
            if (!createAccountIfNotExists) {
                return res.status(404).json({
                    success: false,
                    message: "Author account not found. Please enable 'Create account if not exists' or use an existing email.",
                    userNotFound: true
                });
            }

            // Validate password for new account
            if (!authorPassword || authorPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "Password is required (minimum 6 characters) for creating new author account"
                });
            }

            // Create new user account
            const hashedPassword = await bcrypt.hash(authorPassword, 10);
            user = new User({
                email: authorEmail.toLowerCase(),
                username: authorName,
                password: hashedPassword,
                role: 'Author',
                country: 'India', // Default country
                isVerified: true // Auto-verify since admin is creating
            });
            await user.save();
            isNewUser = true;
            console.log('New author account created by admin:', authorEmail);
        } else {
            // Update username if different
            if (user.username !== authorName) {
                user.username = authorName;
                await user.save();
            }
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

        // Create new submission
        const newSubmission = new PaperSubmission({
            submissionId,
            paperTitle,
            authorName,
            email: authorEmail.toLowerCase(),
            category,
            topic: topic || null,
            abstract: abstract || null,
            pdfUrl,
            pdfPublicId,
            pdfFileName,
            status: 'Submitted',
            submittedBy: req.user.userId, // Track which admin submitted this
            submittedByAdmin: true,
            versions: [{
                version: 1,
                pdfUrl,
                pdfPublicId,
                pdfFileName,
                submittedAt: new Date()
            }]
        });

        await newSubmission.save();

        console.log('Admin submission saved successfully:', submissionId);

        // Send confirmation emails
        try {
            await Promise.all([
                sendPaperSubmissionEmail({
                    email: authorEmail,
                    authorName,
                    submissionId,
                    paperTitle,
                    category
                }),
                sendAdminNotificationEmail({
                    submissionId,
                    paperTitle,
                    authorName,
                    authorEmail,
                    category,
                    adminSubmitted: true,
                    adminEmail: req.user.email
                })
            ]);
            console.log('Emails sent successfully');
        } catch (emailError) {
            console.error('Failed to send emails:', emailError);
            // Don't fail the submission if emails fail
        }

        return res.status(201).json({
            success: true,
            message: isNewUser 
                ? 'Paper submitted successfully! New author account created.' 
                : 'Paper submitted successfully on behalf of author!',
            submission: newSubmission,
            isNewUser,
            user: {
                email: user.email,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Admin paper submission error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during paper submission',
            error: error.message
        });
    }
};

// Search existing authors for admin paper submission
export const searchExistingAuthors = async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const authors = await User.find({
            $or: [
                { email: { $regex: query, $options: 'i' } },
                { username: { $regex: query, $options: 'i' } }
            ],
            role: 'Author'
        }).limit(10).select('email username country');

        return res.status(200).json({
            success: true,
            authors
        });
    } catch (error) {
        console.error('Search authors error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error searching authors',
            error: error.message
        });
    }
};
