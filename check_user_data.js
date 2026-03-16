import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const main = async () => {
    try {
        const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/fff';
        await mongoose.connect(mongoUrl);
        console.log('Connected to MongoDB');

        const email = 'demork2337@gmail.com';
        const query = { $or: [{ email: { $regex: new RegExp(`^${email}$`, 'i') } }, { authorEmail: { $regex: new RegExp(`^${email}$`, 'i') } }] };

        console.log(`\n--- Searching for submissions with email: ${email} ---`);

        const paperSubmissions = await mongoose.connection.db.collection('papersubmissions').find({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).toArray();
        console.log(`\nPaperSubmissions (${paperSubmissions.length}):`);
        paperSubmissions.forEach(p => console.log(`- ID: ${p.submissionId}, Title: ${p.paperTitle}, Status: ${p.status}`));

        const multiSubmissions = await mongoose.connection.db.collection('multiplepapersubmissions').find({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).toArray();
        console.log(`\nMultiplePaperSubmissions (${multiSubmissions.length}):`);
        multiSubmissions.forEach(p => console.log(`- ID: ${p.submissionId}, Title: ${p.paperTitle}, Status: ${p.status}`));

        const finalAcceptance = await mongoose.connection.db.collection('finalacceptances').find({ authorEmail: { $regex: new RegExp(`^${email}$`, 'i') } }).toArray();
        console.log(`\nFinalAcceptances (${finalAcceptance.length}):`);
        finalAcceptance.forEach(p => console.log(`- ID: ${p.submissionId}, Title: ${p.paperTitle}, Status: ${p.status}`));

        const copyrights = await mongoose.connection.db.collection('copyrights').find({ authorEmail: { $regex: new RegExp(`^${email}$`, 'i') } }).toArray();
        console.log(`\nCopyrights (${copyrights.length}):`);
        copyrights.forEach(c => console.log(`- ID: ${c.submissionId}, Status: ${c.status}`));

        const registration = await mongoose.connection.db.collection('paymentregistrations').find({ authorEmail: { $regex: new RegExp(`^${email}$`, 'i') } }).toArray();
        console.log(`\nPaymentRegistrations (${registration.length}):`);
        registration.forEach(r => console.log(`- ID: ${r.submissionId || 'N/A'}, Status: ${r.paymentStatus}, Method: ${r.paymentMethod}`));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

main();
