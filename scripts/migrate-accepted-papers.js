import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PaperSubmission } from '../models/Paper.js';
import FinalAcceptance from '../models/FinalAcceptance.js';

dotenv.config();

const migrateAcceptedPapers = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/icmbnt');
        console.log('✅ Connected to MongoDB');

        // Find all papers with status "Accepted" that are not yet in FinalAcceptance
        const acceptedPapers = await PaperSubmission.find({ status: 'Accepted' });
        console.log(`📄 Found ${acceptedPapers.length} accepted papers`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const paper of acceptedPapers) {
            try {
                // Check if this paper already exists in FinalAcceptance
                const existingAcceptance = await FinalAcceptance.findOne({ 
                    submissionId: paper.submissionId 
                });

                if (existingAcceptance) {
                    console.log(`⏭️  Skipping ${paper.submissionId} - already in FinalAcceptance`);
                    skippedCount++;
                    continue;
                }

                // Create FinalAcceptance record
                const finalAcceptance = new FinalAcceptance({
                    paperId: paper._id,
                    submissionId: paper.submissionId,
                    paperTitle: paper.paperTitle,
                    authorName: paper.authorName,
                    authorEmail: paper.email,
                    category: paper.category,
                    pdfUrl: paper.pdfUrl || 'https://example.com/default.pdf',
                    pdfPublicId: paper.pdfPublicId || '',
                    pdfFileName: paper.pdfFileName || '',
                    acceptanceDate: new Date(),
                    paymentStatus: 'pending',
                    status: 'Accepted',
                    finalDecision: 'Accept',
                    conferenceName: 'ICMBNT 2026',
                    conferenceYear: 2026
                });

                await finalAcceptance.save();
                console.log(`✅ Migrated: ${paper.submissionId} - ${paper.authorName} (${paper.email})`);
                migratedCount++;
            } catch (error) {
                console.error(`❌ Error migrating ${paper.submissionId}:`, error.message);
            }
        }

        console.log(`\n📊 Migration Summary:`);
        console.log(`   ✅ Migrated: ${migratedCount}`);
        console.log(`   ⏭️  Skipped: ${skippedCount}`);
        console.log(`   📄 Total: ${acceptedPapers.length}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error during migration:', error);
        process.exit(1);
    }
};

migrateAcceptedPapers();
