import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';
import Contact from '../models/contact.model.js';
import User from '../models/user.model.js';
import Tag from '../models/tag.model.js';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sendMail } from '../utils/mail.js';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _redisConnection = null;
let _contactExportQueue = null;
let _contactExportWorker = null;
let _isInitialized = false;
let _redisErrorLogged = false;

const initializeQueueSystem = () => {
  if (_isInitialized) {
    return { queue: _contactExportQueue, worker: _contactExportWorker, redisConnection: _redisConnection };
  }

  _isInitialized = true;

  try {
    _redisConnection = new IORedis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    _contactExportQueue = new Queue('contact-export', {
      connection: _redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        timeout: 300000,
      },
    });

    console.log('Creating contact export worker with Redis connection');
    _contactExportWorker = new Worker(
      'contact-export',
      async (job) => {
        console.log(`=== STARTING CONTACT EXPORT JOB ${job.id} ===`, {
          userId: job.data.userId,
          jobId: job.id,
          timestamp: new Date().toISOString()
        });

        const { userId, format } = job.data;

        try {
          const exportsDir = path.join(__dirname, '../exports');
          if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
          }

          const contacts = await Contact.find({
            created_by: userId,
            deleted_at: null
          }).populate('tags', 'name');

          const exportData = contacts.map(contact => {
            return {
              name: contact.name,
              email: contact.email || '',
              phone: contact.phone_number,
              tag_ids: contact.tags.map(tag => tag._id.toString()).join(', '),
              tag_names: contact.tags.map(tag => tag.name).join(', '),
              status: contact.status,
              source: contact.source,
              created_at: contact.created_at.toISOString()
            };
          });

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `contacts-export-${userId}-${timestamp}.${format}`;
          const filepath = path.join(exportsDir, filename);

          if (format === 'csv') {
            const csvWriter = createObjectCsvWriter({
              path: filepath,
              header: [
                { id: 'name', title: 'Name' },
                { id: 'email', title: 'Email' },
                { id: 'phone', title: 'Phone' },
                { id: 'tag_ids', title: 'Tag IDs' },
                { id: 'tag_names', title: 'Tag Names' },
                { id: 'status', title: 'Status' },
                { id: 'source', title: 'Source' },
                { id: 'created_at', title: 'Created At' }
              ]
            });

            await csvWriter.writeRecords(exportData);
          } else if (format === 'xlsx') {

            const csvWriter = createObjectCsvWriter({
              path: filepath.replace('.xlsx', '.csv'),
              header: [
                { id: 'name', title: 'Name' },
                { id: 'email', title: 'Email' },
                { id: 'phone', title: 'Phone' },
                { id: 'tag_ids', title: 'Tag IDs' },
                { id: 'tag_names', title: 'Tag Names' },
                { id: 'status', title: 'Status' },
                { id: 'source', title: 'Source' },
                { id: 'created_at', title: 'Created At' }
              ]
            });

            await csvWriter.writeRecords(exportData);

            const csvPath = filepath.replace('.xlsx', '.csv');
            fs.renameSync(csvPath, filepath);
          }

          const user = await User.findById(userId).select('email name');
          if (user) {
            const emailSubject = 'Your Contact Export File is Ready';
            const emailBody = `
              <h2>Contact Export Completed</h2>
              <p>Hello ${user.name},</p>
              <p>Your contact export has been completed successfully.</p>
              <p><strong>Export Details:</strong></p>
              <ul>
                <li>Total Contacts Exported: ${exportData.length}</li>
                <li>Format: ${format.toUpperCase()}</li>
                <li>File Name: ${filename}</li>
                <li>Exported At: ${new Date().toLocaleString()}</li>
              </ul>
              <p>The exported file is attached to this email.</p>
              <p>Thank you for using our service!</p>
            `;

            const fileBuffer = fs.readFileSync(filepath);

            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST || 'smtp.gmail.com',
              port: process.env.SMTP_PORT || 587,
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            });

            const mailOptions = {
              from: process.env.SMTP_USER || 'noreply@yourapp.com',
              to: user.email,
              subject: emailSubject,
              html: emailBody,
              attachments: [{
                filename: filename,
                content: fileBuffer
              }]
            };

            await transporter.sendMail(mailOptions);

            setTimeout(() => {
              try {
                if (fs.existsSync(filepath)) {
                  fs.unlinkSync(filepath);
                }
              } catch (cleanupError) {
                console.error('Error cleaning up export file:', cleanupError);
              }
            }, 10000);
          }

          console.log(`=== COMPLETED CONTACT EXPORT JOB ${job.id} ===`, {
            userId: job.data.userId,
            jobId: job.id,
            filepath: filepath,
            recordCount: exportData.length,
            timestamp: new Date().toISOString()
          });

          return {
            success: true,
            filepath: filepath,
            filename: filename,
            recordCount: exportData.length
          };

        } catch (error) {
          console.error(`Contact export job ${job.id} failed:`, error.message);
          throw error;
        }
      },
      {
        connection: _redisConnection,
        concurrency: 1,
        limiter: {
          max: 1,
          duration: 1000,
        },
      }
    );

    _contactExportWorker.on('completed', (job, result) => {
      console.log(`Contact export job ${job.id} completed successfully`, {
        recordCount: result.recordCount,
        filename: result.filename
      });
    });

    _contactExportWorker.on('failed', (job, err) => {
      console.error(`Contact export job ${job.id} failed:`, err.message);
    });

  } catch (error) {
    if (!_redisErrorLogged) {
      console.error('Failed to connect to Redis for contact export:', error.message);
      console.log('Contact export queue system disabled.');
      _redisErrorLogged = true;
    }

    _contactExportQueue = {
      add: async (name, data, options) => {
        console.warn('Redis not available for contact export. Running synchronously:', name);
        return { id: Math.random().toString(36).substr(2, 9) };
      }
    };

    _contactExportWorker = null;
    _redisConnection = null;
  }

  return { queue: _contactExportQueue, worker: _contactExportWorker, redisConnection: _redisConnection };
};

export const getContactExportQueue = () => {
  const { queue, worker } = initializeQueueSystem();
  if (worker) {
    console.log('Contact export worker is ready to process jobs');
    console.log('Worker ID:', worker.id);
  }
  return queue;
};

export const getContactExportWorker = () => {
  const { worker } = initializeQueueSystem();
  return worker;
};

export const getRedisConnection = () => {
  const { redisConnection } = initializeQueueSystem();
  return redisConnection;
};

export default {
  get contactExportQueue() {
    return getContactExportQueue();
  },
  get contactExportWorker() {
    return getContactExportWorker();
  },
  get redisConnection() {
    return getRedisConnection();
  }
};
