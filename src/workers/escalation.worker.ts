import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { escalationService } from '../services/escalation.service.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { EscalationJobData } from '../queues/escalation.queue.js';

let worker: Worker<EscalationJobData> | null = null;

async function processEscalationJob(job: Job<EscalationJobData>): Promise<void> {
  const { incidentId, toLevel, repeatNumber } = job.data;

  logger.info(
    { jobId: job.id, incidentId, toLevel, repeatNumber },
    'Processing escalation job'
  );

  try {
    // Mark job as executing in database
    await prisma.escalationJob.updateMany({
      where: { bullJobId: job.id! },
      data: { executedAt: new Date() }
    });

    // Process escalation
    await escalationService.processEscalation(incidentId, toLevel, repeatNumber);

    // Mark job as completed
    await prisma.escalationJob.updateMany({
      where: { bullJobId: job.id! },
      data: { completed: true }
    });

    logger.info(
      { jobId: job.id, incidentId },
      'Escalation job completed'
    );
  } catch (error) {
    logger.error(
      { jobId: job.id, incidentId, error },
      'Escalation job failed'
    );
    throw error; // Let BullMQ handle retry
  }
}

export async function startEscalationWorker(): Promise<void> {
  if (worker) {
    logger.warn('Escalation worker already running');
    return;
  }

  worker = new Worker<EscalationJobData>(
    'escalation',
    processEscalationJob,
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5, // Process up to 5 escalations in parallel
      limiter: {
        max: 100, // Max 100 jobs per minute (prevent runaway)
        duration: 60000
      }
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Escalation job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'Escalation job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Escalation worker error');
  });

  logger.info('Escalation worker started');

  // Reconcile any stale escalations
  const rescheduled = await escalationService.reconcileStaleEscalations();
  if (rescheduled > 0) {
    logger.info({ rescheduled }, 'Reconciled stale escalations');
  }
}

export async function stopEscalationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Escalation worker stopped');
  }
}

// Graceful shutdown handler
export function setupGracefulShutdown(): void {
  const signals = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal');
      await stopEscalationWorker();
      process.exit(0);
    });
  });
}
