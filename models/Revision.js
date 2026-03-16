import mongoose from 'mongoose';

const revisionSchema = new mongoose.Schema({
  submissionId: {
    type: String,
    required: true
    // Removed unique: true to allow multiple revisions per submission
  },
  revisionNumber: {
    type: Number,
    default: 1,  // 1st revision, 2nd revision, etc.
    required: true
  },
  paperId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaperSubmission',
    required: true
  },
  authorEmail: {
    type: String,
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  editorEmail: {
    type: String,
    required: true
  },
  editorName: {
    type: String,
    required: true
  },
  revisionRequestedAt: {
    type: Date,
    default: Date.now
  },
  revisionDeadline: {
    type: Date,
    required: true
  },
  revisionStatus: {
    type: String,
    enum: ['Pending', 'Submitted', 'Resubmitted', 'Accepted', 'Rejected'],
    default: 'Pending'
  },
  // Comments from all three reviewers
  reviewerComments: [{
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewerName: String,
    reviewerEmail: String,
    comments: String,
    strengths: String,
    weaknesses: String,
    overallRating: Number,
    noveltyRating: Number,
    qualityRating: Number,
    clarityRating: Number,
    recommendation: String
  }],
  // Editor's revision message/feedback
  revisionMessage: String,
  
  // Revised paper upload
  revisedPdfUrl: String, // Cloudinary URL for revised paper
  revisedPdfPublicId: String, // Cloudinary public ID for revised paper
  revisedPdfBase64: String, // Legacy: kept for backward compatibility
  revisedPdfFileName: String,
  revisedPaperSubmittedAt: Date,
  
  // THREE SEPARATE PDFs FOR REVISION
  cleanPdfUrl: String, // Final corrected paper (not visible to reviewers)
  cleanPdfPublicId: String,
  cleanPdfFileName: String,
  
  highlightedPdfUrl: String, // Shows all corrections (visible to reviewers)
  highlightedPdfPublicId: String,
  highlightedPdfFileName: String,
  
  responsePdfUrl: String, // Explains what corrections were made
  responsePdfPublicId: String,
  responsePdfFileName: String,
  
  // Response to revision
  authorResponse: String, // Author's response to revision requests
  authorResponseSubmittedAt: Date,
  
  // Final outcome
  finalOutcome: {
    type: String,
    enum: ['Accepted', 'Rejected', 'Pending', 'Under Review'],
    default: 'Pending'
  },
  
  // Revision tracking
  revisionRound: {
    type: Number,
    default: 1
  }
}, { timestamps: true });

// Compound index to support multiple revisions per submission
revisionSchema.index({ submissionId: 1, revisionNumber: 1 }, { unique: true });

export const Revision = mongoose.model('Revision', revisionSchema);
