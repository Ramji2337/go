import { PaperSubmission } from '../models/Paper.js';

// Generate submission ID based on category
export const generateSubmissionId = async (category) => {
    const prefix = category.split(' ')[0].substring(0, 2).toUpperCase();

    // Find the highest existing ID for this category from the single collection
    const highest = await PaperSubmission.findOne(
        { submissionId: new RegExp(`^${prefix}\\d{3}$`) },
        { submissionId: 1 }
    ).sort({ submissionId: -1 });

    let nextNum = 1;

    if (highest?.submissionId) {
        const highestNum = parseInt(highest.submissionId.substring(2));
        nextNum = highestNum + 1;
    }

    const paddedNum = nextNum.toString().padStart(3, '0');
    const newId = `${prefix}${paddedNum}`;

    // Check if this ID already exists
    const exists = await PaperSubmission.findOne({ submissionId: newId });

    if (exists) {
        console.log(`ID ${newId} already exists, incrementing number...`);
        return generateSubmissionIdWithNum(category, nextNum + 1);
    }

    return newId;
};

// Helper function to generate ID with a specific number
const generateSubmissionIdWithNum = async (category, num) => {
    const prefix = category.split(' ')[0].substring(0, 2).toUpperCase();
    const paddedNum = num.toString().padStart(3, '0');
    const newId = `${prefix}${paddedNum}`;

    const exists = await PaperSubmission.findOne({ submissionId: newId });

    if (exists) {
        console.log(`ID ${newId} already exists, incrementing number...`);
        return generateSubmissionIdWithNum(category, num + 1);
    }

    return newId;
};


// Generate booking ID
export const generateBookingId = () => {
    const timestamp = Date.now().toString().substring(6);
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BK${timestamp}${randomNum}`;
};

// Generate random password
export const generateRandomPassword = (length = 10) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

// Sanitize filename for Cloudinary
export const sanitizeFilename = (filename) => {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .toLowerCase();
};

// Extract email username (before @)
export const getEmailUsername = (email) => {
    return email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
};

// Format date for display
export const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

// Calculate days remaining
export const daysRemaining = (targetDate) => {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
