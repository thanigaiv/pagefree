import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';

export interface TestResolveJobData {
  incidentId: string;
  reason: string;
}

export const testResolveQueue = new Queue<TestResolveJobData>('test-resolve', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: true, // Test jobs can be cleaned up
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

export async function scheduleAutoResolve(
  incidentId: string,
  delayMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<string> {
  const jobId = `auto-resolve:${incidentId}`;

  await testResolveQueue.add(
    'auto-resolve',
    {
      incidentId,
      reason: 'Test alert auto-resolved after 5 minutes'
    },
    {
      jobId,
      delay: delayMs
    }
  );

  logger.info({ incidentId, delayMs, jobId }, 'Scheduled auto-resolve job');
  return jobId;
}
