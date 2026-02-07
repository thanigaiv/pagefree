import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

// Web Push VAPID keys - in production, generate and store securely
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
// VAPID_PRIVATE_KEY is used by the push notification sender (not implemented yet)
// const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

class PushService {
  // Get VAPID public key for client
  getVapidPublicKey(): string {
    if (!VAPID_PUBLIC_KEY) {
      logger.warn('VAPID_PUBLIC_KEY not configured');
    }
    return VAPID_PUBLIC_KEY;
  }

  // Store push subscription for user
  async subscribe(
    userId: string,
    subscription: PushSubscription,
    userAgent?: string
  ): Promise<void> {
    // Generate unique ID for this subscription based on endpoint
    const subscriptionId = crypto
      .createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 32);

    // Store in UserDevice table with platform "web"
    await prisma.userDevice.upsert({
      where: {
        userId_deviceToken: {
          userId,
          deviceToken: subscription.endpoint
        }
      },
      create: {
        id: subscriptionId,
        userId,
        platform: 'web',
        deviceToken: subscription.endpoint,
        deviceName: userAgent ? this.parseDeviceName(userAgent) : 'Web Browser',
        lastSeenAt: new Date(),
      },
      update: {
        deviceToken: subscription.endpoint,
        deviceName: userAgent ? this.parseDeviceName(userAgent) : 'Web Browser',
        lastSeenAt: new Date(),
      },
    });

    // Store the full subscription details (endpoint + keys) in a JSON field
    // We'll need to add this to the schema or store separately
    // For now, we'll store it in a separate table or update UserDevice to have a metadata field

    logger.info({ userId, subscriptionId }, 'Web push subscription stored');
  }

  // Parse device name from user agent
  private parseDeviceName(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    return 'Web Browser';
  }

  // Remove push subscription
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await prisma.userDevice.deleteMany({
      where: {
        userId,
        deviceToken: endpoint,
        platform: 'web',
      },
    });

    logger.info({ userId, endpoint }, 'Web push subscription removed');
  }

  // Get user's active web push subscriptions
  async getSubscriptions(userId: string) {
    return prisma.userDevice.findMany({
      where: {
        userId,
        platform: 'web',
      },
      select: {
        id: true,
        deviceName: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }
}

export const pushService = new PushService();
