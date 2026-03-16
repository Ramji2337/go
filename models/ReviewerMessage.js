import mongoose from 'mongoose';

const reviewerMessageSchema = new mongoose.Schema(
    {
        submissionId: {
            type: String,
            required: true
        },
        reviewId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReviewerReview',
            required: false
        },
        reviewerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        editorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        authorId: {
            type: String,  
            required: true
        },
        conversation: [
            {
                sender: {
                    type: String,
                    enum: ['editor', 'reviewer', 'author'],
                    required: true
                },
                senderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true
                },
                senderName: String,
                senderEmail: String,
                message: {
                    type: String,
                    required: true
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        editorReviewerConversation: {
            type: Boolean,
            default: false
        },
        editorAuthorConversation: {
            type: Boolean,
            default: false
        },
   
        lastMessageAt: {
            type: Date,
            default: Date.now
        },

        status: {
            type: String,
            enum: ['active', 'closed'],
            default: 'active'
        }
    },
    { timestamps: true }
);


export const ReviewerMessage = mongoose.model('ReviewerMessage', reviewerMessageSchema);
