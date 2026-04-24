import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';

let _redisConnection = null;
let _sequenceQueue = null;
let _sequenceWorker = null;
let _isInitialized = false;
let _redisErrorLogged = false;

const initializeQueueSystem = async () => {
    if (_isInitialized) {
        return { queue: _sequenceQueue, worker: _sequenceWorker, redisConnection: _redisConnection };
    }

    _isInitialized = true;

    try {
        _redisConnection = new IORedis(process.env.REDIS_URL || {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times) => {
                return Math.min(times * 500, 2000);
            }
        });

        _sequenceQueue = new Queue('sequence', {
            connection: _redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                timeout: 60000,
            },
        });

        console.log('Creating sequence worker with Redis connection');
        _sequenceWorker = new Worker(
            'sequence',
            async (job) => {
                const { wabaId, contactId, step, userId, whatsappPhoneNumberId, params } = job.data;

                console.log(`=== STARTING SEQUENCE JOB ${job.id} ===`, {
                    contactId,
                    stepSort: step.sort,
                    jobId: job.id,
                    timestamp: new Date().toISOString()
                });

                const { canSendSequenceStep, sendAutomatedReply } = await import('../utils/automated-response.service.js');

                const canSend = await canSendSequenceStep(contactId, step.reply_material_type);
                if (!canSend) {
                    console.log(`Skipping sequence step ${step.sort} due to 24-hour rule restrict (not a Template)`);
                    return { status: 'skipped', reason: '24-hour rule' };
                }

                const sequenceAutomationData = {
                    variables_mapping: step.variables_mapping,
                    media_url: step.media_url,
                    carousel_cards_data: step.carousel_cards_data,
                    coupon_code: step.coupon_code,
                    catalog_id: step.catalog_id,
                    product_retailer_id: step.product_retailer_id
                };

                const result = await sendAutomatedReply({
                    wabaId,
                    contactId,
                    replyType: step.reply_material_type.toLowerCase(),
                    replyId: step.reply_material_id,
                    whatsappPhoneNumberId,
                    userId,
                    sequenceAutomationData,
                    incomingText: ''
                });

                console.log(`=== COMPLETED SEQUENCE JOB ${job.id} ===`, {
                    contactId,
                    stepSort: step.sort,
                    timestamp: new Date().toISOString()
                });

                return result;
            },
            {
                connection: _redisConnection,
                concurrency: 15,
                limiter: {
                    max: 15,
                    duration: 1000,
                },
            }
        );

        _sequenceWorker.on('completed', (job) => {
            console.log(`Sequence job ${job.id} completed successfully`);
        });

        _sequenceWorker.on('failed', (job, err) => {
            console.error(`Sequence job ${job.id} failed:`, err.message);
        });

        _sequenceWorker.on('error', (err) => {
            if (!_redisErrorLogged) {
                console.error(`Sequence worker internal error:`, err.message);
            }
        });

        _sequenceQueue.on('error', (err) => {
            if (!_redisErrorLogged) {
                console.error(`Sequence queue internal error:`, err.message);
            }
        });

        _redisConnection.on('error', (err) => {
            if (!_redisErrorLogged) {
                console.warn('Redis connection error in sequence queue:', err.message);
                _redisErrorLogged = true;
            }
        });

    } catch (error) {
        if (!_redisErrorLogged) {
            console.error('Failed to connect to Redis:', error.message);
            console.log('Sequence Queue system disabled.');
            _redisErrorLogged = true;
        }

        _sequenceQueue = {
            add: async (name, data, options) => {
                console.warn('Redis not available. Cannot schedule sequence job:', name);
                return { id: Math.random().toString(36).substr(2, 9) };
            }
        };

        _sequenceWorker = null;
        _redisConnection = null;
    }

    return { queue: _sequenceQueue, worker: _sequenceWorker, redisConnection: _redisConnection };
};

export const getSequenceQueue = async () => {
    const { queue, worker } = await initializeQueueSystem();
    if (worker) {
        console.log('Sequence worker is ready to process jobs');
        console.log('Worker ID:', worker.id);
    }
    return queue;
};

export default {
    getSequenceQueue
};
