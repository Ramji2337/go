import { SupportMessage } from '../models/SupportMessage.js';
import { User } from '../models/User.js';
import { emitToUser, emitToAdmins } from '../socket.js';

// Author: Get or Create their support thread
export const getMySupportMessages = async (req, res) => {
    try {
        const authorId = req.user.userId;
        const authorEmail = req.user.email;

        let supportThread = await SupportMessage.findOne({ authorId });

        if (!supportThread) {
            const user = await User.findById(authorId);
            supportThread = await SupportMessage.create({
                authorId,
                authorEmail,
                authorName: user.username || user.email,
                messages: []
            });
        } else {
            // Mark all Admin messages as read when Author fetches them
            let modified = false;
            supportThread.messages.forEach(m => {
                if (m.sender === 'Admin' && !m.isReadByAuthor) {
                    m.isReadByAuthor = true;
                    modified = true;
                }
            });
            if (modified) await supportThread.save();
        }

        const unreadCount = supportThread.messages.filter(m => m.sender === 'Admin' && !m.isReadByAuthor).length;

        return res.status(200).json({
            success: true,
            data: supportThread,
            unreadCount
        });
    } catch (error) {
        console.error('Error fetching support messages:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Author/Admin: Send support message
export const sendSupportMessage = async (req, res) => {
    try {
        const { message, authorId: targetAuthorId } = req.body;
        const senderId = req.user.userId;
        const userRole = req.user.role;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: "Message is empty" });
        }

        let authorId = userRole === 'Admin' ? targetAuthorId : senderId;

        let supportThread = await SupportMessage.findOne({ authorId });
        if (!supportThread && userRole === 'Author') {
            const user = await User.findById(authorId);
            supportThread = new SupportMessage({
                authorId,
                authorEmail: user.email,
                authorName: user.username || user.email,
                messages: []
            });
        }

        if (!supportThread) {
            return res.status(404).json({ success: false, message: "Support thread not found" });
        }

        const sender = await User.findById(senderId);

        supportThread.messages.push({
            sender: userRole === 'Admin' ? 'Admin' : 'Author',
            senderId,
            senderName: sender.username || sender.email,
            message,
            timestamp: new Date()
        });

        supportThread.lastMessageAt = new Date();
        supportThread.status = userRole === 'Admin' ? 'Replied' : 'Open';

        await supportThread.save();

        const newMessage = supportThread.messages[supportThread.messages.length - 1];

        // Emit via socket
        if (userRole === 'Admin') {
            emitToUser(supportThread.authorEmail, 'support:message', {
                message: newMessage,
                unreadCount: supportThread.messages.filter(m => m.sender === 'Admin' && !m.isReadByAuthor).length
            });
        } else {
            emitToAdmins('support:message', {
                authorEmail: supportThread.authorEmail,
                authorName: supportThread.authorName,
                message: newMessage,
                unreadCount: supportThread.messages.filter(m => m.sender === 'Author' && !m.isReadByAdmin).length
            });
        }

        return res.status(200).json({
            success: true,
            message: "Message sent successfully",
            data: supportThread
        });
    } catch (error) {
        console.error('Error sending support message:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending message',
            error: error.message
        });
    }
};

// Admin: Get all support threads
export const getAllSupportThreads = async (req, res) => {
    try {
        const threads = await SupportMessage.find().sort({ lastMessageAt: -1 });
        const threadsWithStats = threads.map(t => {
            const threadObj = t.toObject();
            threadObj.unreadCount = t.messages.filter(m => m.sender === 'Author' && !m.isReadByAdmin).length;
            return threadObj;
        });

        return res.status(200).json({
            success: true,
            count: threads.length,
            data: threadsWithStats,
            totalUnread: threadsWithStats.reduce((acc, t) => acc + t.unreadCount, 0)
        });
    } catch (error) {
        console.error('Error fetching all support threads:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
};
