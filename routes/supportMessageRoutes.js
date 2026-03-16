import express from 'express';
import {
    getMySupportMessages,
    sendSupportMessage,
    getAllSupportThreads
} from '../controllers/supportMessageController.js';
import { verifyJWT } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roleCheck.js';

const router = express.Router();

// All support routes require authentication
router.use(verifyJWT);

// Author: Get/Create support thread
router.get('/my-messages', getMySupportMessages);

// Author/Admin: Send message
router.post('/send', sendSupportMessage);

// Admin: Get all threads
router.get('/all-threads', requireAdmin, getAllSupportThreads);

export default router;
