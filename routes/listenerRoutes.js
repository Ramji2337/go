import express from 'express';
import ListenerRegistration from '../models/ListenerRegistration.js';
import { User } from '../models/User.js';
import { verifyJWT, adminMiddleware } from '../middleware/auth.js';
import Membership from '../models/Membership.js';
import { sendListenerPaymentVerificationEmail } from '../utils/emailService.js';

const router = express.Router();

// Submit listener registration
router.post('/submit-listener', verifyJWT, async (req, res) => {
    try {
        const {
            institution,
            address,
            country,
            paymentMethod,
            paymentSubMethod,
            transactionId,
            amount,
            paymentScreenshot,
            registrationCategory
        } = req.body;

        const userId = req.user.userId;
        const email = req.user.email;

        console.log('📝 Listener registration submission:', {
            email,
            userId,
            country,
            paymentMethod,
            paymentSubMethod,
            registrationCategory,
            hasScreenshot: !!paymentScreenshot,
            institution: institution ? `"${institution}"` : 'NOT PROVIDED',
            address: address ? `"${address}"` : 'NOT PROVIDED',
            amount
        });

        // Validate required fields with better error reporting
        const missingFields = {};
        if (!institution || institution.trim() === '') missingFields.institution = true;
        if (!address || address.trim() === '') missingFields.address = true;
        if (!country || country.trim() === '') missingFields.country = true;
        if (!paymentMethod || paymentMethod.trim() === '') missingFields.paymentMethod = true;
        if (!amount || amount <= 0) missingFields.amount = true;
        if (!registrationCategory || registrationCategory.trim() === '') missingFields.registrationCategory = true;

        if (Object.keys(missingFields).length > 0) {
            console.error('❌ Missing required fields:', missingFields);
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
                missing: missingFields
            });
        }

        // Get user details
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already registered as listener
        const existingRegistration = await ListenerRegistration.findOne({
            userId,
            paymentStatus: { $in: ['pending', 'verified'] }
        });

        if (existingRegistration) {
            return res.status(400).json({
                success: false,
                message: 'You have already registered as a listener'
            });
        }

        // Check SCIS membership
        let isScisMember = false;
        let scisMembershipId = null;

        try {
            const membership = await Membership.findOne({
                email: email.toLowerCase(),
                approvalStatus: 'approved'
            });

            if (membership) {
                isScisMember = true;
                scisMembershipId = membership.membershipId;
            }
        } catch (error) {
            console.log('Membership check error:', error);
        }

        // Determine final payment method
        const finalPaymentMethod = paymentSubMethod || paymentMethod;

        // Create listener registration
        const listenerRegistration = new ListenerRegistration({
            userId,
            email,
            name: user.username || email.split('@')[0],
            institution,
            address,
            country,
            paymentMethod: finalPaymentMethod,
            transactionId,
            amount,
            currency: country === 'India' ? 'INR' : country === 'Indonesia' ? 'IDR' : 'USD',
            paymentScreenshot,
            registrationCategory,
            isScisMember,
            scisMembershipId,
            paymentStatus: 'pending'
        });

        await listenerRegistration.save();

        console.log('✅ Listener registration saved:', {
            id: listenerRegistration._id,
            email: listenerRegistration.email,
            registrationCategory: listenerRegistration.registrationCategory
        });

        return res.status(201).json({
            success: true,
            message: 'Listener registration submitted successfully. Please wait for admin verification.',
            registration: listenerRegistration
        });

    } catch (error) {
        console.error('❌ Listener registration error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit listener registration',
            error: error.message
        });
    }
});

// Get my listener registration
router.get('/my-listener-registration', verifyJWT, async (req, res) => {
    try {
        const userId = req.user.userId;

        const registration = await ListenerRegistration.findOne({ userId })
            .sort({ createdAt: -1 });

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'No listener registration found'
            });
        }

        return res.status(200).json({
            success: true,
            registration
        });

    } catch (error) {
        console.error('Get listener registration error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch listener registration',
            error: error.message
        });
    }
});

// Admin: Get all listener registrations
router.get('/admin/all-listeners', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        const { status, search } = req.query;

        let query = {};

        if (status && status !== 'all') {
            query.paymentStatus = status;
        }

        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { registrationNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const registrations = await ListenerRegistration.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        const stats = {
            total: await ListenerRegistration.countDocuments(),
            pending: await ListenerRegistration.countDocuments({ paymentStatus: 'pending' }),
            verified: await ListenerRegistration.countDocuments({ paymentStatus: 'verified' }),
            rejected: await ListenerRegistration.countDocuments({ paymentStatus: 'rejected' })
        };

        return res.status(200).json({
            success: true,
            registrations,
            stats
        });

    } catch (error) {
        console.error('Get all listeners error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch listener registrations',
            error: error.message
        });
    }
});

// Admin: Get all pending listener registrations
router.get('/admin/pending', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        console.log('📋 Admin fetching pending listener registrations');

        const registrations = await ListenerRegistration.find({
            paymentStatus: 'pending'
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            registrations,
            count: registrations.length
        });

    } catch (error) {
        console.error('❌ Get pending listeners error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch pending listener registrations',
            error: error.message
        });
    }
});

// Admin: Get all listener registrations with optional status filter
router.get('/admin/all', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.query;

        console.log('📋 Admin fetching listener registrations:', { status: status || 'all' });

        let query = {};
        if (status && status !== '') {
            query.paymentStatus = status;
        }

        const registrations = await ListenerRegistration.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            registrations,
            count: registrations.length
        });

    } catch (error) {
        console.error('❌ Get all listeners error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch listener registrations',
            error: error.message
        });
    }
});

// Admin: Verify listener payment
router.put('/admin/verify/:id', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { verificationNotes } = req.body;

        console.log('✅ Verifying listener registration:', id);

        const registration = await ListenerRegistration.findById(id);

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Listener registration not found'
            });
        }

        registration.paymentStatus = 'verified';
        registration.verifiedBy = req.user.userId;
        registration.verifiedByName = req.user.username || 'Admin';
        registration.verifiedByEmail = req.user.email;
        registration.verifiedAt = new Date();
        registration.verificationNotes = verificationNotes || 'Payment verified';

        await registration.save();

        console.log('✅ Listener registration verified successfully:', registration._id);

        // Send confirmation email to listener
        try {
            await sendListenerPaymentVerificationEmail({
                name: registration.name,
                email: registration.email,
                institution: registration.institution,
                address: registration.address,
                country: registration.country,
                registrationCategory: registration.registrationCategory,
                amount: registration.amount,
                currency: registration.currency,
                isScisMember: registration.isScisMember,
                scisMembershipId: registration.scisMembershipId
            });
            console.log('📧 Verification confirmation email sent to:', registration.email);
        } catch (emailError) {
            console.error('⚠️ Error sending verification email:', emailError.message);
            // Don't fail the verification if email fails - just log it
        }

        return res.status(200).json({
            success: true,
            message: 'Listener registration verified successfully',
            registration
        });

    } catch (error) {
        console.error('❌ Verify listener error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify listener registration',
            error: error.message
        });
    }
});

// Admin: Reject listener payment
router.put('/admin/reject/:id', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        console.log('❌ Rejecting listener registration:', id);

        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const registration = await ListenerRegistration.findById(id);

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Listener registration not found'
            });
        }

        // Store registration details before deletion for email
        const registrationDetails = {
            email: registration.email,
            name: registration.name,
            institution: registration.institution,
            registrationCategory: registration.registrationCategory,
            amount: registration.amount,
            currency: registration.currency,
            transactionId: registration.transactionId,
            rejectionReason
        };

        // Delete the registration from database
        await ListenerRegistration.findByIdAndDelete(id);

        // Send rejection email to listener
        try {
            const { sendPaymentRejectionEmail } = await import('../utils/emailService.js');
            await sendPaymentRejectionEmail({
                authorEmail: registrationDetails.email,
                authorName: registrationDetails.name,
                institution: registrationDetails.institution,
                registrationCategory: registrationDetails.registrationCategory,
                rejectionReason: registrationDetails.rejectionReason,
                amount: registrationDetails.amount,
                currency: registrationDetails.currency,
                transactionId: registrationDetails.transactionId,
                registrationType: 'listener'
            });
            console.log('✅ Payment rejection email sent to listener:', registrationDetails.email);
        } catch (emailError) {
            console.error('⚠️ Failed to send rejection email:', emailError);
            // Don't fail the rejection if email fails
        }

        console.log('✅ Listener registration rejected and deleted successfully:', id);

        return res.status(200).json({
            success: true,
            message: 'Listener registration rejected and removed. User has been notified to resubmit payment.',
            deletedRegistration: {
                email: registrationDetails.email,
                name: registrationDetails.name,
                rejectionReason: registrationDetails.rejectionReason
            }
        });

    } catch (error) {
        console.error('❌ Reject listener error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to reject listener registration',
            error: error.message
        });
    }
});

// Admin: Verify listener payment (legacy endpoint - for backward compatibility)
router.put('/admin/verify-listener/:id', verifyJWT, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, rejectionReason } = req.body;

        const registration = await ListenerRegistration.findById(id);

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Listener registration not found'
            });
        }

        registration.paymentStatus = status;
        registration.verifiedBy = req.user.userId;
        registration.verifiedByName = req.user.username;
        registration.verifiedByEmail = req.user.email;
        registration.verifiedAt = new Date();
        registration.verificationNotes = notes;

        if (status === 'rejected') {
            registration.rejectionReason = rejectionReason;
        }

        await registration.save();

        // TODO: Send email notification to user

        return res.status(200).json({
            success: true,
            message: `Listener registration ${status} successfully`,
            registration
        });

    } catch (error) {
        console.error('Verify listener error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify listener registration',
            error: error.message
        });
    }
});

export default router;
