import mongoose from 'mongoose';

const paymentDoneFinalUserSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    authorEmail: {
        type: String,
        required: true,
        index: true
    },
    authorName: {
        type: String,
        required: true
    },

    paperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FinalAcceptance',
        required: false
    },
    submissionId: {
        type: String,
        required: false,
        index: true
    },
    paperTitle: {
        type: String,
        required: true
    },
    paperUrl: {
        type: String,
        required: false
    },

    // Registration Details
    institution: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },

    // Payment Information
    paymentMethod: {
        type: String,
        enum: ['bank-transfer', 'bank-transfer-upi', 'bank-transfer-bank-account', 'paypal', 'qr-code', 'upi', 'bank-account'],
        required: true
    },
    transactionId: {
        type: String,
        required: false
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },

    // Original Payment Registration Reference
    paymentRegistrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentRegistration',
        required: true
    },

    // Registration Category
    registrationCategory: {
        type: String,
        enum: [
            'indian-student',
            'indian-faculty',
            'indian-scholar',
            'indian-listener',
            'foreign-author',
            'foreign-listener',
            'indonesian-author',
            'indonesian-listener',
            // Legacy values for backward compatibility
            'indian-author'
        ],
        required: true
    },

    // Verification Details
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false  // Made optional, will be set during verification
    },
    verifiedByName: {
        type: String,
        required: false
    },
    verifiedByEmail: {
        type: String,
        required: false
    },
    verifiedAt: {
        type: Date,
        required: false,  // Made optional, will be set during verification
        default: Date.now
    },
    verificationNotes: {
        type: String,
        required: false
    },

    // Conference Details
    conferenceYear: {
        type: Number,
        default: 2026
    },
    conferenceName: {
        type: String,
        default: 'ICMBNT 2026'
    },

    // Registration Number (Auto-generated)
    registrationNumber: {
        type: String,
        unique: true,
        required: false,  // Made optional, will be auto-generated
        sparse: true
    },

    // Certificate Status
    certificateGenerated: {
        type: Boolean,
        default: false
    },
    certificateNumber: {
        type: String,
        unique: true,
        sparse: true
    },

    // Timestamps
    registrationDate: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for efficient queries
paymentDoneFinalUserSchema.index({ verifiedAt: -1 });
paymentDoneFinalUserSchema.index({ conferenceYear: 1 });

// Pre-save middleware to generate registration number
paymentDoneFinalUserSchema.pre('save', function (next) {
    if (!this.registrationNumber) {
        const year = this.conferenceYear;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.registrationNumber = `ICMBNT${year}-REG-${random}${timestamp.toString().slice(-6)}`;
    }
    this.updatedAt = new Date();
    next();
});

// Method to generate certificate number
paymentDoneFinalUserSchema.methods.generateCertificateNumber = function () {
    if (!this.certificateNumber) {
        const year = this.conferenceYear;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.certificateNumber = `ICMBNT${year}-CERT-${random}${timestamp.toString().slice(-6)}`;
        this.certificateGenerated = true;
    }
    return this.certificateNumber;
};

// Static method to get all registered users for a conference year
paymentDoneFinalUserSchema.statics.getByConferenceYear = function (year) {
    return this.find({ conferenceYear: year }).sort({ verifiedAt: -1 });
};

// Static method to get registered user by email
paymentDoneFinalUserSchema.statics.getByEmail = function (email) {
    return this.findOne({ authorEmail: email });
};

export const PaymentDoneFinalUser = mongoose.model('PaymentDoneFinalUser', paymentDoneFinalUserSchema);
