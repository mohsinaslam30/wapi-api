import IORedis from 'ioredis';

let redisClient = null;

export const getRedisClient = () => {
  if (redisClient) return redisClient;

  const redisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  redisClient = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, redisOptions)
    : new IORedis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        ...redisOptions,
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
