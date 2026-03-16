import mongoose from 'mongoose';

const paperMessageSchema = new mongoose.Schema(
    {
        submissionId: {
            type: String,
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
        editorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        messages: [
            {
                sender: {
                    type: String,
                    enum: ['Author', 'Editor', 'Admin'],
                    required: true
                },
                senderId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true
                },
                senderName: String,
                message: {
                    type: String,
                    required: true
                },
                timestamp: {
                    type: Date,
                    default: Date.now
                }
            }
        ],
        lastMessageAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

export const PaperMessage = mongoose.model('PaperMessage', paperMessageSchema);
