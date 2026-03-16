import mongoose from 'mongoose';

const paymentRegistrationSchema = new mongoose.Schema({
    // User/Author Information
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

    // Paper Information
    paperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FinalAcceptance',
        required: false
    },
    submissionId: {
        type: String,
        required: false
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
        enum: ['bank-transfer', 'upi', 'bank-account', 'paypal', 'external', 'bank-transfer-upi', 'bank-transfer-bank-account', 'qr-code'],
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

    // Payment Screenshot (Cloudinary URL)
    paymentScreenshot: {
        type: String, // Cloudinary URL
        required: false
    },
    paymentScreenshotPublicId: {
        type: String, // Cloudinary public ID for deletion
        required: false
    },

    // Payment Status
    paymentStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },

    // Admin Verification
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    verifiedAt: {
        type: Date,
        required: false
    },
    verificationNotes: {
        type: String,
        required: false
    },
    rejectionReason: {
        type: String,
        required: false
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

    // Registration Date
    registrationDate: {
        type: Date,
        default: Date.now
    },

    // Timestamps
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
paymentRegistrationSchema.index({ authorEmail: 1, registrationDate: -1 });
paymentRegistrationSchema.index({ paymentStatus: 1 });
paymentRegistrationSchema.index({ submissionId: 1 });
paymentRegistrationSchema.index({ verifiedAt: -1 });

// Pre-save middleware to update timestamp
paymentRegistrationSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const PaymentRegistration = mongoose.model('PaymentRegistration', paymentRegistrationSchema);

export default PaymentRegistration;
