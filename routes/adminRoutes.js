import express from 'express';
import {
    createEditor,
    getAllEditors,
    assignEditor,
    reassignEditor,
    getAllUsers,
    getDashboardStats,
    deleteUser,
    sendMessageToEditor,
    getConferenceSelectedUsers,
    getAllPdfsAdmin,
    deletePdfAdmin,
    sendSelectedUserEmail
} from '../controllers/adminController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleCheck.js';

const router = express.Router();

// Basic authentication for all admin routes, roles checked per route below
router.use(verifyJWT);

// Editor management
router.post('/editors', requireAdmin, createEditor);
router.get('/editors', requireAdmin, getAllEditors);
router.post('/editors/message', requireAdmin, sendMessageToEditor);

// Paper assignment
router.post('/assign-editor', requireAdmin, assignEditor);
router.post('/reassign-editor', requireAdmin, reassignEditor);

// User management
router.get('/users', requireAdmin, getAllUsers);
router.delete('/users/:userId', requireAdmin, deleteUser);

// Dashboard statistics
router.get('/dashboard-stats', requireAdmin, getDashboardStats);

// Conference selected users (Accessible by Editor and Admin)
import { requireEditor } from '../middleware/roleCheck.js';
router.get('/selected-users', requireEditor, getConferenceSelectedUsers);
router.post('/selected-users/send-email', requireAdmin, sendSelectedUserEmail);

// PDF Management (admin only)
router.get('/pdfs', requireAdmin, getAllPdfsAdmin);
router.delete('/pdfs', requireAdmin, deletePdfAdmin);

// Note: Admin submitted papers management routes removed as multi-submission is now handled directly by authors.


export default router;
