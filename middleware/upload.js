import multer from 'multer';
import path from 'path';

// Memory storage for PDFs (we'll convert to base64)
const memoryStorage = multer.memoryStorage();

// File filter for PDFs only
const pdfFileFilter = (req, file, cb) => {
    const allowedTypes = /pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype === 'application/pdf';

    if (extname && mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only PDF files are allowed'));
};

// File filter for documents (PDF, DOC, DOCX)
const documentFileFilter = (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (extname) {
        return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
};

// Upload middleware for paper PDFs (stores in memory)
export const uploadPaperPDF = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: pdfFileFilter
});

// Upload middleware for review files
export const uploadReviewFile = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: documentFileFilter
});

// Upload middleware for temporary uploads (if needed)
export const uploadMemory = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: pdfFileFilter
});

// Upload middleware for final documents (PDF, DOC, DOCX)
export const uploadFinalDocument = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15MB limit
    },
    fileFilter: documentFileFilter
});

// File filter for images (JPG, PNG, WebP)
const imageFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only images (JPEG, JPG, PNG, WebP) are allowed'));
};

// Upload middleware for images
export const uploadImage = multer({
    storage: memoryStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: imageFileFilter
});

// Default export for backward compatibility
export default uploadPaperPDF;
