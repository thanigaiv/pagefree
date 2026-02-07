import { Queue } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import type { NotificationPayload } from '../services/notification/types.js';

// Job data interfaces
export interface NotificationJobData {
  userId: string;
  incidentId: string;
  type: 'new_incident' | 'escalation' | 'acknowledgment' | 'resolution';
  channels?: string[]; // Override user preferences
  // Extended fields for worker
  payload?: NotificationPayload;
  logId?: string;
  tier?: 'primary' | 'secondary' | 'fallback';
}

// Create notification queue (used by Phase 5)
export const notificationQueue = new Queue<NotificationJobData>('notification', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 5, // More retries for notifications (critical path)
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// Queue notification job
export async function queueNotification(data: NotificationJobData): Promise<string> {
  const job = await notificationQueue.add('notify', data);
  return job.id!;
}

// Get queue metrics
export async function getNotificationQueueStats() {
  const [waiting, active, delayed, failed] = await Promise.all([
    notificationQueue.getWaitingCount(),
    notificationQueue.getActiveCount(),
    notificationQueue.getDelayedCount(),
    notificationQueue.getFailedCount()
  ]);

  return { waiting, active, delayed, failed };
}
