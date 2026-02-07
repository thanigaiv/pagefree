/**
 * Workflow Worker
 *
 * Processes workflow execution jobs from the queue.
 * Handles execution failures with notifications to:
 * - Incident assignee
 * - Workflow creator
 * - Team channel (Slack/Teams)
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { executeWorkflow } from '../services/workflow/workflow-executor.service.js';
import { dispatchNotification } from '../services/notification/index.js';
import type { WorkflowJobData } from '../queues/workflow.queue.js';

// ============================================================================
// Worker State
// ============================================================================

let worker: Worker<WorkflowJobData> | null = null;

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a workflow execution job.
 *
 * 1. Load execution from database with workflow and creator relations
 * 2. Verify execution not already cancelled
 * 3. Load secrets from WorkflowActionSecret
 * 4. Update status to RUNNING
 * 5. Execute workflow
 * 6. Update final status
 * 7. Send failure notifications if execution failed
 */
async function processWorkflowJob(job: Job<WorkflowJobData>): Promise<void> {
  const { executionId, incidentId, workflowId } = job.data;

  logger.info(
    { jobId: job.id, executionId, incidentId, workflowId },
    'Processing workflow job'
  );

  try {
    // Load execution with workflow and creator relations
    const execution = await prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: {
        workflow: {
          include: {
            createdBy: true // Load creator for failure notifications
          }
        }
      }
    });

    if (!execution) {
      logger.error({ executionId }, 'Workflow execution not found');
      return;
    }

    // Check if already cancelled
    if (execution.status === 'CANCELLED') {
      logger.info({ executionId }, 'Workflow execution already cancelled');
      return;
    }

    // Load secrets from WorkflowActionSecret
    const secretRecords = await prisma.workflowActionSecret.findMany({
      where: { workflowId: execution.workflowId }
    });

    const secrets = new Map<string, string>();
    for (const secret of secretRecords) {
      // Note: In production, valueHash would be decrypted here
      // For now, we store plaintext in valueHash (encryption TBD)
      secrets.set(secret.name, secret.valueHash);
    }

    // Update status to RUNNING
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'RUNNING',
        startedAt: new Date()
      }
    });

    // Execute workflow
    const result = await executeWorkflow(execution, secrets);

    // Update final status (executor already updates but ensure consistency)
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: result.status,
        ...(result.status === 'COMPLETED' && { completedAt: new Date() }),
        ...(result.status === 'FAILED' && { failedAt: new Date(), error: result.error }),
        ...(result.status === 'CANCELLED' && { completedAt: new Date(), error: result.error })
      }
    });

    // Send failure notifications if execution failed (per user decision)
    if (result.status === 'FAILED') {
      await sendFailureNotifications(
        execution,
        result.error || 'Workflow execution failed'
      );
    }

    logger.info(
      { jobId: job.id, executionId, status: result.status, duration: result.duration },
      'Workflow job completed'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { jobId: job.id, executionId, error: errorMessage },
      'Workflow job failed'
    );

    // Update status to FAILED
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        error: errorMessage
      }
    });

    throw error; // Let BullMQ mark as failed
  }
}

// ============================================================================
// Failure Notifications
// ============================================================================

/**
 * Send failure notifications per user decision:
 * 1. Notify incident assignee
 * 2. Notify workflow creator
 * 3. Notify team channel (Slack/Teams)
 *
 * All notifications are best-effort - we don't fail if notifications fail.
 */
async function sendFailureNotifications(
  execution: {
    id: string;
    incidentId: string;
    workflowId: string;
    workflow: {
      name: string;
      teamId: string | null;
      createdBy: {
        id: string;
        email: string;
      };
    };
  },
  errorMessage: string
): Promise<void> {
  const { workflow } = execution;

  logger.info(
    { executionId: execution.id, workflowId: execution.workflowId },
    'Sending workflow failure notifications'
  );

  try {
    // Load incident with assignee
    const incident = await prisma.incident.findUnique({
      where: { id: execution.incidentId },
      include: {
        assignedUser: true,
        team: true
      }
    });

    if (!incident) {
      logger.warn({ incidentId: execution.incidentId }, 'Incident not found for failure notification');
      return;
    }

    // Build failure message context
    const failureContext = {
      workflowName: workflow.name,
      errorMessage: errorMessage.substring(0, 500), // Truncate for notification
      executionId: execution.id,
      incidentId: incident.id
    };

    // 1. Notify incident assignee (if assigned)
    if (incident.assignedUser) {
      try {
        await dispatchNotification(
          incident.id,
          incident.assignedUser.id,
          'escalation', // Use escalation type for workflow failures
          {
            skipTiers: true, // Send to all channels at once
            channelsOverride: ['email', 'slack'] // Email and Slack for workflow failures
          }
        );
        logger.debug(
          { userId: incident.assignedUser.id, ...failureContext },
          'Sent failure notification to incident assignee'
        );
      } catch (error) {
        logger.warn(
          { userId: incident.assignedUser.id, error },
          'Failed to notify incident assignee'
        );
      }
    }

    // 2. Notify workflow creator
    if (workflow.createdBy && workflow.createdBy.id !== incident.assignedUser?.id) {
      try {
        await dispatchNotification(
          incident.id,
          workflow.createdBy.id,
          'escalation',
          {
            skipTiers: true,
            channelsOverride: ['email'] // Email only for creator
          }
        );
        logger.debug(
          { userId: workflow.createdBy.id, ...failureContext },
          'Sent failure notification to workflow creator'
        );
      } catch (error) {
        logger.warn(
          { userId: workflow.createdBy.id, error },
          'Failed to notify workflow creator'
        );
      }
    }

    // 3. Notify team channel (if team has Slack channel configured)
    if (incident.team.slackChannel) {
      // Team channel notification would go through Slack/Teams directly
      // For now, we log it - full implementation would use Slack API
      logger.info(
        { teamId: incident.team.id, channel: incident.team.slackChannel, ...failureContext },
        'Would notify team channel about workflow failure'
      );
      // TODO: Implement direct Slack channel message using slackChannel
    }

    logger.info(
      { executionId: execution.id },
      'Workflow failure notifications sent'
    );
  } catch (error) {
    // Best-effort notifications - don't fail the job
    logger.error(
      { executionId: execution.id, error },
      'Failed to send some failure notifications'
    );
  }
}

// ============================================================================
// Worker Lifecycle
// ============================================================================

/**
 * Start the workflow worker.
 *
 * - Concurrency: 5 (process up to 5 workflows in parallel)
 * - Rate limit: 100 jobs/minute (prevent runaway)
 */
export async function startWorkflowWorker(): Promise<void> {
  if (worker) {
    logger.warn('Workflow worker already running');
    return;
  }

  worker = new Worker<WorkflowJobData>(
    'workflow',
    processWorkflowJob,
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5, // Process up to 5 workflows in parallel
      limiter: {
        max: 100, // Max 100 jobs per minute
        duration: 60000
      }
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Workflow job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, error: error.message },
      'Workflow job failed'
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Workflow worker error');
  });

  logger.info('Workflow worker started');
}

/**
 * Stop the workflow worker gracefully.
 */
export async function stopWorkflowWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Workflow worker stopped');
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Setup graceful shutdown handlers for the workflow worker.
 */
export function setupGracefulShutdown(): void {
  const signals = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal for workflow worker');
      await stopWorkflowWorker();
      process.exit(0);
    });
  });
}
