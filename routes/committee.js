import express from 'express';
import Committee from '../models/Committee.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import cloudinary from '../config/cloudinary.js';
import streamifier from 'streamifier';

const router = express.Router();

// PUBLIC ROUTES

// Get all active committee members
router.get('/', async (req, res) => {
    try {
        const { role } = req.query;

        const query = { active: true };
        if (role && role !== 'all') {
            query.role = role;
        }

        const members = await Committee.find(query).sort({ order: 1, createdAt: 1 });

        res.json({
            success: true,
            count: members.length,
            members
        });
    } catch (error) {
        console.error('Error fetching committee members:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch committee members',
            error: error.message
        });
    }
});

// Get single committee member by ID
router.get('/:id', async (req, res) => {
    try {
        const member = await Committee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Committee member not found'
            });
        }

        res.json({
            success: true,
            member
        });
    } catch (error) {
        console.error('Error fetching committee member:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch committee member',
            error: error.message
        });
    }
});

// ADMIN ROUTES

// Get all committee members (including inactive) - Admin only
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const members = await Committee.find().sort({ order: 1, createdAt: 1 });

        res.json({
            success: true,
            count: members.length,
            members
        });
    } catch (error) {
        console.error('Error fetching all committee members:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch committee members',
            error: error.message
        });
    }
});

// Create new committee member - Admin only
router.post('/', authMiddleware, adminMiddleware, uploadImage.single('image'), async (req, res) => {
    try {
        const {
            name,
            role,
            affiliation,
            country,
            designation,
            links,
            order,
            active
        } = req.body;

        // Validation
        if (!name || !role || !affiliation) {
            return res.status(400).json({
                success: false,
                message: 'Name, role, and affiliation are required'
            });
        }

        let imageUrl = '';
        if (req.file) {
            // Upload to Cloudinary from buffer
            const uploadPromise = new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'committee' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
            });
            imageUrl = await uploadPromise;
        }

        const newMember = new Committee({
            name,
            role,
            affiliation,
            country,
            designation,
            image: imageUrl || undefined,
            links: typeof links === 'string' ? JSON.parse(links) : links,
            order: order || 0,
            active: active !== undefined ? active : true
        });

        await newMember.save();

        console.log('✅ Committee member created:', newMember.name);

        res.status(201).json({
            success: true,
            message: 'Committee member created successfully',
            member: newMember
        });
    } catch (error) {
        console.error('Error creating committee member:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create committee member',
            error: error.message
        });
    }
});

// Update committee member - Admin only
router.put('/:id', authMiddleware, adminMiddleware, uploadImage.single('image'), async (req, res) => {
    try {
        const {
            name,
            role,
            affiliation,
            country,
            designation,
            links,
            order,
            active
        } = req.body;

        const member = await Committee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Committee member not found'
            });
        }

        // Handle image upload if provided
        if (req.file) {
            const uploadPromise = new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'committee' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
            });
            member.image = await uploadPromise;
        }

        // Update fields
        if (name) member.name = name;
        if (role) member.role = role;
        if (affiliation) member.affiliation = affiliation;
        if (country !== undefined) member.country = country;
        if (designation !== undefined) member.designation = designation;
        if (links) member.links = typeof links === 'string' ? JSON.parse(links) : links;
        if (order !== undefined) member.order = order;
        if (active !== undefined) member.active = active;

        await member.save();

        console.log('✅ Committee member updated:', member.name);

        res.json({
            success: true,
            message: 'Committee member updated successfully',
            member
        });
    } catch (error) {
        console.error('Error updating committee member:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update committee member',
            error: error.message
        });
    }
});

// Delete committee member - Admin only
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const member = await Committee.findByIdAndDelete(req.params.id);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Committee member not found'
            });
        }

        console.log('✅ Committee member deleted:', member.name);

        res.json({
            success: true,
            message: 'Committee member deleted successfully',
            member
        });
    } catch (error) {
        console.error('Error deleting committee member:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete committee member',
            error: error.message
        });
    }
});

// Toggle active status - Admin only
router.patch('/:id/toggle-active', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const member = await Committee.findById(req.params.id);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Committee member not found'
            });
        }

        member.active = !member.active;
        await member.save();

        console.log(`✅ Committee member ${member.active ? 'activated' : 'deactivated'}:`, member.name);

        res.json({
            success: true,
            message: `Committee member ${member.active ? 'activated' : 'deactivated'} successfully`,
            member
        });
    } catch (error) {
        console.error('Error toggling committee member status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle committee member status',
            error: error.message
        });
    }
});

// Bulk reorder committee members - Admin only
router.post('/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { orders } = req.body; // Array of { id: string, order: number }

        if (!orders || !Array.isArray(orders)) {
            return res.status(400).json({
                success: false,
                message: 'Orders array is required'
            });
        }

        // Bulk update operations
        const bulkOps = orders.map(({ id, order }) => ({
            updateOne: {
                filter: { _id: id },
                update: { $set: { order } }
            }
        }));

        await Committee.bulkWrite(bulkOps);

        console.log('✅ Committee members reordered:', orders.length, 'members');

        res.json({
            success: true,
            message: 'Committee members reordered successfully'
        });
    } catch (error) {
        console.error('Error reordering committee members:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reorder committee members',
            error: error.message
        });
    }
});

export default router;
