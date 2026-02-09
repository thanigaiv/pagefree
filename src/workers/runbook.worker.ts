/**
 * Runbook BullMQ Worker
 *
 * Processes runbook execution jobs from the queue.
 * Follows workflow.worker.ts pattern for consistency.
 *
 * @module workers/runbook.worker
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { runbookExecutor } from '../services/runbook/runbook-executor.service.js';
import type { RunbookJobData } from '../queues/runbook.queue.js';

// ============================================================================
// Worker State
// ============================================================================

let worker: Worker<RunbookJobData> | null = null;

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a runbook execution job
 */
async function processRunbookJob(job: Job<RunbookJobData>): Promise<void> {
  const { executionId, runbookId, incidentId } = job.data;

  logger.info(
    { executionId, runbookId, incidentId, jobId: job.id },
    'Processing runbook execution job'
  );

  try {
    const result = await runbookExecutor.execute(executionId);

    if (!result.success) {
      logger.warn(
        { executionId, runbookId, error: result.error },
        'Runbook execution completed with failure'
      );
      // Don't throw - failure is recorded in execution record
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { executionId, runbookId, error: errorMessage },
      'Runbook job processing error'
    );
    // Re-throw to mark job as failed (for debugging)
    throw error;
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Start the runbook worker.
 *
 * - Concurrency: 5 (process up to 5 runbooks in parallel)
 */
export async function startRunbookWorker(): Promise<void> {
  if (worker) {
    logger.warn('Runbook worker already running');
    return;
  }

  worker = new Worker<RunbookJobData>(
    'runbook',
    processRunbookJob,
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5 // Process up to 5 runbooks in parallel
    }
  );

  // Event handlers for logging
  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, executionId: job.data.executionId },
      'Runbook job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, executionId: job?.data?.executionId, error: error.message },
      'Runbook job failed'
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Runbook worker error');
  });

  logger.info('Runbook worker started');
}

/**
 * Stop the runbook worker gracefully.
 */
export async function stopRunbookWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Runbook worker stopped');
  }
}
