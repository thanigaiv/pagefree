/**
 * Workflow BullMQ Queue
 *
 * Manages workflow execution jobs with cycle detection support.
 * Follows escalation.queue.ts pattern for consistency.
 */

import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Workflow job data passed to the worker
 */
export interface WorkflowJobData {
  /** ID of the WorkflowExecution record */
  executionId: string;
  /** ID of the incident triggering the workflow */
  incidentId: string;
  /** ID of the workflow being executed */
  workflowId: string;
  /** How the workflow was triggered */
  triggeredBy: 'event' | 'manual';
  /** Chain of workflow IDs for cycle detection */
  executionChain: string[];
}

// ============================================================================
// Queue
// ============================================================================

/**
 * Workflow execution queue
 *
 * Jobs are processed with:
 * - No automatic retry (actions have their own retry logic)
 * - Failed jobs kept for debugging
 * - Completed jobs removed
 */
export const workflowQueue = new Queue<WorkflowJobData>('workflow', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
    attempts: 1 // No retry at job level - actions have their own retry
  }
});

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Schedule a workflow for execution.
 *
 * @param executionId - ID of the WorkflowExecution record
 * @param incidentId - ID of the triggering incident
 * @param workflowId - ID of the workflow to execute
 * @param triggeredBy - How the workflow was triggered
 * @param executionChain - Chain of workflow IDs for cycle detection
 * @returns Job ID (same as executionId)
 */
export async function scheduleWorkflow(
  executionId: string,
  incidentId: string,
  workflowId: string,
  triggeredBy: 'event' | 'manual',
  executionChain: string[] = []
): Promise<string> {
  await workflowQueue.add(
    'execute',
    {
      executionId,
      incidentId,
      workflowId,
      triggeredBy,
      executionChain
    },
    {
      jobId: executionId // Use execution ID as job ID for idempotency
    }
  );

  logger.info(
    { executionId, incidentId, workflowId, triggeredBy, chainDepth: executionChain.length },
    'Scheduled workflow for execution'
  );

  return executionId;
}

/**
 * Cancel a pending workflow execution.
 *
 * @param executionId - ID of the execution to cancel
 * @returns True if job was found and removed
 */
export async function cancelWorkflow(executionId: string): Promise<boolean> {
  try {
    const job = await workflowQueue.getJob(executionId);
    if (job) {
      await job.remove();
      logger.info({ executionId }, 'Cancelled workflow execution');
      return true;
    }
    return false;
  } catch (error) {
    logger.error({ executionId, error }, 'Failed to cancel workflow execution');
    return false;
  }
}

/**
 * Get workflow queue statistics for health checks.
 *
 * @returns Queue metrics
 */
export async function getWorkflowQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    workflowQueue.getWaitingCount(),
    workflowQueue.getActiveCount(),
    workflowQueue.getDelayedCount(),
    workflowQueue.getFailedCount()
  ]);

  return { waiting, active, delayed, failed };
}
