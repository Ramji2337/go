import express from 'express';
import { getPaperMessages, sendPaperMessage } from '../controllers/paperMessageController.js';
import { verifyJWT } from '../middleware/auth.js';

const router = express.Router();

router.get('/:submissionId', verifyJWT, getPaperMessages);
router.post('/send', verifyJWT, sendPaperMessage);

export default router;
