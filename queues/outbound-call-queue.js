import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';
import callAutomationService from '../services/whatsapp/call-automation.service.js';

let _redisConnection = null;
let _outboundCallQueue = null;
let _outboundCallWorker = null;
let _isInitialized = false;
let _redisErrorLogged = false;

const initializeQueueSystem = () => {
    if (_isInitialized) {
        return { queue: _outboundCallQueue, worker: _outboundCallWorker, redisConnection: _redisConnection };
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

        _outboundCallQueue = new Queue('outbound-call', {
            connection: _redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: true,
                removeOnFail: false
            },
        });

        console.log('[OutboundCallQueue] Creating worker with Redis connection');
        _outboundCallWorker = new Worker(
            'outbound-call',
            async (job) => {
                const { phoneNumberId, contactNumber, agentId, userId, campaignId } = job.data;

                try {
                    console.log(`[OutboundCallQueue] Processing job ${job.id} for ${contactNumber}`);

                    const result = await callAutomationService.initiateOutboundCall(
                        phoneNumberId,
                        contactNumber,
                        agentId,
                        userId,
                        campaignId
                    );

                    console.log(`[OutboundCallQueue] Call initiated successfully:`, result);
                    return result;

                } catch (error) {
                    console.error(`[OutboundCallQueue] Error initiating call for job ${job.id}:`, error);
                    throw error;
                }
            },
            {
                connection: _redisConnection,
                concurrency: 5
            }
        );

        _outboundCallWorker.on('completed', (job) => {
            console.log(`[OutboundCallQueue] Job ${job.id} completed successfully`);
        });

        _outboundCallWorker.on('failed', (job, err) => {
            console.error(`[OutboundCallQueue] Job ${job?.id} failed:`, err?.message);
        });

        _outboundCallWorker.on('error', (err) => {
            console.error('[OutboundCallQueue] Worker error:', err);
        });

    } catch (error) {
        if (!_redisErrorLogged) {
            console.error('[OutboundCallQueue] Failed to connect to Redis:', error.message);
            _redisErrorLogged = true;
        }

        _outboundCallQueue = {
            add: async (name, data, options) => {
                console.warn('[OutboundCallQueue] Redis not available. Queue operation skipped.');
                return { id: 'fallback-' + Math.random().toString(36).substr(2, 9) };
            },
            getWaitingCount: async () => 0,
            getActiveCount: async () => 0,
            getCompletedCount: async () => 0,
            getFailedCount: async () => 0
        };

        _outboundCallWorker = null;
        _redisConnection = null;
    }

    return { queue: _outboundCallQueue, worker: _outboundCallWorker, redisConnection: _redisConnection };
};

export const getOutboundCallQueue = () => {
    const { queue } = initializeQueueSystem();
    return queue;
};

export async function scheduleOutboundCall(contactData, delaySeconds) {
    const { queue } = initializeQueueSystem();
    const delayMs = delaySeconds * 1000;

    console.log(`[OutboundCallQueue] Scheduling call for ${contactData.contactNumber} in ${delaySeconds}s`);

    const job = await queue.add('initiate-call', contactData, {
        delay: delayMs,
        attempts: contactData.maxRetryAttempts || 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    });

    console.log(`[OutboundCallQueue] Job ${job.id} scheduled`);

    return {
        jobId: job.id,
        scheduledAt: new Date(Date.now() + delayMs),
        delaySeconds
    };
}


export async function getQueueStats() {
    const { queue } = initializeQueueSystem();

    const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount()
    ]);

    return {
        waiting,
        active,
        completed,
        failed
    };
}

export default {
    scheduleOutboundCall,
    getQueueStats,
    getOutboundCallQueue
};
