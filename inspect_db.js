import mongoose from 'mongoose';

const main = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/fff');
        console.log('Connected to MongoDB');

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name).join(', '));

        const paperCount = await mongoose.connection.db.collection('papersubmissions').countDocuments();
        console.log('PaperSubmissions count:', paperCount);

        const revisionCount = await mongoose.connection.db.collection('revisions').countDocuments();
        console.log('Revisions count:', revisionCount);

        const reviewCount = await mongoose.connection.db.collection('reviewerreviews').countDocuments();
        console.log('ReviewerReviews count:', reviewCount);

        const samplePaper = await mongoose.connection.db.collection('papersubmissions').findOne();
        console.log('Sample Paper:', JSON.stringify(samplePaper, null, 2));

        const sampleRevision = await mongoose.connection.db.collection('revisions').findOne();
        console.log('Sample Revision:', JSON.stringify(sampleRevision, null, 2));

        const sampleReview = await mongoose.connection.db.collection('reviewerreviews').findOne();
        console.log('Sample Review:', JSON.stringify(sampleReview, null, 2));

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
};

main();
