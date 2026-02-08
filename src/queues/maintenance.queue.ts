import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Job data interface for maintenance window jobs
export interface MaintenanceJobData {
  maintenanceId: string;
  action: 'start' | 'end';
}

// Create maintenance queue
export const maintenanceQueue = new Queue<MaintenanceJobData>('maintenance', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 100
  }
});

/**
 * Schedule maintenance start/end jobs for a maintenance window.
 * Jobs are scheduled with delays based on start/end times.
 *
 * @param maintenance - Maintenance window with id, startTime, endTime
 * @returns Object with start and end job IDs (if scheduled)
 */
export async function scheduleMaintenanceJobs(
  maintenance: { id: string; startTime: Date; endTime: Date }
): Promise<{ startJobId?: string; endJobId?: string }> {
  const now = Date.now();
  const startTime = new Date(maintenance.startTime).getTime();
  const endTime = new Date(maintenance.endTime).getTime();

  const result: { startJobId?: string; endJobId?: string } = {};

  // Schedule start job if start time is in future
  if (startTime > now) {
    const startDelay = startTime - now;
    const startJobId = `maintenance:${maintenance.id}:start`;

    await maintenanceQueue.add(
      'maintenance-action',
      {
        maintenanceId: maintenance.id,
        action: 'start'
      },
      {
        jobId: startJobId,
        delay: startDelay
      }
    );

    logger.info(
      { maintenanceId: maintenance.id, action: 'start', delayMs: startDelay, jobId: startJobId },
      'Scheduled maintenance start job'
    );

    result.startJobId = startJobId;
  }

  // Schedule end job if end time is in future
  if (endTime > now) {
    const endDelay = endTime - now;
    const endJobId = `maintenance:${maintenance.id}:end`;

    await maintenanceQueue.add(
      'maintenance-action',
      {
        maintenanceId: maintenance.id,
        action: 'end'
      },
      {
        jobId: endJobId,
        delay: endDelay
      }
    );

    logger.info(
      { maintenanceId: maintenance.id, action: 'end', delayMs: endDelay, jobId: endJobId },
      'Scheduled maintenance end job'
    );

    result.endJobId = endJobId;
  }

  return result;
}

/**
 * Cancel scheduled maintenance jobs for a maintenance window.
 *
 * @param maintenanceId - ID of the maintenance window
 * @returns Number of jobs removed
 */
export async function cancelMaintenanceJobs(maintenanceId: string): Promise<number> {
  let removedCount = 0;

  // Try to remove start job
  const startJobId = `maintenance:${maintenanceId}:start`;
  try {
    const startJob = await maintenanceQueue.getJob(startJobId);
    if (startJob) {
      await startJob.remove();
      removedCount++;
      logger.info({ maintenanceId, jobId: startJobId }, 'Cancelled maintenance start job');
    }
  } catch (error) {
    logger.warn({ maintenanceId, jobId: startJobId, error }, 'Failed to cancel start job');
  }

  // Try to remove end job
  const endJobId = `maintenance:${maintenanceId}:end`;
  try {
    const endJob = await maintenanceQueue.getJob(endJobId);
    if (endJob) {
      await endJob.remove();
      removedCount++;
      logger.info({ maintenanceId, jobId: endJobId }, 'Cancelled maintenance end job');
    }
  } catch (error) {
    logger.warn({ maintenanceId, jobId: endJobId, error }, 'Failed to cancel end job');
  }

  return removedCount;
}

/**
 * Get queue metrics for health checks.
 */
export async function getMaintenanceQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    maintenanceQueue.getWaitingCount(),
    maintenanceQueue.getActiveCount(),
    maintenanceQueue.getDelayedCount(),
    maintenanceQueue.getFailedCount()
  ]);

  return { waiting, active, delayed, failed };
}
