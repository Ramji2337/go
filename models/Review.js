import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    paper: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaperSubmission',
        required: true
    },
    reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Rating criteria
    ratings: {
        technicalQuality: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        significance: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        presentation: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        relevance: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        originality: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        adequacyOfCitations: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        },
        overall: {
            type: String,
            enum: ['Excellent', 'Good', 'Fair', 'Poor']
        }
    },
    // Additional questions
    additionalQuestions: {
        suggestOwnReferences: Boolean,
        recommendForBestPaperAward: Boolean,
        suggestAnotherJournal: Boolean,
        willingToReviewRevisions: Boolean
    },
    // Recommendation
    recommendation: {
        type: String,
        enum: ['Accept', 'Conditionally Accept', 'Revise & Resubmit', 'Reject'],
        required: true
    },
    // Comments
    confidentialCommentsToEditor: String,
    commentsToAuthor: String,
    // Review file uploads (Cloudinary URLs)
    reviewFileUrls: [{
        url: String,
        publicId: String,
        filename: String
    }],
    // Review status
    status: {
        type: String,
        enum: ['Pending', 'Submitted'],
        default: 'Pending'
    }
}, { timestamps: true });

export const Review = mongoose.model('Review', reviewSchema);
