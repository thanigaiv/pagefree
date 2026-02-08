import * as crypto from 'crypto';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { SubscriberChannel, NotifyOnEvent } from '../types/statusPage.js';

// Lazy import to avoid circular dependency
let statusNotificationQueue: any;
async function getStatusNotificationQueue() {
  if (!statusNotificationQueue) {
    const module = await import('../queues/statusNotification.queue.js');
    statusNotificationQueue = module.statusNotificationQueue;
  }
  return statusNotificationQueue;
}

/**
 * Options for subscription creation/update.
 */
interface SubscriptionOptions {
  componentIds?: string[];
  notifyOn?: NotifyOnEvent[];
}

/**
 * Result of subscribe operation.
 */
interface SubscribeResult {
  subscriber: {
    id: string;
    statusPageId: string;
    channel: string;
    destination: string;
    componentIds: string[];
    notifyOn: string[];
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    verifyToken: string | null;
  };
  requiresVerification: boolean;
}

/**
 * Service for managing status page subscribers.
 * Handles subscription, verification, and preference management.
 */
class StatusSubscriberService {
  /**
   * Subscribe to a status page.
   * For EMAIL subscribers, generates a verification token and queues verification email.
   *
   * @param statusPageId - ID of the status page
   * @param channel - Subscriber channel (EMAIL, SLACK, WEBHOOK)
   * @param destination - Email address, webhook URL, or Slack channel
   * @param options - Optional subscription preferences
   * @returns Subscriber and whether verification is required
   */
  async subscribe(
    statusPageId: string,
    channel: SubscriberChannel,
    destination: string,
    options: SubscriptionOptions = {}
  ): Promise<SubscribeResult> {
    // Check for existing subscription
    const existing = await prisma.statusSubscriber.findFirst({
      where: {
        statusPageId,
        channel,
        destination,
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new Error('Already subscribed');
      }

      // Reactivate inactive subscription
      const reactivated = await prisma.statusSubscriber.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          componentIds: options.componentIds ?? existing.componentIds,
          notifyOn: options.notifyOn ?? existing.notifyOn,
        },
      });

      logger.info(
        { subscriberId: reactivated.id, statusPageId, channel },
        'Reactivated status subscriber'
      );

      return {
        subscriber: reactivated,
        requiresVerification: channel === 'EMAIL' && !reactivated.isVerified,
      };
    }

    // Generate verification token for email subscribers
    const requiresVerification = channel === 'EMAIL';
    const verifyToken = requiresVerification
      ? crypto.randomBytes(32).toString('hex')
      : null;

    // Create new subscription
    const subscriber = await prisma.statusSubscriber.create({
      data: {
        statusPageId,
        channel,
        destination,
        componentIds: options.componentIds ?? [],
        notifyOn: options.notifyOn ?? ['degraded', 'outage', 'maintenance', 'resolved'],
        isVerified: !requiresVerification,
        verifyToken,
      },
    });

    logger.info(
      { subscriberId: subscriber.id, statusPageId, channel, requiresVerification },
      'Created status subscriber'
    );

    // Queue verification email for email subscribers
    if (requiresVerification && verifyToken) {
      await this.sendVerificationEmail(subscriber, verifyToken);
    }

    return { subscriber, requiresVerification };
  }

  /**
   * Verify a subscriber's email address using the verification token.
   *
   * @param token - Verification token from email link
   * @returns True if verification succeeded, false if token not found
   */
  async verify(token: string): Promise<boolean> {
    const subscriber = await prisma.statusSubscriber.findFirst({
      where: { verifyToken: token },
    });

    if (!subscriber) {
      logger.warn({ token: token.substring(0, 8) + '...' }, 'Invalid verification token');
      return false;
    }

    await prisma.statusSubscriber.update({
      where: { id: subscriber.id },
      data: {
        isVerified: true,
        verifyToken: null,
      },
    });

    logger.info(
      { subscriberId: subscriber.id, statusPageId: subscriber.statusPageId },
      'Subscriber verified'
    );

    return true;
  }

  /**
   * Deactivate a subscription by subscriber ID.
   *
   * @param subscriberId - ID of the subscriber
   */
  async unsubscribe(subscriberId: string): Promise<void> {
    await prisma.statusSubscriber.update({
      where: { id: subscriberId },
      data: { isActive: false },
    });

    logger.info({ subscriberId }, 'Subscriber unsubscribed');
  }

  /**
   * Unsubscribe using a token from unsubscribe link.
   * Uses destination (email) as the lookup key.
   *
   * @param statusPageId - ID of the status page
   * @param destination - Email address or destination to unsubscribe
   * @returns True if unsubscribed, false if not found
   */
  async unsubscribeByDestination(
    statusPageId: string,
    destination: string
  ): Promise<boolean> {
    const subscriber = await prisma.statusSubscriber.findFirst({
      where: {
        statusPageId,
        destination,
        isActive: true,
      },
    });

    if (!subscriber) {
      return false;
    }

    await this.unsubscribe(subscriber.id);
    return true;
  }

  /**
   * Update subscriber preferences.
   *
   * @param subscriberId - ID of the subscriber
   * @param options - New preferences
   * @returns Updated subscriber
   */
  async updatePreferences(
    subscriberId: string,
    options: SubscriptionOptions
  ) {
    const updateData: Record<string, unknown> = {};

    if (options.componentIds !== undefined) {
      updateData.componentIds = options.componentIds;
    }

    if (options.notifyOn !== undefined) {
      updateData.notifyOn = options.notifyOn;
    }

    const subscriber = await prisma.statusSubscriber.update({
      where: { id: subscriberId },
      data: updateData,
    });

    logger.info(
      { subscriberId, updates: Object.keys(updateData) },
      'Updated subscriber preferences'
    );

    return subscriber;
  }

  /**
   * List all active subscribers for a status page.
   *
   * @param statusPageId - ID of the status page
   * @returns List of active subscribers
   */
  async listByStatusPage(statusPageId: string) {
    return prisma.statusSubscriber.findMany({
      where: {
        statusPageId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get active, verified subscribers that should receive a notification.
   * Filters by component and notification type.
   *
   * @param statusPageId - ID of the status page
   * @param componentId - ID of the affected component
   * @param notifyType - Type of notification (degraded, outage, maintenance, resolved)
   * @returns List of subscribers to notify
   */
  async getActiveSubscribersForNotification(
    statusPageId: string,
    componentId: string,
    notifyType: string
  ) {
    // Get all active, verified subscribers for this status page
    const subscribers = await prisma.statusSubscriber.findMany({
      where: {
        statusPageId,
        isActive: true,
        isVerified: true,
      },
    });

    // Filter by component and notification type
    return subscribers.filter((subscriber) => {
      // Check if subscriber wants this notification type
      if (!subscriber.notifyOn.includes(notifyType)) {
        return false;
      }

      // Check if subscriber cares about this component
      // Empty componentIds means all components
      if (subscriber.componentIds.length > 0) {
        return subscriber.componentIds.includes(componentId);
      }

      return true;
    });
  }

  /**
   * Send verification email to a new subscriber.
   */
  private async sendVerificationEmail(
    subscriber: { id: string; statusPageId: string; destination: string },
    token: string
  ): Promise<void> {
    // Get status page name for the email
    const statusPage = await prisma.statusPage.findUnique({
      where: { id: subscriber.statusPageId },
      select: { name: true },
    });

    const statusPageName = statusPage?.name ?? 'Status Page';
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/status/subscribe/verify?token=${token}`;

    // Queue verification email
    const queue = await getStatusNotificationQueue();
    await queue.add('verify-email', {
      type: 'verification',
      channel: 'email',
      destination: subscriber.destination,
      data: {
        verifyUrl,
        statusPageName,
      },
    });

    logger.info(
      { subscriberId: subscriber.id, destination: subscriber.destination },
      'Queued verification email'
    );
  }
}

export const statusSubscriberService = new StatusSubscriberService();
