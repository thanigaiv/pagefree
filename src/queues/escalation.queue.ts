import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Job data interfaces
export interface EscalationJobData {
  incidentId: string;
  toLevel: number;
  repeatNumber: number;
}

// Create escalation queue
export const escalationQueue = new Queue<EscalationJobData>('escalation', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Schedule an escalation job
export async function scheduleEscalation(
  incidentId: string,
  currentLevel: number,
  repeatNumber: number,
  timeoutMinutes: number
): Promise<string> {
  // BullMQ doesn't allow colons in custom job IDs, use dashes instead
  const jobId = `incident-${incidentId}-level-${currentLevel + 1}-repeat-${repeatNumber}`;
  const delayMs = timeoutMinutes * 60 * 1000;

  await escalationQueue.add(
    'escalate',
    {
      incidentId,
      toLevel: currentLevel + 1,
      repeatNumber
    },
    {
      jobId,
      delay: delayMs
    }
  );

  logger.info(
    { incidentId, toLevel: currentLevel + 1, delayMs, jobId },
    'Scheduled escalation job'
  );

  return jobId;
}

// Cancel escalation jobs for an incident
export async function cancelEscalation(bullJobId: string): Promise<boolean> {
  try {
    const job = await escalationQueue.getJob(bullJobId);
    if (job) {
      await job.remove();
      logger.info({ bullJobId }, 'Cancelled escalation job');
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ bullJobId, error }, 'Failed to cancel escalation job');
    return false;
  }
}

// Get queue metrics (for health checks)
export async function getEscalationQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    escalationQueue.getWaitingCount(),
    escalationQueue.getActiveCount(),
    escalationQueue.getDelayedCount(),
    escalationQueue.getFailedCount()
  ]);

  return { waiting, active, delayed, failed };
}
