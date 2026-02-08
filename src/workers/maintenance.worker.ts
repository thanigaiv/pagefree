import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { logger } from '../config/logger.js';
import type { MaintenanceJobData } from '../queues/maintenance.queue.js';

let worker: Worker<MaintenanceJobData> | null = null;

/**
 * Process a maintenance window job (start or end action).
 */
async function processMaintenance(job: Job<MaintenanceJobData>): Promise<void> {
  const { maintenanceId, action } = job.data;

  logger.info(
    { jobId: job.id, maintenanceId, action },
    'Processing maintenance job'
  );

  try {
    if (action === 'start') {
      await maintenanceService.startMaintenance(maintenanceId);
    } else if (action === 'end') {
      await maintenanceService.completeMaintenance(maintenanceId);
    } else {
      logger.warn({ maintenanceId, action }, 'Unknown maintenance action');
    }

    logger.info(
      { jobId: job.id, maintenanceId, action },
      'Maintenance job completed'
    );
  } catch (error) {
    logger.error(
      { jobId: job.id, maintenanceId, action, error },
      'Maintenance job failed'
    );
    throw error; // Let BullMQ handle retry
  }
}

/**
 * Start the maintenance worker.
 */
export async function startMaintenanceWorker(): Promise<void> {
  if (worker) {
    logger.warn('Maintenance worker already running');
    return;
  }

  worker = new Worker<MaintenanceJobData>(
    'maintenance',
    processMaintenance,
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5 // Process up to 5 maintenance jobs in parallel
    }
  );

  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, maintenanceId: job.data.maintenanceId, action: job.data.action },
      'Maintenance job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, maintenanceId: job?.data.maintenanceId, error: error.message },
      'Maintenance job failed'
    );
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Maintenance worker error');
  });

  logger.info('Maintenance worker started');
}

/**
 * Stop the maintenance worker gracefully.
 */
export async function stopMaintenanceWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Maintenance worker stopped');
  }
}

// Export worker reference for external access
export const maintenanceWorker = {
  start: startMaintenanceWorker,
  stop: stopMaintenanceWorker,
  get isRunning() {
    return worker !== null;
  }
};
