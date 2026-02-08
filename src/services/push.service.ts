import webpush from 'web-push';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

// VAPID configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:oncall@pagefree.com';

// Initialize VAPID details for web-push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    logger.info('VAPID credentials configured for web push');
  } catch (error) {
    logger.error({ error }, 'Failed to configure VAPID credentials');
  }
} else {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    logger.error('VAPID keys not configured - web push notifications will not work');
  } else {
    logger.warn('VAPID keys not configured - web push notifications disabled');
  }
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    incidentId?: string;
    priority?: string;
    action?: string;
    url?: string;
  };
}

interface SendNotificationResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

class PushService {
  // Get VAPID public key for client
  getVapidPublicKey(): string {
    if (!VAPID_PUBLIC_KEY) {
      logger.warn('VAPID_PUBLIC_KEY not configured');
    }
    return VAPID_PUBLIC_KEY;
  }

  // Check if VAPID is configured
  isConfigured(): boolean {
    return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  }

  // Store push subscription for user
  async subscribe(
    userId: string,
    subscription: PushSubscription,
    userAgent?: string
  ): Promise<void> {
    // Validate subscription has required fields
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      throw new Error('Invalid push subscription: missing required fields');
    }

    // Generate unique ID for this subscription based on endpoint
    const subscriptionId = crypto
      .createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 32);

    // Store in UserDevice table with platform "web"
    // Store full PushSubscription in JSON field for web push
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
        pushSubscription: subscription as unknown as object, // Store full subscription
        lastSeenAt: new Date(),
      },
      update: {
        deviceToken: subscription.endpoint,
        deviceName: userAgent ? this.parseDeviceName(userAgent) : 'Web Browser',
        pushSubscription: subscription as unknown as object, // Update subscription
        lastSeenAt: new Date(),
      },
    });

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

  // Send web push notification to a subscription
  async sendNotification(
    subscription: PushSubscription,
    payload: WebPushPayload
  ): Promise<SendNotificationResult> {
    if (!this.isConfigured()) {
      logger.warn('Cannot send web push: VAPID not configured');
      return { success: false, error: 'VAPID not configured' };
    }

    try {
      const result = await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        {
          TTL: 60 * 60, // 1 hour TTL
        }
      );

      logger.info(
        { endpoint: subscription.endpoint.slice(0, 50), statusCode: result.statusCode },
        'Web push notification sent'
      );

      return { success: true, statusCode: result.statusCode };
    } catch (error: any) {
      // Handle common error codes
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription expired or not found - mark for removal
        logger.info(
          { endpoint: subscription.endpoint.slice(0, 50), statusCode: error.statusCode },
          'Web push subscription expired or not found'
        );
        return { success: false, statusCode: error.statusCode, error: 'Subscription expired' };
      }

      if (error.statusCode === 401) {
        logger.error('Web push VAPID authentication failed - check VAPID keys');
        return { success: false, statusCode: 401, error: 'VAPID authentication failed' };
      }

      logger.error(
        { error: error.message, statusCode: error.statusCode },
        'Web push notification failed'
      );
      return { success: false, statusCode: error.statusCode, error: error.message };
    }
  }

  // Send web push notification to a device by ID (looks up subscription from DB)
  async sendToDevice(
    deviceId: string,
    payload: WebPushPayload
  ): Promise<SendNotificationResult> {
    const device = await prisma.userDevice.findUnique({
      where: { id: deviceId },
      select: { pushSubscription: true, platform: true, deviceToken: true },
    });

    if (!device) {
      return { success: false, error: 'Device not found' };
    }

    if (device.platform !== 'web') {
      return { success: false, error: 'Device is not a web push subscription' };
    }

    if (!device.pushSubscription) {
      return { success: false, error: 'No push subscription stored for device' };
    }

    const subscription = device.pushSubscription as unknown as PushSubscription;
    return this.sendNotification(subscription, payload);
  }

  // Remove expired subscription from database
  async removeExpiredSubscription(endpoint: string): Promise<void> {
    const deleted = await prisma.userDevice.deleteMany({
      where: {
        deviceToken: endpoint,
        platform: 'web',
      },
    });

    if (deleted.count > 0) {
      logger.info({ endpoint: endpoint.slice(0, 50), count: deleted.count }, 'Removed expired web push subscription(s)');
    }
  }
}

export const pushService = new PushService();

// Export types for use in other modules
export type { PushSubscription, WebPushPayload, SendNotificationResult };
