import mongoose from 'mongoose';

const reReviewSchema = new mongoose.Schema({
    paperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaperSubmission',
        required: true
    },
    submissionId: {
        type: String,
        required: true
    },
    revisionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Revision'
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
    // Re-review details (Round 2)
    recommendation: {
        type: String,
        enum: ['Accept', 'Reject', 'Major Revision', 'Minor Revision'],
        required: true
    },
    overallRating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    noveltyRating: {
        type: Number,
        min: 1,
        max: 5
    },
    qualityRating: {
        type: Number,
        min: 1,
        max: 5
    },
    clarityRating: {
        type: Number,
        min: 1,
        max: 5
    },
    // Comments from reviewer
    commentsToEditor: {
        type: String,
        default: ''
    },
    commentsToReviewer: {
        type: String,
        default: ''
    },
    strengths: {
        type: String,
        default: ''
    },
    weaknesses: {
        type: String,
        default: ''
    },
    // Submission tracking
    submittedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // Status tracking
    status: {
        type: String,
        enum: ['Submitted', 'Reviewed', 'Pending'],
        default: 'Submitted'
    },
    reviewRound: {
        type: Number,
        default: 2
    }
}, { timestamps: true });

export const ReReview = mongoose.model('ReReview', reReviewSchema);
