import { PaperMessage } from '../models/PaperMessage.js';
import { PaperSubmission } from '../models/Paper.js';
import { User } from '../models/User.js';

// Author: Get messages for their paper
export const getPaperMessages = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const authorEmail = req.user.email;

        // Verify the paper belongs to the author — single collection
        const paper = await PaperSubmission.findOne({ submissionId, email: authorEmail });

        if (!paper) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized or paper not found"
            });
        }

        let paperMessage = await PaperMessage.findOne({ submissionId })
            .populate('editorId', 'username email');

        if (!paperMessage) {
            // Create a placeholder if none exists
            paperMessage = await PaperMessage.create({
                submissionId,
                paperId: paper._id,
                authorEmail,
                editorId: paper.assignedEditor,
                messages: []
            });
        }

        return res.status(200).json({
            success: true,
            data: paperMessage
        });
    } catch (error) {
        console.error('Error fetching paper messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Author/Editor/Admin: Send message
export const sendPaperMessage = async (req, res) => {
    try {
        const { submissionId, message } = req.body;
        const userId = req.user.userId;
        const userRole = req.user.role; // Author, Editor, Admin

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: "Message is empty" });
        }

        const paper = await PaperSubmission.findOne({ submissionId });

        if (!paper) {
            return res.status(404).json({ success: false, message: "Paper not found" });
        }

        // Permission check
        if (userRole === 'Author' && paper.email !== req.user.email) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }
        if (userRole === 'Editor' && paper.assignedEditor?.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        let paperMessage = await PaperMessage.findOne({ submissionId });
        if (!paperMessage) {
            paperMessage = new PaperMessage({
                submissionId,
                paperId: paper._id,
                authorEmail: paper.email,
                editorId: paper.assignedEditor,
                messages: []
            });
        }

        const user = await User.findById(userId);

        paperMessage.messages.push({
            sender: userRole === 'Admin' ? 'Admin' : (userRole === 'Editor' ? 'Editor' : 'Author'),
            senderId: userId,
            senderName: user.username || user.email,
            message,
            timestamp: new Date()
        });

        paperMessage.lastMessageAt = new Date();
        // Update editorId in case it was assigned later
        paperMessage.editorId = paper.assignedEditor;

        await paperMessage.save();

        return res.status(200).json({
            success: true,
            message: "Message sent successfully",
            data: paperMessage
        });
    } catch (error) {
        console.error('Error sending paper message:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};
