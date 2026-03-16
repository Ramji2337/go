import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Authentication Middleware for Sockets
    io.use((socket, next) => {
        const tokenToken = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.split('token=')[1]?.split(';')[0];
        
        if (!tokenToken) {
            return next(new Error("Authentication error: No token provided"));
        }

        try {
            const decoded = jwt.verify(tokenToken, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on('connection', (socket) => {
        const email = socket.user.email.toLowerCase();
        console.log(`🔌 Socket Connected: ${email} (${socket.id})`);

        // Join a private room based on user email
        const userRoom = `user:${email}`;
        socket.join(userRoom);
        console.log(`🏠 User ${email} joined room: ${userRoom}`);

        if (socket.user.role === 'Admin') {
            socket.join('admin-room');
            console.log(`👑 Admin ${email} joined admin-room`);
        }

        socket.on('disconnect', () => {
            console.log(`🔌 Socket Disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

// Helper to emit to a specific user
export const emitToUser = (email, event, data) => {
    if (io && email) {
        io.to(`user:${email.toLowerCase()}`).emit(event, data);
    }
};

// Helper to emit to all admins
export const emitToAdmins = (event, data) => {
    if (io) {
        io.to('admin-room').emit(event, data);
    }
};
