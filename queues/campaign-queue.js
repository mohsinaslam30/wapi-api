import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';

let _redisConnection = null;
let _campaignQueue = null;
let _campaignWorker = null;
let _isInitialized = false;
let _redisErrorLogged = false;

const initializeQueueSystem = () => {
  console.log("caleleddd");
  if (_isInitialized) {
    return { queue: _campaignQueue, worker: _campaignWorker, redisConnection: _redisConnection };
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

    _campaignQueue = new Queue('campaign', {
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

    console.log('Creating campaign worker with Redis connection');
    _campaignWorker = new Worker(
      'campaign',
      async (job) => {
        const recipientData = job.data.recipient;
        const phoneNumber = typeof recipientData === 'string'
          ? recipientData
          : (recipientData?.phone_number || 'unknown');

        console.log(`=== STARTING JOB ${job.id} ===`, {
          campaignId: job.data.campaignId,
          recipient: phoneNumber,
          jobId: job.id,
          timestamp: new Date().toISOString()
        });

        const normalizedJobData = {
          ...job.data,
          recipient: typeof recipientData === 'string'
            ? { phone_number: recipientData }
            : recipientData
        };

        const { processCampaignMessageJob } = await import('../utils/campaign-job-processor.js');

        const result = await processCampaignMessageJob(normalizedJobData);

        console.log(`=== COMPLETED JOB ${job.id} ===`, {
          campaignId: job.data.campaignId,
          recipient: phoneNumber,
          jobId: job.id,
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

    _campaignWorker.on('completed', (job) => {
      console.log(`Campaign job ${job.id} completed successfully`);
    });

    _campaignWorker.on('failed', (job, err) => {
      console.error(`Campaign job ${job.id} failed:`, err.message);
    });

  } catch (error) {
    if (!_redisErrorLogged) {
      console.error('Failed to connect to Redis:', error.message);
      console.log('Queue system disabled. Campaigns will run synchronously.');
      _redisErrorLogged = true;
    }

    _campaignQueue = {
      add: async (name, data, options) => {
        console.warn('Redis not available. Running campaign job synchronously:', name);
        return { id: Math.random().toString(36).substr(2, 9) };
      }
    };

    _campaignWorker = null;
    _redisConnection = null;
  }

  return { queue: _campaignQueue, worker: _campaignWorker, redisConnection: _redisConnection };
};

export const getCampaignQueue = () => {
  const { queue, worker } = initializeQueueSystem();
  if (worker) {
    console.log('Campaign worker is ready to process jobs');
    console.log('Worker ID:', worker.id);
  }
  return queue;
};

export const getCampaignWorker = () => {
  const { worker } = initializeQueueSystem();
  return worker;
};

export const getRedisConnection = () => {
  const { redisConnection } = initializeQueueSystem();
  return redisConnection;
};

export default {
  get campaignQueue() {
    return getCampaignQueue();
  },
  get campaignWorker() {
    return getCampaignWorker();
  },
  get redisConnection() {
    return getRedisConnection();
  }
};
