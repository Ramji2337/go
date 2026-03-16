import mongoose from 'mongoose';

const finalAcceptanceSchema = new mongoose.Schema({
   
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


    revisionPdfs: {
        cleanPdfUrl: String,        // Final corrected paper (not shown to reviewers)
        cleanPdfPublicId: String,
        cleanPdfFileName: String,

        highlightedPdfUrl: String,  
        highlightedPdfPublicId: String,
        highlightedPdfFileName: String,

        responsePdfUrl: String,     // Explains corrections made
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
        reviewedPdfUrl: String,      // Which PDF was reviewed in this round
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


    // LEGACY: Old reviewers array (kept for backward compatibility)
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

    // Average Rating (calculated from all reviews)
    averageRating: {
        type: Number,
        default: 0
    },

    // Final Decision Info
    finalDecision: {
        type: String,
        enum: ['Accept', 'Reject', 'Revision Required'],
        default: 'Accept'
    },

    // Editor who made the decision
    editorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    editorEmail: String,

    // Decision Date/Time
    acceptanceDate: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Additional Info
    revisionCount: {
        type: Number,
        default: 0,
        description: 'Number of revisions requested before acceptance'
    },

    // Acceptance Certificate/Number (optional)
    acceptanceCertificateNumber: {
        type: String,
        unique: true,
        sparse: true
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


    // Payment/Registration Status
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'verified'],
        default: 'pending',
        description: 'Payment status for conference registration'
    },
    paymentRegistrationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentRegistration',
        required: false
    },

    // Status
    status: {
        type: String,
        enum: ['Accepted', 'Certificate Generated', 'Published'],
        default: 'Accepted'
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
finalAcceptanceSchema.index({ authorEmail: 1, acceptanceDate: -1 });
finalAcceptanceSchema.index({ category: 1 });
finalAcceptanceSchema.index({ status: 1 });
finalAcceptanceSchema.index({ acceptanceDate: -1 });

// Pre-save middleware to calculate average rating
finalAcceptanceSchema.pre('save', function (next) {
    if (this.reviewers && this.reviewers.length > 0) {
        const ratings = this.reviewers
            .map(r => r.overallRating)
            .filter(r => r !== undefined && r !== null);

        if (ratings.length > 0) {
            this.averageRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2);
        }

        this.totalReviewers = this.reviewers.length;
    }
    next();
});

// Method to generate acceptance certificate number
finalAcceptanceSchema.methods.generateCertificateNumber = function () {
    const year = this.conferenceYear;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.acceptanceCertificateNumber = `ICMBNT-${year}-${timestamp}-${random}`;
    return this.acceptanceCertificateNumber;
};

// Static method to get accepted papers by author
finalAcceptanceSchema.statics.getByAuthorEmail = function (email) {
    return this.find({ authorEmail: email }).sort({ acceptanceDate: -1 });
};

// Static method to get all accepted papers by category
finalAcceptanceSchema.statics.getByCategory = function (category) {
    return this.find({ category }).sort({ acceptanceDate: -1 });
};

// Static method to get accepted papers with average rating above threshold
finalAcceptanceSchema.statics.getHighRatedPapers = function (minRating = 4) {
    return this.find({ averageRating: { $gte: minRating } }).sort({ averageRating: -1 });
};

const FinalAcceptance = mongoose.model('FinalAcceptance', finalAcceptanceSchema);

export default FinalAcceptance;
