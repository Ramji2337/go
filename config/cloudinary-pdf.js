import cloudinary from './cloudinary.js';
import streamifier from 'streamifier';
import path from 'path';

// Use the unified configuration from cloudinary.js

/**
 * Upload PDF to Cloudinary and return the secure URL
 * @param {Buffer} fileBuffer - The PDF file buffer
 * @param {String} fileName - Original file name
 * @returns {Promise<{url: String, publicId: String}>}
 */
export const uploadPdfToCloudinary = async (fileBuffer, fileName) => {
  return new Promise((resolve, reject) => {
    const extension = path.extname(fileName).toLowerCase();
    const cleanFileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '').trim().replace(/\s+/g, '_');

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'icmbnt-pdfs',
        public_id: `${Date.now()}-${cleanFileNameWithoutExt}${extension}`, // Unique ID based on timestamp and filename
        access_mode: 'authenticated', // Keep PDFs private, only accessible with auth token if needed
        timeout: 60000, // 60 second timeout for upload
        chunk_size: 5242880 // 5MB chunks for large files
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Failed to upload PDF to Cloudinary: ${error.message}`));
        } else {
          console.log('PDF uploaded to Cloudinary:', {
            url: result.secure_url,
            publicId: result.public_id,
            size: result.bytes
          });
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            fileName: fileName
          });
        }
      }
    );

    // Pipe the file buffer to the upload stream
    const readStream = streamifier.createReadStream(fileBuffer);
    readStream.on('error', (error) => {
      console.error('Stream read error:', error);
      reject(new Error(`Failed to read file stream: ${error.message}`));
    });

    readStream.pipe(uploadStream);
  });
};


/**
 * Delete PDF from Cloudinary
 * @param {String} publicId - Cloudinary public ID of the file
 * @returns {Promise}
 */
export const deletePdfFromCloudinary = async (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }, (error, result) => {
      if (error) {
        console.error('Cloudinary delete error:', error);
        reject(new Error(`Failed to delete PDF from Cloudinary: ${error.message}`));
      } else {
        console.log('PDF deleted from Cloudinary:', publicId);
        resolve(result);
      }
    });
  });
};

/**
 * List all PDFs in the icmbnt-pdfs folder from Cloudinary
 * @returns {Promise<Array>} - Array of PDF resources
 */
export const listPdfsFromCloudinary = async () => {
  return new Promise((resolve, reject) => {
    cloudinary.api.resources(
      {
        type: 'upload',
        prefix: 'icmbnt-pdfs',
        resource_type: 'raw',
        max_results: 500
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary list error:', error);
          reject(new Error(`Failed to list PDFs from Cloudinary: ${error.message}`));
        } else {
          console.log(`Found ${result.resources.length} PDFs in Cloudinary`);
          resolve(result.resources);
        }
      }
    );
  });
};


export default cloudinary;
