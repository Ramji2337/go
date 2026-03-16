import mongoose from 'mongoose';

const reviewerAssignmentSchema = new mongoose.Schema({
    paperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaperSubmission',
        required: true
    },
    submissionId: {
        type: String,
        required: true
    },
    reviewerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reviewerEmail: {
        type: String,
        required: true
    },
    reviewerName: {
        type: String,
        required: true
    },
    paperTitle: {
        type: String,
        required: true
    },
    abstract: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected', 'Review Submitted'],
        default: 'Pending'
    },
    rejectionReason: {
        type: String,
        default: null
    },
    alternativeReviewerEmail: {
        type: String,
        default: null
    },
    alternativeReviewerName: {
        type: String,
        default: null
    },
    acceptanceToken: {
        type: String,
        unique: true,
        sparse: true
    },
    acceptanceTokenExpires: Date,
    acceptedAt: Date,
    rejectedAt: Date,
    respondedAt: Date,
    reviewDeadline: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export const ReviewerAssignment = mongoose.model('ReviewerAssignment', reviewerAssignmentSchema);
