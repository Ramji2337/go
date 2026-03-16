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
  reviewerName: {
    type: String,
    required: false
  },
  reviewerEmail: {
    type: String,
    required: false
  },
  
  // MULTI-ROUND REVIEW SUPPORT
  // Indicates which round of review this is (1 = initial, 2 = after revision, etc)
  round: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Review content
  comments: {
    type: String,
    required: true
  },
  commentsToReviewer: {
    type: String,
    default: ''  // Internal comments not sent to author
  },
  commentsToEditor: {
    type: String,
    default: ''  // Comments sent to author in decision email
  },
  strengths: String,
  weaknesses: String,
  
  // Rating system (1-5)
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
  
  // Recommendation
  recommendation: {
    type: String,
    enum: ['Accept', 'Reject', 'Major Revision', 'Minor Revision', 'Conditional Accept'],
    required: true
  },
  
  // PDF reviewed in this round (store separately for each round)
  reviewedPdfUrl: {
    type: String,
    required: false  // URL of the PDF this review is for
  },
  reviewedPdfPublicId: {
    type: String,
    required: false
  },
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Read by Editor'],
    default: 'Submitted'
  },
  
  // Timestamps
  assignedAt: {
    type: Date,
    default: Date.now
  },
  deadline: Date,
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export const ReviewerReview = mongoose.model('ReviewerReview', reviewSchema);
