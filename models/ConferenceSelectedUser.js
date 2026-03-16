import mongoose from 'mongoose';

const conferenceSelectedUserSchema = new mongoose.Schema({
    authorEmail: {
        type: String,
        required: true,
        index: true
    },
    authorName: {
        type: String,
        required: true
    },
    paperTitle: {
        type: String,
        required: true
    },
    submissionId: {
        type: String,
        required: true,
        unique: true
    },
    paperUrl: {
        type: String,
        required: true
    },
    copyrightUrl: {
        type: String,
        required: true
    },
    selectionDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        default: 'Confirmed'
    },
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentDoneFinalUser'
    },
    registrationNumber: String,
    category: String,
    abstract: String,
    editorEmail: String,
    reviewers: [String],
    revisionRounds: {
        type: Number,
        default: 0
    },
    finalDocUrl: String,
    finalDocPublicId: String,
    finalDocSubmittedAt: Date,
    paperSubmittedAt: Date,
    copyrightSubmittedAt: Date
}, { timestamps: true });

const ConferenceSelectedUser = mongoose.model('ConferenceSelectedUser', conferenceSelectedUserSchema);

export default ConferenceSelectedUser;
