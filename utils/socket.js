import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            credentials: true
        }
    });

    // Authentication middleware
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.headers.cookie?.match(/token=([^;]+)/)?.[1];
            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (error) {
            console.error('Socket authentication error:', error);
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.id}, Role: ${socket.user.role}`);

        // Join role-based rooms
        socket.join(`role:${socket.user.role}`);
        socket.join(`user:${socket.user.id}`);

        // Handle editor joining editor room
        if (socket.user.role === 'Editor') {
            socket.join('editors');
            console.log(`Editor ${socket.user.id} joined editors room`);
        }

        // Handle admin joining admin room
        if (socket.user.role === 'Admin') {
            socket.join('admins');
            console.log(`Admin ${socket.user.id} joined admins room`);
        }

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.id}`);
        });
    });

    return io;
};

// Get io instance
export const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

// Emit events to specific rooms
export const emitToAdmins = (event, data) => {
    if (io) {
        io.to('admins').emit(event, data);
    }
};

export const emitToEditors = (event, data) => {
    if (io) {
        io.to('editors').emit(event, data);
    }
};

export const emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
};

export const emitToAll = (event, data) => {
    if (io) {
        io.emit(event, data);
    }
};
