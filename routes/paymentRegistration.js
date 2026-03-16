import express from 'express';
import PaymentRegistration from '../models/PaymentRegistration.js';
import FinalAcceptance from '../models/FinalAcceptance.js';
import { PaperSubmission } from '../models/Paper.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

// Submit Payment Registration
router.post('/submit', authMiddleware, async (req, res) => {
    try {
        const {
            paymentMethod,
            paymentSubMethod, // 'upi' or 'bank-account'
            transactionId,
            amount,
            currency,
            currencySymbol,
            country,
            paymentScreenshot,
            registrationCategory
        } = req.body;

        const userEmail = req.user.email;

        console.log('📝 Payment registration submission received:', {
            email: userEmail,
            paymentMethod,
            paymentSubMethod,
            amount,
            currency,
            country,
            hasScreenshot: !!paymentScreenshot,
            registrationCategory
        });

        // Fetch user's accepted paper details
        const acceptedPaper = await FinalAcceptance.findOne({ authorEmail: userEmail })
            .sort({ acceptanceDate: -1 });

        if (!acceptedPaper) {
            return res.status(404).json({
                success: false,
                message: 'No accepted paper found. Only accepted authors can register.'
            });
        }

        // Validate required fields
        if (!paymentMethod || !amount || !registrationCategory || !country) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: paymentMethod, amount, registrationCategory, country'
            });
        }

        // Validate payment screenshot for bank transfer
        if (paymentMethod === 'bank-transfer' && !paymentScreenshot) {
            return res.status(400).json({
                success: false,
                message: 'Payment screenshot is required for bank transfer'
            });
        }

        // Check if user has already registered (only pending or verified)
        const existingRegistration = await PaymentRegistration.findOne({
            authorEmail: userEmail,
            paymentStatus: { $in: ['pending', 'verified'] }
        });
        if (existingRegistration) {
            return res.status(400).json({
                success: false,
                message: 'You have already submitted a registration. Please wait for admin verification.',
                existingRegistration: {
                    paymentStatus: existingRegistration.paymentStatus,
                    registrationDate: existingRegistration.registrationDate
                }
            });
        }

        // Upload screenshot to Cloudinary if provided
        let screenshotUrl = '';
        let screenshotPublicId = '';

        if (paymentScreenshot) {
            try {
                console.log('📤 Uploading payment screenshot to Cloudinary...');

                const uploadResult = await cloudinary.uploader.upload(paymentScreenshot, {
                    folder: 'payment-screenshots',
                    resource_type: 'image',
                    transformation: [
                        { width: 1000, height: 1000, crop: 'limit' },
                        { quality: 'auto:good' }
                    ]
                });

                screenshotUrl = uploadResult.secure_url;
                screenshotPublicId = uploadResult.public_id;

                console.log('✅ Screenshot uploaded to Cloudinary:', screenshotPublicId);
            } catch (uploadError) {
                console.error('❌ Cloudinary upload error:', uploadError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload payment screenshot',
                    error: uploadError.message
                });
            }
        }

        const paymentRegistration = new PaymentRegistration({
            userId: req.user?.userId,
            authorEmail: acceptedPaper.authorEmail,
            authorName: acceptedPaper.authorName,
            paperId: acceptedPaper._id,
            submissionId: acceptedPaper.submissionId,
            paperTitle: acceptedPaper.paperTitle,
            paperUrl: acceptedPaper.pdfUrl || acceptedPaper.revisionPdfs?.cleanPdfUrl || '',
            institution: 'To be updated', // Can be updated later if needed
            address: 'To be updated',
            country: country || 'Not specified',
            paymentMethod: paymentSubMethod || paymentMethod,
            transactionId,
            amount,
            currency: currency || 'USD',
            paymentScreenshot: screenshotUrl,
            paymentScreenshotPublicId: screenshotPublicId,
            registrationCategory,
            paymentStatus: 'pending'
        });

        await paymentRegistration.save();

        // Update FinalAcceptance
        await FinalAcceptance.findByIdAndUpdate(acceptedPaper._id, {
            paymentStatus: 'paid',
            paymentRegistrationId: paymentRegistration._id
        });

        console.log('✅ Payment registration created:', {
            id: paymentRegistration._id,
            amount: paymentRegistration.amount,
            currency: paymentRegistration.currency,
            country: paymentRegistration.country
        });

        res.status(201).json({
            success: true,
            message: 'Registration submitted successfully! Please wait for admin verification.',
            registration: {
                id: paymentRegistration._id,
                paymentStatus: paymentRegistration.paymentStatus,
                registrationDate: paymentRegistration.registrationDate,
                authorName: paymentRegistration.authorName,
                paperTitle: paymentRegistration.paperTitle
            }
        });

    } catch (error) {
        console.error('❌ Error submitting payment registration:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit registration',
            error: error.message
        });
    }
});

// Get My Registration Status
router.get('/my-registration', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;

        const registration = await PaymentRegistration.findOne({ authorEmail: userEmail })
            .sort({ createdAt: -1 });

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'No registration found'
            });
        }

        res.json({
            success: true,
            registration: {
                id: registration._id,
                authorName: registration.authorName,
                paperTitle: registration.paperTitle,
                institution: registration.institution,
                paymentMethod: registration.paymentMethod,
                transactionId: registration.transactionId,
                amount: registration.amount,
                paymentStatus: registration.paymentStatus,
                registrationDate: registration.registrationDate,
                verifiedAt: registration.verifiedAt,
                verificationNotes: registration.verificationNotes,
                rejectionReason: registration.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Error fetching registration:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch registration',
            error: error.message
        });
    }
});

// Get User's Accepted Paper Details (for auto-filling registration)
// Checks both FinalAcceptance and PaperSubmission collections
router.get('/my-paper-details', authMiddleware, async (req, res) => {
    try {
        const userEmail = req.user.email;

        console.log('🔍 Searching for accepted paper for email:', userEmail);

        // Fetch user profile data (userType and country)
        const { User } = await import('../models/User.js');
        const user = await User.findOne({ email: userEmail }).select('userType country');

        const userProfile = {
            userType: user?.userType || null,
            country: user?.country || null
        };

        console.log('👤 User profile data:', userProfile);

        // First check FinalAcceptance (migrated papers)
        let acceptedPaper = await FinalAcceptance.findOne({
            authorEmail: userEmail
        }).sort({ acceptanceDate: -1 });

        if (acceptedPaper) {
            console.log('✅ Accepted paper found in FinalAcceptance:', {
                submissionId: acceptedPaper.submissionId,
                authorName: acceptedPaper.authorName,
                paperTitle: acceptedPaper.paperTitle
            });

            return res.json({
                success: true,
                paperDetails: {
                    submissionId: acceptedPaper.submissionId,
                    paperTitle: acceptedPaper.paperTitle,
                    authorName: acceptedPaper.authorName,
                    authorEmail: acceptedPaper.authorEmail,
                    category: acceptedPaper.category || 'General',
                    acceptanceDate: acceptedPaper.acceptanceDate,
                    paymentStatus: 'pending'
                },
                userProfile
            });
        }

        // If not in FinalAcceptance, check PaperSubmission for accepted papers
        const submittedPaper = await PaperSubmission.findOne({
            email: userEmail,
            status: 'Accepted'
        }).sort({ updatedAt: -1 });

        if (submittedPaper) {
            console.log('✅ Accepted paper found in PaperSubmission:', {
                submissionId: submittedPaper.submissionId,
                authorName: submittedPaper.authorName,
                paperTitle: submittedPaper.paperTitle,
                status: submittedPaper.status
            });

            return res.json({
                success: true,
                paperDetails: {
                    submissionId: submittedPaper.submissionId,
                    paperTitle: submittedPaper.paperTitle,
                    authorName: submittedPaper.authorName,
                    authorEmail: submittedPaper.email,
                    category: submittedPaper.category || 'General',
                    acceptanceDate: submittedPaper.updatedAt,
                    paymentStatus: 'pending'
                },
                userProfile
            });
        }

        // No accepted paper found
        console.log('❌ No accepted paper found for user:', userEmail);

        return res.status(404).json({
            success: false,
            message: 'No accepted paper found for this user'
        });

    } catch (error) {
        console.error('❌ Error fetching paper details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch paper details',
            error: error.message
        });
    }
});

// ADMIN ROUTES

// Get All Pending Registrations (Admin Only)
router.get('/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const pendingRegistrations = await PaymentRegistration.find({ paymentStatus: 'pending' })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: pendingRegistrations.length,
            registrations: pendingRegistrations
        });

    } catch (error) {
        console.error('❌ Error fetching pending registrations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending registrations',
            error: error.message
        });
    }
});

// Get All Registrations (Admin Only)
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.query;

        const query = status ? { paymentStatus: status } : {};
        const registrations = await PaymentRegistration.find(query)
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: registrations.length,
            registrations
        });

    } catch (error) {
        console.error('❌ Error fetching registrations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch registrations',
            error: error.message
        });
    }
});

// Verify Payment (Admin Only)
router.put('/admin/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { verificationNotes } = req.body;

        const registration = await PaymentRegistration.findById(id);
        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        // Check if already verified
        if (registration.paymentStatus === 'verified') {
            return res.status(400).json({
                success: false,
                message: 'Payment already verified'
            });
        }

        // Update registration status
        registration.paymentStatus = 'verified';
        registration.verifiedBy = req.user.userId;  // Use userId from JWT
        registration.verifiedAt = new Date();
        registration.verificationNotes = verificationNotes || 'Payment verified by admin';
        await registration.save();

        // Update FinalAcceptance if linked
        if (registration.paperId) {
            await FinalAcceptance.findByIdAndUpdate(registration.paperId, {
                paymentStatus: 'verified'
            });
        }

        // Create final user record in PaymentDoneFinalUser collection
        const { PaymentDoneFinalUser } = await import('../models/PaymentDoneFinalUser.js');

        const finalUser = new PaymentDoneFinalUser({
            userId: registration.userId,
            authorEmail: registration.authorEmail,
            authorName: registration.authorName,
            paperId: registration.paperId,
            submissionId: registration.submissionId,
            paperTitle: registration.paperTitle,
            paperUrl: registration.paperUrl || '',
            institution: registration.institution,
            address: registration.address,
            country: registration.country,
            paymentMethod: registration.paymentMethod,
            transactionId: registration.transactionId,
            amount: registration.amount,
            currency: registration.currency,
            paymentRegistrationId: registration._id,
            registrationCategory: registration.registrationCategory,
            verifiedBy: req.user.userId,  // Use userId from JWT
            verifiedByName: req.user.username,
            verifiedByEmail: req.user.email,
            verifiedAt: new Date(),
            verificationNotes: registration.verificationNotes,
            registrationDate: registration.registrationDate
        });

        await finalUser.save();

        // Send registration confirmation email to the author
        try {
            const { sendRegistrationConfirmationEmail } = await import('../utils/emailService.js');
            await sendRegistrationConfirmationEmail({
                authorEmail: finalUser.authorEmail,
                authorName: finalUser.authorName,
                paperTitle: finalUser.paperTitle,
                submissionId: finalUser.submissionId,
                registrationNumber: finalUser.registrationNumber,
                registrationCategory: finalUser.registrationCategory,
                amount: finalUser.amount,
                currency: finalUser.currency
            });
            console.log('✅ Registration confirmation email sent successfully');
        } catch (emailError) {
            console.error('⚠️ Failed to send registration confirmation email:', emailError);
            // Don't fail the verification if email fails
        }

        console.log('✅ Payment verified and final user created:', {
            registrationId: id,
            finalUserId: finalUser._id,
            registrationNumber: finalUser.registrationNumber
        });

        res.json({
            success: true,
            message: 'Payment verified successfully',
            registration,
            finalUser: {
                id: finalUser._id,
                registrationNumber: finalUser.registrationNumber,
                authorName: finalUser.authorName,
                authorEmail: finalUser.authorEmail
            }
        });

    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        if (error.name === 'ValidationError') {
            console.error('🔍 Validation Errors:', Object.keys(error.errors).map(key => `${key}: ${error.errors[key].message}`));
            return res.status(400).json({
                success: false,
                message: 'Data validation failed during verification',
                details: Object.values(error.errors).map(e => e.message)
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to verify payment',
            error: error.message
        });
    }
});

// Reject Payment (Admin Only)
router.put('/admin/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const registration = await PaymentRegistration.findById(id);
        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found'
            });
        }

        // Store registration details before deletion for email
        const registrationDetails = {
            authorEmail: registration.authorEmail,
            authorName: registration.authorName,
            paperTitle: registration.paperTitle,
            submissionId: registration.submissionId,
            amount: registration.amount,
            transactionId: registration.transactionId,
            rejectionReason
        };

        // Update FinalAcceptance if linked
        if (registration.paperId) {
            await FinalAcceptance.findByIdAndUpdate(registration.paperId, {
                paymentStatus: 'pending'
            });
        }

        // Delete the cloudinary screenshot if exists
        if (registration.paymentScreenshotPublicId) {
            try {
                await cloudinary.uploader.destroy(registration.paymentScreenshotPublicId);
                console.log('🗑️ Cloudinary screenshot deleted:', registration.paymentScreenshotPublicId);
            } catch (cloudinaryError) {
                console.error('⚠️ Failed to delete cloudinary screenshot:', cloudinaryError);
            }
        }

        // Delete the registration from database
        await PaymentRegistration.findByIdAndDelete(id);

        // Send rejection email to author
        try {
            const { sendPaymentRejectionEmail } = await import('../utils/emailService.js');
            await sendPaymentRejectionEmail({
                authorEmail: registrationDetails.authorEmail,
                authorName: registrationDetails.authorName,
                paperTitle: registrationDetails.paperTitle,
                submissionId: registrationDetails.submissionId,
                rejectionReason: registrationDetails.rejectionReason,
                amount: registrationDetails.amount,
                transactionId: registrationDetails.transactionId,
                registrationType: 'author'
            });
            console.log('✅ Payment rejection email sent to:', registrationDetails.authorEmail);
        } catch (emailError) {
            console.error('⚠️ Failed to send rejection email:', emailError);
            // Don't fail the rejection if email fails
        }

        console.log('❌ Payment rejected and deleted for registration:', id);

        res.json({
            success: true,
            message: 'Payment rejected and registration removed. User has been notified to resubmit payment.',
            deletedRegistration: {
                authorEmail: registrationDetails.authorEmail,
                authorName: registrationDetails.authorName,
                rejectionReason: registrationDetails.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Error rejecting payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject payment',
            error: error.message
        });
    }
});

// DEBUG ENDPOINT: Check all accepted papers in database
router.get('/debug/all-papers', async (req, res) => {
    try {
        const allPapers = await FinalAcceptance.find({}).select('submissionId authorName authorEmail paperTitle acceptanceDate');
        res.json({
            success: true,
            totalPapers: allPapers.length,
            papers: allPapers
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DEBUG ENDPOINT: Create test accepted paper for user
router.post('/debug/create-test-paper', async (req, res) => {
    try {
        // First create a test paper
        const testPaper = new PaperSubmission({
            submissionId: 'TEST-' + Date.now(),
            paperTitle: 'Test Paper for Registration',
            authorName: 'Test Author',
            email: 'itzrvm237@gmail.com',
            category: 'STEM',
            abstract: 'Test abstract',
            status: 'Accepted',
            pdfUrl: 'https://example.com/test.pdf'
        });

        const savedPaper = await testPaper.save();

        // Now create FinalAcceptance record
        const finalAcceptance = new FinalAcceptance({
            paperId: savedPaper._id,
            submissionId: savedPaper.submissionId,
            paperTitle: savedPaper.paperTitle,
            authorName: savedPaper.authorName,
            authorEmail: savedPaper.email,
            category: savedPaper.category,
            pdfUrl: 'https://example.com/test.pdf',
            acceptanceDate: new Date(),
            paymentStatus: 'pending',
            status: 'Accepted'
        });

        const savedAcceptance = await finalAcceptance.save();

        res.json({
            success: true,
            message: 'Test paper created successfully',
            paper: savedAcceptance
        });
    } catch (error) {
        console.error('Error creating test paper:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
