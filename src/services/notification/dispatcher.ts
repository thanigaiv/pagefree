import { prisma } from '../../config/database.js';
import { notificationQueue, type NotificationJobData } from '../../queues/notification.queue.js';
import { deliveryTracker } from './delivery-tracker.js';
import { auditService } from '../audit.service.js';
import { logger } from '../../config/logger.js';
import type { NotificationPayload, ChannelEscalationConfig } from './types.js';

// Per user decision: Hybrid parallel/sequential delivery
// Primary (push, email, slack) = parallel
// Secondary (sms) = if primary fails
// Fallback (voice) = if secondary fails
const CHANNEL_TIERS: ChannelEscalationConfig = {
  primary: ['email', 'slack', 'push'],
  secondary: ['sms'],
  fallback: ['voice']
};

// Per user decision: 5 attempts over 10 minutes with exponential backoff
// 30s, 1m, 2m, 4m, ~3m = total ~10 minutes
const RETRY_CONFIG = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 30000  // 30 seconds base
  }
};

interface DispatchOptions {
  escalationLevel?: number;
  channelsOverride?: string[];  // Force specific channels
  skipTiers?: boolean;          // Send all enabled channels at once
}

class NotificationDispatcher {
  // Dispatch notification for incident to user
  async dispatch(
    incidentId: string,
    userId: string,
    type: 'new_incident' | 'escalation' | 'acknowledgment' | 'resolution',
    options: DispatchOptions = {}
  ): Promise<{ queued: number; channels: string[] }> {
    // Get incident and user data
    const [incident, user] = await Promise.all([
      prisma.incident.findUnique({
        where: { id: incidentId },
        include: {
          team: { select: { id: true, name: true, slackChannel: true } },
          alerts: { take: 1, orderBy: { triggeredAt: 'desc' } }
        }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          notificationPreferences: { where: { enabled: true }, orderBy: { priority: 'asc' } },
          slackConnection: { select: { isActive: true } },
          teamsConnection: { select: { isActive: true } }
        }
      })
    ]);

    if (!incident || !user) {
      throw new Error(`Incident or user not found: ${incidentId}, ${userId}`);
    }

    // Determine which channels to use
    let channels: string[];

    if (options.channelsOverride) {
      channels = options.channelsOverride;
    } else {
      // Get user's enabled channels from preferences
      channels = user.notificationPreferences.map(p => p.channel.toLowerCase());

      // Filter out channels user doesn't have configured
      channels = channels.filter(c => {
        if (c === 'slack' && !user.slackConnection?.isActive) return false;
        if (c === 'teams' && !user.teamsConnection?.isActive) return false;
        if (c === 'sms' && !user.phone) return false;
        if (c === 'voice' && !user.phone) return false;
        return true;
      });
    }

    if (channels.length === 0) {
      logger.warn({ incidentId, userId }, 'No notification channels available for user');
      return { queued: 0, channels: [] };
    }

    // Build payload
    const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
    const payload: NotificationPayload = {
      incidentId: incident.id,
      userId: user.id,
      title: incident.alerts[0]?.title || `Incident #${incident.id.slice(-8)}`,
      body: incident.alerts[0]?.description || 'No description available',
      priority: incident.priority as any,
      service: incident.alerts[0]?.source || 'unknown',
      teamName: incident.team.name,
      alertCount: incident.alertCount,
      escalationLevel: options.escalationLevel,
      dashboardUrl,
      triggeredAt: incident.createdAt
    };

    // Determine tier for each channel
    const primaryChannels = options.skipTiers
      ? channels
      : (this.groupByTier(channels).primary || []);
    const queuedChannels: string[] = [];

    for (const channel of primaryChannels) {
      // Create tracking entry
      const logId = await deliveryTracker.trackQueued(
        incidentId,
        userId,
        channel,
        options.escalationLevel
      );

      // Queue job
      const jobData: NotificationJobData = {
        userId,
        incidentId,
        type,
        channels: [channel],
        // Extended data for worker
        payload,
        logId,
        tier: this.getChannelTier(channel)
      };

      await notificationQueue.add(`notify-${channel}`, jobData, {
        ...RETRY_CONFIG,
        priority: incident.priority === 'CRITICAL' ? 1 : 10
      });

      queuedChannels.push(channel);
    }

    // Audit log
    await auditService.log({
      action: 'notification.dispatched',
      userId,
      teamId: incident.team.id,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO',
      metadata: {
        type,
        channels: queuedChannels,
        escalationLevel: options.escalationLevel
      }
    });

    logger.info(
      { incidentId, userId, type, channels: queuedChannels, escalationLevel: options.escalationLevel },
      'Notifications dispatched'
    );

    return { queued: queuedChannels.length, channels: queuedChannels };
  }

  // Group channels by tier for escalation
  private groupByTier(channels: string[]): { primary?: string[]; secondary?: string[]; fallback?: string[] } {
    return {
      primary: channels.filter(c => CHANNEL_TIERS.primary.includes(c)),
      secondary: channels.filter(c => CHANNEL_TIERS.secondary.includes(c)),
      fallback: channels.filter(c => CHANNEL_TIERS.fallback.includes(c))
    };
  }

  // Get tier for a channel
  private getChannelTier(channel: string): 'primary' | 'secondary' | 'fallback' {
    if (CHANNEL_TIERS.primary.includes(channel)) return 'primary';
    if (CHANNEL_TIERS.secondary.includes(channel)) return 'secondary';
    return 'fallback';
  }

  // Escalate to next tier of channels (called when primary fails)
  async escalateToNextTier(
    incidentId: string,
    userId: string,
    failedTier: 'primary' | 'secondary',
    payload: NotificationPayload
  ): Promise<void> {
    const nextTier = failedTier === 'primary' ? 'secondary' : 'fallback';
    const nextChannels = nextTier === 'secondary' ? CHANNEL_TIERS.secondary : CHANNEL_TIERS.fallback;

    // Get user's enabled channels in next tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        notificationPreferences: { where: { enabled: true } }
      }
    });

    if (!user) return;

    const userChannels = user.notificationPreferences.map(p => p.channel.toLowerCase());
    const channelsToTry = nextChannels.filter(c => userChannels.includes(c));

    if (channelsToTry.length === 0) {
      logger.warn({ incidentId, userId, failedTier }, 'No channels available in next tier');
      return;
    }

    logger.info(
      { incidentId, userId, failedTier, nextTier, channels: channelsToTry },
      'Escalating to next notification tier'
    );

    // Queue jobs for next tier
    for (const channel of channelsToTry) {
      const logId = await deliveryTracker.trackQueued(
        incidentId,
        userId,
        channel,
        payload.escalationLevel
      );

      await notificationQueue.add(`notify-${channel}`, {
        userId,
        incidentId,
        type: 'escalation',
        channels: [channel],
        payload,
        logId,
        tier: nextTier
      }, RETRY_CONFIG);
    }
  }
}

export const notificationDispatcher = new NotificationDispatcher();
export const dispatchNotification = notificationDispatcher.dispatch.bind(notificationDispatcher);
