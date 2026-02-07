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
      // Get user's registered devices
      const devices = await prisma.userDevice.findMany({
        where: { userId: payload.userId }
      });

      if (devices.length === 0) {
        return { success: false, error: 'No registered devices for user' };
      }

      const isCritical = payload.priority === 'CRITICAL' || payload.priority === 'HIGH';
      const results: string[] = [];
      const errors: string[] = [];

      for (const device of devices) {
        try {
          // Get or create platform endpoint
          const endpointArn = await this.getOrCreateEndpoint(device);

          // Build platform-specific message
          const message = this.buildPushMessage(payload, device.platform, isCritical);

          // Publish to endpoint
          const result = await this.snsClient.send(new PublishCommand({
            TargetArn: endpointArn,
            Message: JSON.stringify(message),
            MessageStructure: 'json'
          }));

          if (result.MessageId) {
            results.push(`${device.platform}:${result.MessageId}`);
          }

          // Update last seen
          await prisma.userDevice.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() }
          });

          logger.info(
            { channel: 'push', platform: device.platform, incidentId: payload.incidentId, messageId: result.MessageId },
            'Push notification sent'
          );
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

  // Get existing endpoint or create new one
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

  // Build platform-specific push payload
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
