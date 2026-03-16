import mongoose from 'mongoose';

const paperSubmissionSchema = new mongoose.Schema({
  submissionId: {
    type: String,
    unique: true,
    required: true
  },
  paperTitle: {
    type: String,
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  abstract: {
    type: String,
    required: false,
    default: null
  },
  topic: String,
  // PDF stored as URL from Cloudinary
  pdfUrl: {
    type: String, // Cloudinary secure URL
    required: false
  },
  // Cloudinary public ID for deletion/management
  pdfPublicId: {
    type: String,
    required: false
  },
  // Legacy: PDF stored as base64 string in MongoDB (kept for backward compatibility)
  pdfBase64: {
    type: String, // Base64 encoded PDF data
    required: false
  },
  // Original filename for reference
  pdfFileName: {
    type: String,
    required: false
  },
  // Abstract file URL (optional, separate from main PDF)
  abstractFileUrl: String,
  // Status workflow
  status: {
    type: String,
    enum: [
      'Submitted',
      'Editor Assigned',
      'Under Review',
      'Review Received',
      'Revision Required',
      'Revised Submitted',
      'Conditionally Accept',
      'Accepted',
      'Rejected',
      'Published'
    ],
    default: 'Submitted'
  },
  // Editor assignment
  assignedEditor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Reviewer assignments with deadline tracking
  reviewAssignments: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deadline: Date,
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Rejected', 'Submitted', 'Overdue', 'Review Submitted'],
      default: 'Pending'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: Date,  // When reviewer accepted/rejected
    emailSent: {
      type: Boolean,
      default: false
    },
    emailResent: {
      type: Boolean,
      default: false
    },
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    }
  }],
  // Reviewer assignments (legacy)
  assignedReviewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Final decision
  finalDecision: {
    type: String,
    enum: ['Accept', 'Conditionally Accept', 'Revise & Resubmit', 'Reject', null],
    default: null
  },
  editorComments: String,
  editorCorrections: String,
  // Revision tracking
  revisionCount: {
    type: Number,
    default: 0
  },
  // Track revision requests from editor (can be multiple)
  revisionRequests: [{
    revisionNumber: Number, // 1st revision, 2nd revision, etc
    requestedAt: {
      type: Date,
      default: Date.now
    },
    editorComments: String, // Comments for this specific revision request
    deadline: Date,
    status: {
      type: String,
      enum: ['Pending', 'Submitted', 'Overdue'],
      default: 'Pending'
    },
    submittedAt: Date, // When author submitted the revision
    pdfUrl: String, // Cloudinary URL for revised PDF
    pdfPublicId: String,
    pdfFileName: String
  }],
  // Paper status collection
  collectionStatus: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'NeedsImprovement'],
    default: 'Pending'
  },
  // Track if this was submitted as an "additional" paper (formerly MultiplePaperSubmission)
  isMultiple: {
    type: Boolean,
    default: false
  },
  versions: [{
    version: Number,
    pdfUrl: String, // Cloudinary URL for this version
    pdfPublicId: String, // Cloudinary public ID for this version
    pdfBase64: String, // Legacy: kept for backward compatibility
    pdfFileName: String,
    submittedAt: Date
  }]
}, { timestamps: true });

export const PaperSubmission = mongoose.model('PaperSubmission', paperSubmissionSchema);