import mongoose from 'mongoose';

const supportMessageSchema = new mongoose.Schema(
    {
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        authorEmail: {
            type: String,
            required: true,
            index: true
        },
        authorName: String,
        messages: [
            {
                sender: {
                    type: String,
                    enum: ['Author', 'Admin'],
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
                },
                isReadByAuthor: {
                    type: Boolean,
                    default: false
                },
                isReadByAdmin: {
                    type: Boolean,
                    default: false
                }
            }
        ],
        lastMessageAt: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['Open', 'Replied', 'Closed'],
            default: 'Open'
        }
    },
    { timestamps: true }
);

export const SupportMessage = mongoose.model('SupportMessage', supportMessageSchema);
