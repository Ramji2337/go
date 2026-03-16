import mongoose from 'mongoose';

const revisionReviewSchema = new mongoose.Schema({
  paper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaperSubmission',
    required: true
  },
  submissionId: {
    type: String,
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewerEmail: String,
  reviewerName: String,
  
  // Which revision this review is for
  revisionNumber: {
    type: Number,
    default: 1,  // Revision 1, 2, 3, etc.
    required: true
  },
  
  // Which round within this revision
  round: {
    type: Number,
    default: 2,  // For Revision 1, this is Round 2; for Revision 2, this is Round 3
    required: true
  },
  
  // PDF being reviewed in this revision round
  reviewedPdfUrl: String,
  
  // Review details
  comments: String,
  commentsToReviewer: String,
  commentsToEditor: String,
  strengths: String,
  weaknesses: String,
  overallRating: {
    type: Number,
    min: 1,
    max: 5
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
  recommendation: String,
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Submitted'],
    default: 'Draft'
  },
  
  // Timestamps
  submittedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for quick lookups
revisionReviewSchema.index({ paper: 1, reviewer: 1, revisionNumber: 1 });
revisionReviewSchema.index({ submissionId: 1, revisionNumber: 1 });

export const RevisionReview = mongoose.model('RevisionReview', revisionReviewSchema);
