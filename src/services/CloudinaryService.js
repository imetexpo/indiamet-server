const cloudinary = require('cloudinary').v2;

class CloudinaryService {
  constructor() {
    this.isConfigured = false;
  }

  configure() {
    if (this.isConfigured) return;

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    console.log("🔍 Cloudinary Config Check:", {
      cloud_name: cloudName ? "✅ Present" : "❌ Missing",
      api_key: apiKey ? "✅ Present" : "❌ Missing",
      api_secret: apiSecret ? "✅ Present" : "❌ Missing"
    });

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("❌ Cloudinary credentials missing!");
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    });

    this.isConfigured = true;
    console.log('☁️ Cloudinary configured successfully');
  }

  async uploadFile(fileBuffer, options = {}) {
    try {
      this.configure();

      if (!this.isConfigured) {
        throw new Error('Cloudinary not configured. Missing credentials.');
      }

      console.log('📤 Uploading to Cloudinary...', {
        folder: options.folder || 'exhibition-files',
        resource_type: options.resource_type || 'auto',
        bufferSize: fileBuffer.length
      });

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder || 'exhibition-files',
            resource_type: options.resource_type || 'auto',
            ...options
          },
          (error, result) => {
            if (error) {
              console.error('❌ Cloudinary upload error:', error.message);
              reject(error);
            } else {
              console.log('✅ Cloudinary upload success:', result.public_id);
              resolve(result);
            }
          }
        );
        uploadStream.end(fileBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes
      };

    } catch (error) {
      console.error('❌ Cloudinary upload error:', error.message);
      throw error;
    }
  }

  async deleteFile(publicId) {
    try {
      this.configure();

      const result = await cloudinary.uploader.destroy(publicId);
      console.log('🗑️ Cloudinary delete result:', result);
      return result;
    } catch (error) {
      console.error('❌ Cloudinary delete error:', error.message);
      throw error;
    }
  }
}

module.exports = new CloudinaryService();