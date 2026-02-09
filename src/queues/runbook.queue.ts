/**
 * Runbook BullMQ Queue
 *
 * Manages runbook execution jobs.
 * Follows workflow.queue.ts pattern for consistency.
 *
 * @module queues/runbook.queue
 */

import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Runbook job data passed to the worker
 */
export interface RunbookJobData {
  /** ID of the RunbookExecution record */
  executionId: string;
  /** ID of the runbook being executed */
  runbookId: string;
  /** ID of the incident (optional) */
  incidentId?: string;
}

// ============================================================================
// Queue
// ============================================================================

/**
 * Runbook execution queue
 *
 * Jobs are processed with:
 * - No automatic retry (executor has its own retry logic)
 * - Failed jobs kept for debugging
 * - Completed jobs removed
 */
export const runbookQueue = new Queue<RunbookJobData>('runbook', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
    attempts: 1 // No retry at job level - executor has its own retry
  }
});

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Schedule a runbook for execution.
 *
 * @param executionId - ID of the RunbookExecution record
 * @param runbookId - ID of the runbook to execute
 * @param incidentId - Optional incident ID
 * @returns Job ID (same as executionId)
 */
export async function scheduleRunbook(
  executionId: string,
  runbookId: string,
  incidentId?: string
): Promise<string> {
  await runbookQueue.add(
    'execute',
    {
      executionId,
      runbookId,
      incidentId
    },
    {
      jobId: executionId // Use execution ID as job ID for idempotency
    }
  );

  logger.info(
    { executionId, runbookId, incidentId },
    'Scheduled runbook for execution'
  );

  return executionId;
}

/**
 * Cancel a pending runbook execution.
 *
 * @param executionId - ID of the execution to cancel
 * @returns True if job was found and removed
 */
export async function cancelRunbook(executionId: string): Promise<boolean> {
  try {
    const job = await runbookQueue.getJob(executionId);
    if (job) {
      await job.remove();
      logger.info({ executionId }, 'Cancelled runbook execution');
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ executionId, error }, 'Failed to cancel runbook execution');
    return false;
  }
}

/**
 * Get runbook queue statistics for health checks.
 *
 * @returns Queue metrics
 */
export async function getRunbookQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    runbookQueue.getWaitingCount(),
    runbookQueue.getActiveCount(),
    runbookQueue.getDelayedCount(),
    runbookQueue.getFailedCount()
  ]);

  return { waiting, active, delayed, failed };
}
