import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../config/redis.js';
import { deliveryTracker } from '../services/notification/delivery-tracker.js';
import { notificationDispatcher } from '../services/notification/dispatcher.js';
import { logger } from '../config/logger.js';
import type { NotificationJobData } from '../queues/notification.queue.js';

// Import channel implementations
import { emailChannel } from '../services/notification/channels/email.channel.js';
import { smsChannel } from '../services/notification/channels/sms.channel.js';
import { slackChannel } from '../services/notification/channels/slack.channel.js';
import { teamsChannel } from '../services/notification/channels/teams.channel.js';
import { pushChannel } from '../services/notification/channels/push.channel.js';
import { voiceChannel } from '../services/notification/channels/voice.channel.js';

// Channel registry
const channels: Record<string, any> = {
  email: emailChannel,
  sms: smsChannel,
  slack: slackChannel,
  teams: teamsChannel,
  push: pushChannel,
  voice: voiceChannel
};

let worker: Worker | null = null;

export async function startNotificationWorker(): Promise<void> {
  worker = new Worker<NotificationJobData>(
    'notification',
    async (job: Job<NotificationJobData>) => {
      const { payload, logId } = job.data;
      const channel = job.data.channels?.[0];  // Each job handles one channel

      if (!payload || !logId || !channel) {
        throw new Error('Missing required job data: payload, logId, or channel');
      }

      logger.info(
        { jobId: job.id, channel, incidentId: payload.incidentId, attempt: job.attemptsMade + 1 },
        'Processing notification job'
      );

      // Update status to SENDING
      await deliveryTracker.trackSending(logId);

      // Get channel implementation
      const channelImpl = channels[channel];
      if (!channelImpl) {
        throw new Error(`Unknown channel: ${channel}`);
      }

      // Send notification
      const result = await channelImpl.send(payload);

      if (result.success) {
        // Track successful send
        await deliveryTracker.trackSent(logId, result.providerId || 'unknown');

        logger.info(
          { jobId: job.id, channel, incidentId: payload.incidentId, providerId: result.providerId },
          'Notification sent successfully'
        );

        return result;
      } else {
        // Throw to trigger retry
        throw new Error(result.error || 'Send failed');
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 10,  // Process up to 10 notifications concurrently
      limiter: {
        max: 100,       // Max 100 notifications per minute (prevent rate limiting)
        duration: 60000
      }
    }
  );

  // Handle job completion
  worker.on('completed', async (job: Job<NotificationJobData>) => {
    logger.debug({ jobId: job.id, channel: job.data.channels?.[0] }, 'Notification job completed');
  });

  // Handle job failure (after all retries)
  worker.on('failed', async (job: Job<NotificationJobData> | undefined, err: Error) => {
    if (!job) return;

    const { payload, logId, tier, channels } = job.data;
    const channel = channels?.[0];

    if (!payload || !logId || !channel) return;

    logger.error(
      { jobId: job.id, channel, incidentId: payload.incidentId, error: err.message, attempts: job.attemptsMade },
      'Notification job failed after all retries'
    );

    // Track permanent failure
    await deliveryTracker.trackFailed(logId, err.message);

    // Check if we should escalate to next tier
    // Per user decision: channel escalation on delivery failure
    if (tier === 'primary') {
      // Check if ALL primary channels failed for this user/incident
      const failedChannels = await deliveryTracker.getFailedChannels(payload.incidentId, payload.userId);
      const primaryChannels = ['email', 'slack', 'push'];

      // If this was the last primary channel to fail, escalate to secondary (SMS)
      if (failedChannels.filter(c => primaryChannels.includes(c)).length >= 2) {
        logger.info({ incidentId: payload.incidentId, userId: payload.userId }, 'Primary channels failed, escalating to SMS');
        await notificationDispatcher.escalateToNextTier(payload.incidentId, payload.userId, 'primary', payload);
      }
    } else if (tier === 'secondary') {
      // SMS failed, escalate to voice
      logger.info({ incidentId: payload.incidentId, userId: payload.userId }, 'SMS failed, escalating to voice');
      await notificationDispatcher.escalateToNextTier(payload.incidentId, payload.userId, 'secondary', payload);
    }

    // Check for total failure (all critical channels failed)
    // Per user decision: permanent failure when email + SMS both fail
    const criticalFailed = await deliveryTracker.checkCriticalChannelsFailed(payload.incidentId, payload.userId);
    if (criticalFailed) {
      logger.error(
        { incidentId: payload.incidentId, userId: payload.userId },
        'CRITICAL: All notification channels failed for user'
      );
      // TODO: Alert ops team (create incident for oncall-platform service)
    }
  });

  // Handle errors
  worker.on('error', (err: Error) => {
    logger.error({ error: err.message }, 'Notification worker error');
  });

  logger.info('Notification worker started');
}

export async function stopNotificationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Notification worker stopped');
  }
}
