import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { incidentService } from '../services/incident.service.js';
import type { TestResolveJobData } from '../queues/test-resolve.queue.js';

export const testResolveWorker = new Worker<TestResolveJobData>(
  'test-resolve',
  async (job: Job<TestResolveJobData>) => {
    const { incidentId, reason } = job.data;

    logger.info({ incidentId, jobId: job.id }, 'Processing auto-resolve job');

    // Get incident - it might have been manually resolved already
    const incident = await incidentService.getById(incidentId);

    if (!incident) {
      logger.warn({ incidentId }, 'Incident not found for auto-resolve');
      return;
    }

    // Only resolve if still OPEN or ACKNOWLEDGED
    if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
      logger.info({ incidentId, status: incident.status }, 'Incident already resolved/closed');
      return;
    }

    // Resolve using system user ID
    await incidentService.resolve(
      incidentId,
      'system', // System user for auto-resolve
      { resolutionNote: reason }
    );

    logger.info({ incidentId }, 'Test incident auto-resolved');
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 5
  }
);

testResolveWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Test resolve job failed');
});
