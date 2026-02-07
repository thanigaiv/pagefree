import { prisma } from '../../config/database.js';
import { auditService } from '../audit.service.js';
import { logger } from '../../config/logger.js';

class DeliveryTracker {
  // Create initial notification log entry when job is queued
  async trackQueued(
    incidentId: string,
    userId: string,
    channel: string,
    escalationLevel?: number
  ): Promise<string> {
    const log = await prisma.notificationLog.create({
      data: {
        incidentId,
        userId,
        channel: channel.toUpperCase() as any,
        status: 'QUEUED',
        escalationLevel,
        queuedAt: new Date()
      }
    });

    return log.id;
  }

  // Update status to SENDING when worker picks up job
  async trackSending(logId: string): Promise<void> {
    await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status: 'SENDING',
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 }
      }
    });
  }

  // Update status to SENT when provider accepts message
  async trackSent(logId: string, providerId: string): Promise<void> {
    await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status: 'SENT',
        providerId,
        sentAt: new Date()
      }
    });
  }

  // Update status to DELIVERED when we confirm end-user receipt
  // (typically via provider webhook callback)
  async trackDelivered(logId: string): Promise<void> {
    await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date()
      }
    });
  }

  // Update status to FAILED after all retries exhausted
  async trackFailed(logId: string, error: string): Promise<void> {
    const log = await prisma.notificationLog.update({
      where: { id: logId },
      data: {
        status: 'FAILED',
        error,
        lastAttemptAt: new Date()
      },
      include: {
        incident: { select: { teamId: true } }
      }
    });

    // Audit log for tracking delivery failures (important for reliability)
    await auditService.log({
      action: 'notification.failed',
      teamId: log.incident.teamId,
      resourceType: 'notification',
      resourceId: logId,
      severity: 'WARN',
      metadata: {
        channel: log.channel,
        incidentId: log.incidentId,
        userId: log.userId,
        error,
        attemptCount: log.attemptCount
      }
    });

    logger.warn(
      { logId, channel: log.channel, incidentId: log.incidentId, error, attempts: log.attemptCount },
      'Notification delivery failed after all retries'
    );
  }

  // Get delivery status for an incident across all channels
  async getDeliveryStatus(incidentId: string): Promise<any[]> {
    return prisma.notificationLog.findMany({
      where: { incidentId },
      orderBy: { queuedAt: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
  }

  // Check if critical channels succeeded (for permanent failure determination)
  // Per user decision: permanent failure = email + SMS both fail
  async checkCriticalChannelsFailed(incidentId: string, userId: string): Promise<boolean> {
    const logs = await prisma.notificationLog.findMany({
      where: {
        incidentId,
        userId,
        channel: { in: ['EMAIL', 'SMS'] },
        status: 'FAILED'
      }
    });

    // Both email AND SMS must have failed
    const channels = new Set(logs.map(l => l.channel));
    return channels.has('EMAIL') && channels.has('SMS');
  }

  // Get channels that failed for retry escalation
  async getFailedChannels(incidentId: string, userId: string): Promise<string[]> {
    const logs = await prisma.notificationLog.findMany({
      where: {
        incidentId,
        userId,
        status: 'FAILED'
      },
      select: { channel: true }
    });

    return logs.map(l => l.channel.toLowerCase());
  }

  // Update delivery status from provider webhook
  async updateFromProviderWebhook(
    providerId: string,
    channel: string,
    delivered: boolean,
    error?: string
  ): Promise<void> {
    const log = await prisma.notificationLog.findFirst({
      where: {
        providerId,
        channel: channel.toUpperCase() as any
      }
    });

    if (!log) {
      logger.warn({ providerId, channel }, 'No notification log found for provider webhook');
      return;
    }

    if (delivered) {
      await this.trackDelivered(log.id);
    } else if (error) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          error,
          lastAttemptAt: new Date()
        }
      });
    }
  }
}

export const deliveryTracker = new DeliveryTracker();
