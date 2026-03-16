import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: function () {
            return !this.isGoogleAuth;
        }
    },
    role: {
        type: String,
        enum: ['Author', 'Reviewer', 'Editor', 'Admin'],
        default: 'Author'
    },
    isGoogleAuth: {
        type: Boolean,
        default: false
    },
    verified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordOTP: String,
    resetPasswordExpiry: Date,
    tempPassword: {
        type: String,
        default: null  // Store the actual temporary password (unhashed) for reviewer credentials email
    },
    country: {
        type: String,
        default: null,  // Will be set during signup or profile update
        trim: true      // Automatically trim whitespace
    },
    userType: {
        type: String,
        enum: ['student', 'faculty', 'scholar'],
        default: null  // Will be set during signup or profile update
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export const User = mongoose.model('User', userSchema);