import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';
import Contact from '../models/contact.model.js';
import Tag from '../models/tag.model.js';
import CustomField from '../models/custom-field.model.js';
import ImportJob from '../models/import-job.model.js';
import mongoose from 'mongoose';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import readXlsxFile from 'read-excel-file/node'


let _redisConnection = null;
let _contactImportQueue = null;
let _contactImportWorker = null;
let _isInitialized = false;
let _redisErrorLogged = false;
let _io = null;

export const setContactImportSocketIo = (io) => {
  _io = io;
};

const initializeQueueSystem = () => {
  if (_isInitialized) {
    return { queue: _contactImportQueue, worker: _contactImportWorker, redisConnection: _redisConnection };
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

    _contactImportQueue = new Queue('contact-import', {
      connection: _redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        timeout: 600000,
      },
    });

    console.log('Creating contact import worker with Redis connection');
    _contactImportWorker = new Worker(
      'contact-import',
      async (job) => {
        console.log(`=== STARTING CONTACT IMPORT JOB ${job.id} ===`, {
          userId: job.data.userId,
          jobId: job.id,
          timestamp: new Date().toISOString()
        });

        const { userId, filepath, originalFilename } = job.data;
        let processedCount = 0;
        let errorCount = 0;
        const errors = [];

        try {
          const [userTags, userCustomFields] = await Promise.all([
            Tag.find({ created_by: userId, deleted_at: null }),
            CustomField.find({ created_by: userId, deleted_at: null })
          ]);

          const tagMap = new Map();
          userTags.forEach(tag => {
            tagMap.set(tag.label.toLowerCase().trim(), tag);
          });

          const results = [];

          const fileExt = path.extname(filepath).toLowerCase();

          if (fileExt === '.csv') {
            await new Promise((resolve, reject) => {
              fs.createReadStream(filepath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
            });
          } else if (fileExt === '.xlsx' || fileExt === '.xls') {

            const rows = await readXlsxFile(filepath);

            const headers = rows[0].map(h => String(h).trim());

            for (let i = 1; i < rows.length; i++) {
              const rowObj = {};

              headers.forEach((header, index) => {
                rowObj[header] = rows[i][index];
              });

              results.push(rowObj);
            }
          } else {
            throw new Error('Unsupported file format');
          }

          console.log(`Parsed ${results.length} rows from file`);

          const totalRecords = results.length;

          if (job.data.importJobId) {
            await ImportJob.findByIdAndUpdate(job.data.importJobId, {
              status: 'processing',
              total_records: totalRecords
            });
          }

          if (_io) {
            console.log("contact-import:started", job.id, userId, totalRecords, job.data.originalFilename)
            _io.emit('contact-import:started', {
              jobId: job.id,
              userId,
              totalRecords,
              originalFilename: job.data.originalFilename || '',
              message: 'Contact import running in background'
            });
          }

          for (const row of results) {
            try {
              const name = row.Name || row.name || row['Full Name'] || row.full_name || '';
              const email = row.Email || row.email || '';
              const phone = row.Phone || row.phone || row['Phone Number'] || row.phone_number || '';
              const status = row.status || row.status || row['Status'] || 'lead';

              const tagValue = row.Tags || row.tags || row['Tag Names'] || row['Tag Name'] || row['Tag ID'] || row.tag_id || '';

              if (!name || !phone) {
                errors.push(`Row missing required fields (Name: ${name}, Phone: ${phone})`);
                errorCount++;
                continue;
              }

              const cleanedPhone = String(phone)
                .trim()
                .replace(/[\s\-()\+]/g, '');

              if (!/^\d{10,15}$/.test(cleanedPhone)) {
                errors.push(`Invalid phone number: ${cleanedPhone}`);
                errorCount++;
                continue;
              }

              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errors.push(`Invalid email: ${email}`);
                errorCount++;
                continue;
              }

              let tagIds = [];
              if (tagValue) {
                const tagNamesArray = String(tagValue).split(',').map(t => t.trim()).filter(t => t);
                for (const tagName of tagNamesArray) {
                  const lowerTagName = tagName.toLowerCase();
                  if (tagMap.has(lowerTagName)) {
                    tagIds.push(tagMap.get(lowerTagName)._id);
                  } else {
                    try {
                      const newTag = await Tag.create({
                        label: tagName,
                        created_by: userId
                      });
                      tagMap.set(lowerTagName, newTag);
                      tagIds.push(newTag._id);
                    } catch (tagError) {
                      console.error(`Error creating tag '${tagName}':`, tagError);
                      const existingTag = await Tag.findOne({ label: tagName, created_by: userId, deleted_at: null });
                      if (existingTag) {
                        tagMap.set(lowerTagName, existingTag);
                        tagIds.push(existingTag._id);
                      }
                    }
                  }
                }
              }

              const contactCustomFields = {};
              for (const fieldDef of userCustomFields) {
                const rowKey = Object.keys(row).find(key =>
                  key.toLowerCase().trim() === fieldDef.name.toLowerCase().trim() ||
                  key.toLowerCase().trim() === fieldDef.label.toLowerCase().trim()
                );

                if (rowKey && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
                  let value = row[rowKey];

                  if (fieldDef.type === 'number') {
                    value = Number(value);
                  } else if (fieldDef.type === 'boolean') {
                    value = String(value).toLowerCase() === 'true' || value === 1 || value === '1';
                  }

                  contactCustomFields[fieldDef.name] = value;
                }
              }

              const existingContact = await Contact.findOne({
                phone_number: cleanedPhone,
                created_by: userId,
                deleted_at: null
              });

              if (existingContact) {
                existingContact.name = name;
                existingContact.email = email || existingContact.email;
                existingContact.tags = [...new Set([...existingContact.tags.map(t => t.toString()), ...tagIds.map(t => t.toString())])];
                existingContact.custom_fields = { ...existingContact.custom_fields, ...contactCustomFields };
                existingContact.updated_by = userId;
                existingContact.status = status;
                if (!existingContact.user_id) {
                    existingContact.user_id = userId; 
                }
                await existingContact.save();
              } else {
                await Contact.create({
                  phone_number: cleanedPhone,
                  name: name,
                  email: email || null,
                  tags: tagIds,
                  custom_fields: contactCustomFields,
                  status: status,
                  source: 'whatsapp',
                  user_id: userId,
                  created_by: userId,
                  updated_by: userId
                });
              }

              processedCount++;

              if (processedCount % 100 === 0) {
                const percent = results.length ? Math.round((processedCount / results.length) * 100) : 0;
                await job.updateProgress(percent);

                if (job.data.importJobId) {
                  await ImportJob.findByIdAndUpdate(job.data.importJobId, {
                    processed_count: processedCount,
                    error_count: errorCount
                  });
                }

                if (_io) {
                  _io.emit('contact-import:progress', {
                    jobId: job.id,
                    userId,
                    processedCount,
                    errorCount,
                    totalRecords: results.length,
                    percent
                  });
                }
              }

            } catch (rowError) {
              console.log("Errors processing", rowError)
              errors.push(`Error processing row: ${rowError.message}`);
              errorCount++;
            }
          }

          if (_io && results.length) {
            const percent = 100;
            console.log("contact-import:progress", job.id, job.data.userId, processedCount, errorCount, totalRecords, percent)
            _io.emit('contact-import:progress', {
              jobId: job.id,
              userId: job.data.userId,
              processedCount,
              errorCount,
              totalRecords: results.length,
              percent
            });
          }

          try {
            fs.unlinkSync(filepath);
          } catch (cleanupError) {
            console.warn('Could not delete uploaded file:', cleanupError.message);
          }

          console.log(`=== COMPLETED CONTACT IMPORT JOB ${job.id} ===`, {
            userId: job.data.userId,
            jobId: job.id,
            processedCount: processedCount,
            errorCount: errorCount,
            error_logs: errors,
            timestamp: new Date().toISOString()
          });

          const resultPayload = {
            success: true,
            processedCount: processedCount,
            errorCount: errorCount,
            error_logs: errors.slice(0, 10),
            totalRecords: results.length
          };

          if (job.data.importJobId) {
            await ImportJob.findByIdAndUpdate(job.data.importJobId, {
              status: 'completed',
              processed_count: processedCount,
              error_count: errorCount,
              error_logs: errors.slice(0, 50)
            });
          }

          if (_io) {
            console.log("contact-import:progress", job.id, job.data.userId, resultPayload)

            _io.emit('contact-import:completed', {
              jobId: job.id,
              userId: job.data.userId,
              ...resultPayload
            });
          }

          return resultPayload;

        } catch (error) {
          if (job.data.importJobId) {
            await ImportJob.findByIdAndUpdate(job.data.importJobId, {
              status: 'failed',
              error_logs: [error.message]
            });
          }

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

    _contactImportWorker.on('completed', (job, result) => {
      console.log(`Contact import job ${job.id} ${result.processedCount} ${result.errorCount} completed`, {
        processedCount: result.processedCount,
        errorCount: result.errorCount
      });
    });

    _contactImportWorker.on('failed', (job, err) => {
      console.error(`Contact import job ${job.id} failed:`, err.message);
      if (_io && job) {
        _io.emit('contact-import:failed', {
          jobId: job.id,
          userId: job.data?.userId,
          error: err.message,
          message: 'Contact import failed'
        });
      }
    });

    _contactImportWorker.on('progress', (job, progress) => {
      console.log(`Contact import job ${job.id} progress: ${progress}%`);
    });

  } catch (error) {
    if (!_redisErrorLogged) {
      console.error('Failed to connect to Redis for contact import:', error.message);
      console.log('Contact import queue system disabled.');
      _redisErrorLogged = true;
    }

    _contactImportQueue = {
      add: async (name, data, options) => {
        console.warn('Redis not available for contact import. Running synchronously:', name);
        return { id: Math.random().toString(36).substr(2, 9) };
      }
    };

    _contactImportWorker = null;
    _redisConnection = null;
  }

  return { queue: _contactImportQueue, worker: _contactImportWorker, redisConnection: _redisConnection };
};

export const getContactImportQueue = () => {
  const { queue, worker } = initializeQueueSystem();
  if (worker) {
    console.log('Contact import worker is ready to process jobs');
    console.log('Worker ID:', worker.id);
  }
  return queue;
};

export const getContactImportWorker = () => {
  const { worker } = initializeQueueSystem();
  return worker;
};

export const getRedisConnection = () => {
  const { redisConnection } = initializeQueueSystem();
  return redisConnection;
};

export default {
  get contactImportQueue() {
    return getContactImportQueue();
  },
  get contactImportWorker() {
    return getContactImportWorker();
  },
  get redisConnection() {
    return getRedisConnection();
  }
};
