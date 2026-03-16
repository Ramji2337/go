import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Connect to cyber database (secondary database for membership data)
// Only attempt connection if CYBER_MONGODB_URI is provided
const cyberUri = 'mongodb+srv://Societycis:Societyforcis2025@cluster0.stegtum.mongodb.net/cyber?retryWrites=true&w=majority&appName=Cluster0';

let cyberConnection = null;
let Membership = null;

if (cyberUri) {
    try {
        cyberConnection = mongoose.createConnection(cyberUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        cyberConnection.on('connected', () => {
            console.log('✅ Connected to cyber database for membership');
        });

        cyberConnection.on('error', (err) => {
            console.error('❌ Cyber database connection error:', err.message);
            // Don't exit process, just leave Membership as null
            Membership = null;
        });
    } catch (err) {
        console.error('❌ Error creating cyber database connection:', err.message);
    }
} else {
    console.warn('⚠️  CYBER_MONGODB_URI not found in .env. Membership features will be limited.');
}

// Define Membership schema to match existing data structure in cyber database
const membershipSchema = new mongoose.Schema({
    title: String,
    firstName: String,
    lastName: String,
    email: String,
    mobile: String,
    currentPosition: String,
    institute: String,
    department: String,
    organisation: String,
    address: String,
    town: String,
    postcode: String,
    state: String,
    country: String,
    status: String,
    linkedin: String,
    orcid: String,
    researchGate: String,
    membershipType: String,
    interests: [String],
    experience: String,
    paymentStatus: String,
    membershipFee: Number,
    paymentVerificationId: mongoose.Schema.Types.Mixed,
    profilePhoto: String,
    membershipId: String,
    issueDate: Date,
    expiryDate: Date,
    active: Boolean,
    isAdminApproved: Boolean,
    approvedBy: mongoose.Schema.Types.Mixed,
    approvedAt: Date,
    adminRemarks: String,
    userId: mongoose.Schema.Types.Mixed
}, {
    timestamps: true,
    collection: 'memberships'
});

// Create Membership model if connection exists
if (cyberConnection) {
    Membership = cyberConnection.model('Membership', membershipSchema);
}

// Helper to check if Membership is available
const checkMembershipAvailable = (res) => {
    if (!Membership) {
        res.json({
            success: true,
            isMember: false,
            message: 'Membership check is currently disabled (database not connected)'
        });
        return false;
    }
    return true;
};

// Route to check SCIS membership status with admin approval
router.get('/check-membership', authMiddleware, async (req, res) => {
    try {
        if (!checkMembershipAvailable(res)) return;

        const email = req.user.email;
        console.log('Checking membership for email:', email);

        const membership = await Membership.findOne({
            email: email.toLowerCase(),
            membershipId: { $exists: true, $ne: null, $ne: '' },
            isAdminApproved: true,
            active: true,
            paymentStatus: 'completed'
        });

        console.log('Membership found:', membership ? 'Yes' : 'No');

        if (!membership) {
            return res.json({
                success: true,
                isMember: false,
                membershipType: null,
                status: null,
                membershipId: null
            });
        }

        res.json({
            success: true,
            isMember: true,
            membershipType: membership.membershipType,
            status: membership.status,
            membershipId: membership.membershipId,
            currentPosition: membership.currentPosition,
            experience: membership.experience,
            approvedAt: membership.approvedAt
        });

    } catch (error) {
        console.error('Error checking membership:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check membership status',
            details: error.message
        });
    }
});

// Route to get registration fee based on user's membership status
router.get('/get-registration-fee', authMiddleware, async (req, res) => {
    try {
        const email = req.user.email;
        const { participantType, isInternational } = req.query;

        console.log('Getting registration fee for:', email, participantType, isInternational);

        let isSCISMember = false;
        let membershipData = null;

        if (Membership) {
            membershipData = await Membership.findOne({
                email: email.toLowerCase(),
                membershipId: { $exists: true, $ne: null, $ne: '' },
                isAdminApproved: true,
                active: true,
                paymentStatus: 'completed'
            });
            isSCISMember = !!membershipData;
        }

        console.log('Is SCIS Member:', isSCISMember);

        // Fee structure
        const feeStructure = {
            indian: {
                student: { scis: 4500, nonScis: 5850 },
                faculty: { scis: 6750, nonScis: 7500 },
                scholar: { scis: 6750, nonScis: 7500 },
                listener: { scis: 2500, nonScis: 3500 }
            },
            foreign: {
                author: { scis: 300, nonScis: 350 },
                listener: { scis: 100, nonScis: 150 }
            },
            indonesian: {
                author: { scis: 1700000, nonScis: 2600000 },
                listener: { scis: 1200000, nonScis: 1500000 }
            }
        };

        let fee = 0;
        let currency = 'INR';
        let category = '';
        let membershipDiscount = 0;

        if (isInternational === 'indonesian') {
            currency = 'IDR';
            if (participantType === 'author') {
                const nonMemberFee = feeStructure.indonesian.author.nonScis;
                const memberFee = feeStructure.indonesian.author.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indonesian Author';
            } else {
                const nonMemberFee = feeStructure.indonesian.listener.nonScis;
                const memberFee = feeStructure.indonesian.listener.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indonesian Listener';
            }
        } else if (isInternational === 'true') {
            currency = 'USD';
            if (participantType === 'author') {
                const nonMemberFee = feeStructure.foreign.author.nonScis;
                const memberFee = feeStructure.foreign.author.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Foreign Author';
            } else {
                const nonMemberFee = feeStructure.foreign.listener.nonScis;
                const memberFee = feeStructure.foreign.listener.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Foreign Listener';
            }
        } else {
            // Indian participant
            if (participantType === 'student') {
                const nonMemberFee = feeStructure.indian.student.nonScis;
                const memberFee = feeStructure.indian.student.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indian Student';
            } else if (participantType === 'faculty') {
                const nonMemberFee = feeStructure.indian.faculty.nonScis;
                const memberFee = feeStructure.indian.faculty.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indian Faculty';
            } else if (participantType === 'scholar') {
                const nonMemberFee = feeStructure.indian.scholar.nonScis;
                const memberFee = feeStructure.indian.scholar.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indian Research Scholar';
            } else {
                const nonMemberFee = feeStructure.indian.listener.nonScis;
                const memberFee = feeStructure.indian.listener.scis;
                fee = isSCISMember ? memberFee : nonMemberFee;
                membershipDiscount = nonMemberFee - memberFee;
                category = 'Indian Listener';
            }
        }

        res.json({
            success: true,
            fee,
            currency,
            category,
            isSCISMember,
            membershipType: membershipData?.membershipType || null,
            membershipId: membershipData?.membershipId || null,
            membershipDiscount: isSCISMember ? membershipDiscount : 0
        });

    } catch (error) {
        console.error('Error calculating registration fee:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate registration fee',
            details: error.message
        });
    }
});

// Admin route to check membership for any user by email
router.post('/check-user-membership', authMiddleware, async (req, res) => {
    try {
        if (!checkMembershipAvailable(res)) return;

        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        console.log('Admin checking membership for email:', email);

        const membership = await Membership.findOne({
            email: email.toLowerCase(),
            membershipId: { $exists: true, $ne: null, $ne: '' },
            isAdminApproved: true,
            active: true,
            paymentStatus: 'completed'
        });

        const isMember = !!membership;
        console.log('Membership found for', email, ':', isMember);

        res.json({
            success: true,
            isMember,
            membershipType: membership?.membershipType || null,
            membershipId: membership?.membershipId || null,
            status: membership?.status || null
        });

    } catch (error) {
        console.error('Error checking user membership:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check membership status',
            details: error.message
        });
    }
});

export default router;
