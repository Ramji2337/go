import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`MongoDB Atlas   Connected Successfully to database ${process.env.MONGODB_URI}`);
    } catch (err) {
        console.error(      "MongoDB Connection Error Details:", {
            message: err.message,
            stack: err.stack
        });
        process.exit(1);
    }
};
