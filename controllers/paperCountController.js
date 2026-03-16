import { PaperSubmission } from '../models/Paper.js';

export const getPaperCounts = async (req, res) => {
    try {
        const [totalCount, selectedCount] = await Promise.all([
            PaperSubmission.countDocuments(),
            (await import('../models/ConferenceSelectedUser.js')).default.countDocuments()
        ]);

        return res.status(200).json({
            success: true,
            counts: {
                main: totalCount,
                multiple: 0,       // Legacy field — kept for API compatibility
                selected: selectedCount,
                total: totalCount
            }
        });
    } catch (error) {
        console.error('Error fetching paper counts:', error);
        return res.status(500).json({ success: false, message: 'Error fetching paper counts' });
    }
};
