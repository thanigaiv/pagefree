import {
  SNSClient,
  PublishCommand,
  CreatePlatformEndpointCommand
} from '@aws-sdk/client-sns';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { pushService, type PushSubscription, type WebPushPayload } from '../../push.service.js';

export class PushChannel extends BaseChannel {
  name = 'push';
  private snsClient: SNSClient;

  constructor() {
    super();
    const config: any = { region: env.AWS_REGION };
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      };
    }
    this.snsClient = new SNSClient(config);
  }

  supportsInteractivity(): boolean {
    return false;  // Push notifications trigger app open
  }

  async send(payload: NotificationPayload): Promise<ChannelDeliveryResult> {
    return this.withErrorHandling(async () => {
      // Get user's registered devices with pushSubscription for web
      const devices = await prisma.userDevice.findMany({
        where: { userId: payload.userId },
        select: {
          id: true,
          platform: true,
          deviceToken: true,
          pushSubscription: true,
        }
      });

      if (devices.length === 0) {
        return { success: false, error: 'No registered devices for user' };
      }

      const isCritical = payload.priority === 'CRITICAL' || payload.priority === 'HIGH';
      const results: string[] = [];
      const errors: string[] = [];

      for (const device of devices) {
        try {
          if (device.platform === 'web') {
            // Handle web push via web-push library with VAPID
            const webResult = await this.sendWebPush(device, payload, isCritical);
            if (webResult.success) {
              results.push(`web:${webResult.id || 'sent'}`);
            } else if (webResult.expired) {
              // Subscription expired - remove it
              await this.handleExpiredWebSubscription(device.deviceToken);
              errors.push(`web: Subscription expired (removed)`);
            } else {
              errors.push(`web: ${webResult.error}`);
            }
          } else {
            // Handle iOS/Android via SNS (existing behavior)
            const snsResult = await this.sendSNSPush(device, payload, isCritical);
            if (snsResult.success) {
              results.push(`${device.platform}:${snsResult.id}`);
            } else {
              errors.push(`${device.platform}: ${snsResult.error}`);
            }
          }

          // Update last seen
          await prisma.userDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() }
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${device.platform}: ${msg}`);
          logger.warn(
            { channel: 'push', platform: device.platform, incidentId: payload.incidentId, error: msg },
            'Push notification failed for device'
          );
        }
      }

      if (results.length === 0) {
        return { success: false, error: errors.join('; ') };
      }

      return {
        success: true,
        providerId: results.join(','),
        deliveredAt: new Date()
      };
    }, { incidentId: payload.incidentId, userId: payload.userId });
  }

  // Send web push notification using web-push library
  private async sendWebPush(
    device: { id: string; pushSubscription: unknown; deviceToken: string },
    payload: NotificationPayload,
    _isCritical: boolean // Reserved for future critical-specific behavior
  ): Promise<{ success: boolean; id?: string; error?: string; expired?: boolean }> {
    if (!device.pushSubscription) {
      logger.warn(
        { deviceId: device.id, incidentId: payload.incidentId },
        'Web device missing pushSubscription JSON - cannot send'
      );
      return { success: false, error: 'Missing push subscription data' };
    }

    if (!pushService.isConfigured()) {
      logger.warn('Web push VAPID not configured - skipping web push');
      return { success: false, error: 'VAPID not configured' };
    }

    const subscription = device.pushSubscription as PushSubscription;
    const webPayload: WebPushPayload = {
      title: `[${payload.priority}] ${payload.service}`,
      body: payload.title,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: {
        incidentId: payload.incidentId,
        priority: payload.priority,
        action: 'view_incident',
        url: `/incidents/${payload.incidentId}`,
      },
    };

    const result = await pushService.sendNotification(subscription, webPayload);

    if (result.success) {
      logger.info(
        { channel: 'push', platform: 'web', incidentId: payload.incidentId },
        'Web push notification sent'
      );
      return { success: true, id: 'webpush' };
    }

    // Check for expired subscription
    if (result.statusCode === 410 || result.statusCode === 404) {
      return { success: false, expired: true, error: 'Subscription expired' };
    }

    return { success: false, error: result.error };
  }

  // Handle expired web push subscription
  private async handleExpiredWebSubscription(endpoint: string): Promise<void> {
    try {
      await pushService.removeExpiredSubscription(endpoint);
    } catch (error) {
      logger.error(
        { endpoint: endpoint.slice(0, 50), error },
        'Failed to remove expired web push subscription'
      );
    }
  }

  // Send SNS push notification for iOS/Android
  private async sendSNSPush(
    device: { id: string; platform: string; deviceToken: string },
    payload: NotificationPayload,
    isCritical: boolean
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const endpointArn = await this.getOrCreateEndpoint(device);
      const message = this.buildPushMessage(payload, device.platform, isCritical);

      const result = await this.snsClient.send(new PublishCommand({
        TargetArn: endpointArn,
        Message: JSON.stringify(message),
        MessageStructure: 'json'
      }));

      if (result.MessageId) {
        logger.info(
          { channel: 'push', platform: device.platform, incidentId: payload.incidentId, messageId: result.MessageId },
          'Push notification sent'
        );
        return { success: true, id: result.MessageId };
      }

      return { success: false, error: 'No message ID returned' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    }
  }

  // Get existing endpoint or create new one (for iOS/Android)
  private async getOrCreateEndpoint(device: { platform: string; deviceToken: string }): Promise<string> {
    const platformAppArn = device.platform === 'ios'
      ? env.SNS_PLATFORM_APP_ARN_IOS
      : env.SNS_PLATFORM_APP_ARN_ANDROID;

    if (!platformAppArn) {
      throw new Error(`Platform app ARN not configured for ${device.platform}`);
    }

    const result = await this.snsClient.send(new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformAppArn,
      Token: device.deviceToken
    }));

    if (!result.EndpointArn) {
      throw new Error('Failed to create SNS endpoint');
    }

    return result.EndpointArn;
  }

  // Build platform-specific push payload (for iOS/Android via SNS)
  // Per user decision: critical incidents override DND
  private buildPushMessage(payload: NotificationPayload, platform: string, isCritical: boolean): any {
    const title = `[${payload.priority}] ${payload.service}`;
    const body = payload.title;

    const message: any = {
      default: body
    };

    if (platform === 'ios') {
      // iOS-specific payload with critical alert (per user decision)
      message.APNS = JSON.stringify({
        aps: {
          alert: {
            title: title,
            body: body,
            subtitle: `Incident #${payload.incidentId.slice(-8)}`
          },
          sound: isCritical ? {
            critical: 1,                    // iOS critical alert
            name: 'critical-alert.wav',
            volume: 1.0
          } : 'default',
          badge: 1,
          'interruption-level': isCritical ? 'critical' : 'active',
          'relevance-score': isCritical ? 1.0 : 0.5
        },
        incidentId: payload.incidentId,
        priority: payload.priority,
        action: 'view_incident'
      });
    } else if (platform === 'android') {
      // Android-specific payload with high-priority channel (per user decision)
      message.GCM = JSON.stringify({
        notification: {
          title: title,
          body: body,
          channel_id: isCritical ? 'critical_alerts' : 'default',
          priority: isCritical ? 'high' : 'default',
          sound: 'default',
          click_action: 'VIEW_INCIDENT'
        },
        data: {
          incidentId: payload.incidentId,
          priority: payload.priority,
          service: payload.service
        },
        android: {
          priority: isCritical ? 'high' : 'normal',
          notification: {
            channel_id: isCritical ? 'critical_alerts' : 'default',
            notification_priority: isCritical ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT'
          }
        }
      });
    }

    return message;
  }
}

export const pushChannel = new PushChannel();
