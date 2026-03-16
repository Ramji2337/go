import CommitteeMember from '../models/CommitteeMember.js';
import cloudinary from '../config/cloudinary.js';

// Get all committee members
export const getAllMembers = async (req, res) => {
  try {
    const members = await CommitteeMember.find().sort({ order: 1, createdAt: 1 });
    res.status(200).json({
      success: true,
      data: members
    });
  } catch (error) {
    console.error('Error fetching committee members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch committee members',
      error: error.message
    });
  }
};

// Get single committee member by ID
export const getMemberById = async (req, res) => {
  try {
    const member = await CommitteeMember.findById(req.params.id);

    if (!member) {
      return res.status(404).json({
        success: false,
        message: 'Committee member not found'
      });
    }

    res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Error fetching committee member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch committee member',
      error: error.message
    });
  }
};

// Create new committee member (Admin only)
export const createMember = async (req, res) => {
  try {
    const memberData = req.body;

    // Handle image upload if provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'committee_members',
        transformation: [
          { width: 300, height: 300, crop: 'fill' }
        ]
      });
      memberData.image = result.secure_url;
    }

    const newMember = new CommitteeMember(memberData);
    await newMember.save();

    res.status(201).json({
      success: true,
      message: 'Committee member created successfully',
      data: newMember
    });
  } catch (error) {
    console.error('Error creating committee member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create committee member',
      error: error.message
    });
  }
};

// Update committee member (Admin only)
export const updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Handle image upload if provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'committee_members',
        transformation: [
          { width: 300, height: 300, crop: 'fill' }
        ]
      });
      updateData.image = result.secure_url;
    }

    const updatedMember = await CommitteeMember.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedMember) {
      return res.status(404).json({
        success: false,
        message: 'Committee member not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Committee member updated successfully',
      data: updatedMember
    });
  } catch (error) {
    console.error('Error updating committee member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update committee member',
      error: error.message
    });
  }
};

// Delete committee member (Admin only)
export const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedMember = await CommitteeMember.findByIdAndDelete(id);

    if (!deletedMember) {
      return res.status(404).json({
        success: false,
        message: 'Committee member not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Committee member deleted successfully',
      data: deletedMember
    });
  } catch (error) {
    console.error('Error deleting committee member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete committee member',
      error: error.message
    });
  }
};


