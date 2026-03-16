import mongoose from 'mongoose';

const committeeMemberSchema = new mongoose.Schema({
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
    email: String,
    website: String,
    linkedin: String,
    twitter: String
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

committeeMemberSchema.index({ role: 1, order: 1 });

export default mongoose.model('CommitteeMember', committeeMemberSchema);
