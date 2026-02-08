import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';

/**
 * Job data interface for status notification jobs.
 */
export interface StatusNotificationJobData {
  type: 'status_change' | 'verification' | 'maintenance';
  subscriberId?: string;
  channel: string;
  destination: string;
  data: {
    // For all types
    statusPageId?: string;
    statusPageName?: string;
    // For status_change
    componentName?: string;
    previousStatus?: string;
    newStatus?: string;
    message?: string;
    // For verification
    verifyUrl?: string;
    // For maintenance
    maintenanceTitle?: string;
    maintenanceStartTime?: string;
    maintenanceEndTime?: string;
  };
}

/**
 * BullMQ queue for status page notification jobs.
 * Handles verification emails, status change notifications, and maintenance alerts.
 */
export const statusNotificationQueue = new Queue<StatusNotificationJobData>(
  'status-notification',
  {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 }, // 30s, 60s, 120s
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 100, // Keep last 100 failed jobs
    },
  }
);

/**
 * Get queue metrics for health checks.
 */
export async function getStatusNotificationQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    statusNotificationQueue.getWaitingCount(),
    statusNotificationQueue.getActiveCount(),
    statusNotificationQueue.getDelayedCount(),
    statusNotificationQueue.getFailedCount(),
  ]);

  return { waiting, active, delayed, failed };
}
