import mongoose from 'mongoose';

const rejectedPaperSchema = new mongoose.Schema({

    paperId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaperSubmission',
        required: true
    },
    submissionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    paperTitle: {
        type: String,
        required: true
    },

    authorName: {
        type: String,
        required: true
    },
    authorEmail: {
        type: String,
        required: true,
        index: true
    },

    // Paper PDF
    pdfUrl: {
        type: String,
        required: true
    },
    pdfPublicId: {
        type: String,
        required: false
    },
    pdfFileName: {
        type: String,
        required: false
    },

    // REVISION PDFS (if paper was revised before rejection)
    revisionPdfs: {
        cleanPdfUrl: String,
        cleanPdfPublicId: String,
        cleanPdfFileName: String,

        highlightedPdfUrl: String,
        highlightedPdfPublicId: String,
        highlightedPdfFileName: String,

        responsePdfUrl: String,
        responsePdfPublicId: String,
        responsePdfFileName: String
    },

    // REVIEWS BY ROUND - Store each review round separately
    reviewsByRound: [{
        round: Number,              // 1, 2, 3, etc.
        reviewerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewerName: String,
        reviewerEmail: String,
        comments: String,
        commentsToReviewer: String,
        commentsToEditor: String,
        strengths: String,
        weaknesses: String,
        overallRating: Number,
        noveltyRating: Number,
        qualityRating: Number,
        clarityRating: Number,
        recommendation: String,
        reviewedPdfUrl: String,
        submittedAt: Date
    }],

    // Category and Topic
    category: {
        type: String,
        required: true
    },
    topic: {
        type: String,
        required: false
    },

    // LEGACY: Old reviewers array
    reviewers: [{
        reviewerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reviewerName: String,
        reviewerEmail: {
            type: String,
            required: true
        },
        overallRating: Number,
        recommendation: String,
        submittedAt: Date
    }],

    // Total Reviewers Count
    totalReviewers: {
        type: Number,
        default: 0
    },

    // Average Rating
    averageRating: {
        type: Number,
        default: 0
    },

    // Rejection Reason
    rejectionReason: {
        type: String,
        required: true,
        enum: [
            'Quality Issues',
            'Out of Scope',
            'Insufficient Novelty',
            'Plagiarism',
            'Methodological Flaws',
            'Inadequate Literature Review',
            'Poor Presentation',
            'Ethical Concerns',
            'Incomplete Work',
            'Other'
        ],
        default: 'Quality Issues'
    },

    // Detailed rejection comments from editor
    rejectionComments: {
        type: String,
        required: true
    },

    // Editor who made the decision
    editorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    editorEmail: String,
    editorName: String,

    // Rejection Date/Time
    rejectionDate: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Additional Info
    revisionCount: {
        type: Number,
        default: 0,
        description: 'Number of revisions attempted before rejection'
    },

    // Conference/Event Info
    conferenceYear: {
        type: Number,
        default: 2026
    },
    conferenceName: {
        type: String,
        default: 'ICMBNT 2026'
    },

    // Additional Metadata
    metadata: {
        originalSubmissionDate: Date,
        firstReviewDate: Date,
        revisionRequestDate: Date,
        lastRevisionDate: Date,
        notes: String
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
rejectedPaperSchema.index({ authorEmail: 1, rejectionDate: -1 });
rejectedPaperSchema.index({ category: 1 });
rejectedPaperSchema.index({ rejectionReason: 1 });
rejectedPaperSchema.index({ rejectionDate: -1 });

// Pre-save middleware to calculate average rating
rejectedPaperSchema.pre('save', function (next) {
    if (this.reviewers && this.reviewers.length > 0) {
        const ratings = this.reviewers
            .map(r => r.overallRating)
            .filter(r => r !== undefined && r !== null);

        if (ratings.length > 0) {
            this.averageRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2);
        }

        this.totalReviewers = this.reviewers.length;
    }
    this.updatedAt = Date.now();
    next();
});

// Static method to get rejected papers by author
rejectedPaperSchema.statics.getByAuthorEmail = function (email) {
    return this.find({ authorEmail: email }).sort({ rejectionDate: -1 });
};

// Static method to get all rejected papers by category
rejectedPaperSchema.statics.getByCategory = function (category) {
    return this.find({ category }).sort({ rejectionDate: -1 });
};

// Static method to get rejected papers by reason
rejectedPaperSchema.statics.getByReason = function (reason) {
    return this.find({ rejectionReason: reason }).sort({ rejectionDate: -1 });
};

// Static method to get rejection statistics
rejectedPaperSchema.statics.getRejectionStats = async function () {
    const stats = await this.aggregate([
        {
            $group: {
                _id: '$rejectionReason',
                count: { $sum: 1 },
                avgRating: { $avg: '$averageRating' }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);
    return stats;
};

const RejectedPaper = mongoose.model('RejectedPaper', rejectedPaperSchema);

export default RejectedPaper;
