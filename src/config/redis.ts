import { Redis } from 'ioredis';
import { logger } from './logger.js';

// Redis connection options
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,    // Required for BullMQ
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error({ times }, 'Redis connection failed after 10 retries');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000); // Exponential backoff, max 2s
    logger.warn({ times, delay }, 'Redis reconnecting...');
    return delay;
  }
};

// Singleton connection for BullMQ (shared across queues/workers)
let redisConnection: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(redisConfig);

    redisConnection.on('connect', () => {
      logger.info('Redis connected');
    });

    redisConnection.on('error', (err: Error) => {
      logger.error({ err }, 'Redis connection error');
    });

    redisConnection.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }
  return redisConnection;
}

// For BullMQ - returns connection config object (not the client)
export function getRedisConnectionOptions() {
  return redisConfig;
}

// Graceful shutdown
export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    logger.info('Redis connection closed gracefully');
  }
}
