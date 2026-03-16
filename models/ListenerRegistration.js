import mongoose from 'mongoose';

const listenerRegistrationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    email: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },

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
        enum: ['bank-transfer', 'upi', 'bank-account', 'paypal', 'external'],
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
    paymentScreenshot: {
        type: String,
        required: false
    },

    registrationCategory: {
        type: String,
        enum: [
            'indian-listener',
            'foreign-listener',
            'indonesian-listener'
        ],
        required: true
    },

    // SCIS Membership
    isScisMember: {
        type: Boolean,
        default: false
    },
    scisMembershipId: {
        type: String,
        required: false
    },

    // Payment Status
    paymentStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },

    // Verification Details
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
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
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    rejectedAt: {
        type: Date,
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
        required: false,
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
        default: Date.now
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
listenerRegistrationSchema.index({ email: 1 });
listenerRegistrationSchema.index({ registrationNumber: 1 });
listenerRegistrationSchema.index({ verifiedAt: -1 });
listenerRegistrationSchema.index({ conferenceYear: 1 });
listenerRegistrationSchema.index({ paymentStatus: 1 });

// Pre-save middleware to generate registration number
listenerRegistrationSchema.pre('save', function (next) {
    if (!this.registrationNumber) {
        const year = this.conferenceYear;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.registrationNumber = `ICMBNT${year}-LISTENER-${random}${timestamp.toString().slice(-6)}`;
    }
    this.updatedAt = new Date();
    next();
});

// Method to generate certificate number
listenerRegistrationSchema.methods.generateCertificateNumber = function () {
    if (!this.certificateNumber) {
        const year = this.conferenceYear;
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.certificateNumber = `ICMBNT${year}-CERT-LISTENER-${random}${timestamp.toString().slice(-6)}`;
        this.certificateGenerated = true;
    }
    return this.certificateNumber;
};

// Static method to get all registered listeners for a conference year
listenerRegistrationSchema.statics.getByConferenceYear = function (year) {
    return this.find({ conferenceYear: year }).sort({ verifiedAt: -1 });
};

// Static method to get registered listener by email
listenerRegistrationSchema.statics.getByEmail = function (email) {
    return this.findOne({ email: email });
};

const ListenerRegistration = mongoose.model('ListenerRegistration', listenerRegistrationSchema);

export default ListenerRegistration;
