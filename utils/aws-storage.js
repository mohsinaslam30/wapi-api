import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from 'fs';
import path from 'path';

class AWSStorage {
  static async deleteFile(fileUrl, config = null) {
    if (!fileUrl) return;

    if (fileUrl.startsWith('http')) {
      let activeConfig = config;

      if (!activeConfig) {
        const { Setting } = await import('../models/index.js');
        const setting = await Setting.findOne({ is_aws_s3_enabled: true }).select('aws_access_key_id aws_secret_access_key aws_region aws_s3_bucket is_aws_s3_enabled').lean();

        if (setting && setting.is_aws_s3_enabled) {
          activeConfig = {
            accessKeyId: setting.aws_access_key_id,
            secretAccessKey: setting.aws_secret_access_key,
            region: setting.aws_region,
            bucket: setting.aws_s3_bucket
          };
        } else {
          activeConfig = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            bucket: process.env.AWS_S3_BUCKET
          };
        }
      }

      const aws = new AWSStorage(activeConfig);
      if (aws.isConfigured()) {
        await aws.deleteObject(fileUrl);
      }
    } else {
      const absolutePath = path.join(process.cwd(), fileUrl.replace(/^\//, ''));
      if (fs.existsSync(absolutePath)) {
        try {
          fs.unlinkSync(absolutePath);
        } catch (err) {
          console.error(`Error deleting local file ${absolutePath}:`, err);
        }
      }
    }
  }

  constructor(config = {}) {
    const rawRegion = config.region || process.env.AWS_REGION;
    this.config = {
      accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      region: rawRegion && typeof rawRegion === 'string' ? rawRegion.split(' ').pop().replace(/[()]/g, '') : null,
      bucket: config.bucket || process.env.AWS_S3_BUCKET,
    };

    if (this.config.accessKeyId && this.config.secretAccessKey && this.config.region) {
      this.s3Client = new S3Client({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
    }
  }

  isConfigured() {
    return !!(this.s3Client && this.config.bucket);
  }

  async uploadFile(file, folder = 'uploads', userId = null) {
    if (!this.isConfigured()) {
      throw new Error("AWS S3 is not configured correctly.");
    }

    const fileName = file.filename || `${Date.now()}-${path.basename(file.originalname || 'file')}`;
    const userFolder = userId ? `user_${userId}/` : '';
    const key = `${userFolder}${folder}/${fileName}`.replace(/\/+/g, '/');

    let body;
    if (file.path) {
      body = fs.createReadStream(file.path);
    } else if (file.buffer) {
      body = file.buffer;
    } else if (file.stream) {
      body = file.stream;
    } else {
      throw new Error("Invalid file object. Must contain path, buffer, or stream.");
    }

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: file.mimetype || 'application/octet-stream',
          ACL: 'public-read',
        },
      });

      await upload.done();

      return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
    } catch (error) {
      console.error("AWS S3 Upload Error:", error);
      throw error;
    }
  }

  async deleteObject(fileUrl) {
    if (!this.isConfigured()) return;

    try {
      let key = fileUrl;
      if (fileUrl.startsWith('http')) {
        try {
          const url = new URL(fileUrl);
          let keyName = url.pathname.substring(1);
          keyName = decodeURIComponent(keyName);
          const hostParts = url.hostname.split('.');
          if (hostParts.length > 2 && hostParts[0] !== this.config.bucket && (hostParts.includes('s3') || hostParts.includes('amazonaws'))) {
            const pathParts = keyName.split('/');
            if (pathParts[0] === this.config.bucket) {
              keyName = pathParts.slice(1).join('/');
            }
          }

          key = keyName;
        } catch (urlErr) {
        
          const urlMatch = fileUrl.match(/amazonaws\.com\/(.+)$/);
          if (urlMatch) {
            key = decodeURIComponent(urlMatch[1].split('?')[0]);
          }
        }
      }

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error("AWS S3 Delete Error:", error);
    }
  }
}

export const deleteFile = AWSStorage.deleteFile;
export { AWSStorage };

export default AWSStorage;
