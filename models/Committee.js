import mongoose from 'mongoose';

const committeeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        required: true,
        enum: [
            'Conference Chair',
            'Conference Co-Chair',
            'Organizing Chair',
            'Technical Program Chair',
            'Publication Chair',
            'Publicity Chair',
            'Local Arrangement Chair',
            'Advisory Board',
            'Conference Coordinators',
            'Committee Members'
        ]
    },
    affiliation: {
        type: String,
        required: true,
        trim: true
    },
    country: {
        type: String,
        trim: true
    },
    designation: {
        type: String,
        trim: true
    },
    image: {
        type: String,
        default: '/placeholder.svg?height=300&width=300'
    },
    links: {
        email: {
            type: String,
            trim: true
        },
        website: {
            type: String,
            trim: true
        },
        linkedin: {
            type: String,
            trim: true
        },
        twitter: {
            type: String,
            trim: true
        }
    },
    order: {
        type: Number,
        default: 0
    },
    active: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient queries
committeeSchema.index({ role: 1, order: 1 });
committeeSchema.index({ active: 1 });

// Pre-save middleware to update timestamp
committeeSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const Committee = mongoose.model('Committee', committeeSchema);

export default Committee;
