import IORedis from 'ioredis';

let redisClient = null;

export const getRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new IORedis(process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
 
  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis Client Connected');
  });

  return redisClient;
};

export default getRedisClient;
