import mongoose from 'mongoose';


const membershipSchema = new mongoose.Schema({
    title: String,
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    mobile: String,
    currentPosition: String,
    institute: String,
    department: String,
    organisation: { type: String, required: true },
    address: String,
    town: { type: String, required: true },
    postcode: String,
    state: String,
    country: { type: String, required: true },
    status: { type: String, required: true },
    linkedin: String,
    orcid: String,
    researchGate: String,
    membershipType: {
        type: String,
        required: true,
        enum: ['student-ug', 'student-pg', 'academic', 'industry', 'international']
    },
    interests: [String],
    experience: String,
    paymentStatus: {
        type: String,
        enum: ['pending', 'verified', 'completed', 'rejected'],
        default: 'pending'
    },
    membershipFee: {
        type: Number,
        required: true
    },
    paymentVerificationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentVerification',
        default: null
    },
    profilePhoto: { type: String },
    membershipId: { type: String },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    active: {
        type: Boolean,
        default: false // Default to false until admin approves
    },
    isAdminApproved: {
        type: Boolean,
        default: false
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    adminRemarks: {
        type: String,
        default: ''
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Add a pre-save hook to handle profilePhoto
membershipSchema.pre('save', function (next) {
    if (this.profilePhoto && !this.profilePhoto.startsWith('http')) {
      
    }
    next();
});

export default membershipSchema;
