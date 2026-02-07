import twilio from 'twilio';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export class SMSChannel extends BaseChannel {
  name = 'sms';
  private twilioClient: ReturnType<typeof twilio>;

  constructor() {
    super();
    this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  supportsInteractivity(): boolean {
    return true;  // Reply ACK
  }

  async send(payload: NotificationPayload): Promise<ChannelDeliveryResult> {
    return this.withErrorHandling(async () => {
      // Get user phone
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { phone: true, phoneVerified: true }
      });

      if (!user?.phone) {
        return { success: false, error: 'User phone not found' };
      }

      if (!user.phoneVerified) {
        return { success: false, error: 'User phone not verified' };
      }

      // Build SMS message (160 char limit per user decision)
      const body = this.buildSMSMessage(payload);

      const message = await this.twilioClient.messages.create({
        from: env.TWILIO_PHONE_NUMBER,
        to: user.phone,
        body,
        statusCallback: `${env.API_BASE_URL}/webhooks/twilio/sms/status`
      });

      logger.info(
        { channel: 'sms', incidentId: payload.incidentId, userId: payload.userId, messageSid: message.sid },
        'SMS notification sent'
      );

      return {
        success: true,
        providerId: message.sid,
        deliveredAt: new Date()
      };
    }, { incidentId: payload.incidentId, userId: payload.userId });
  }

  // Build SMS message optimized for 160 character limit
  // Format per user decision: [PRIORITY] service: message. Incident #ID - Reply ACK
  private buildSMSMessage(payload: NotificationPayload): string {
    const shortId = payload.incidentId.slice(-6);  // Last 6 chars for brevity

    // Build prefix (escalation or regular)
    let prefix: string;
    if (payload.escalationLevel) {
      prefix = `[ESC-L${payload.escalationLevel}][${payload.priority}]`;
    } else {
      prefix = `[${payload.priority}]`;
    }

    // Calculate available space for message
    // Format: "{prefix} {service}: {message}. Incident #{id} - Reply ACK"
    const suffix = `. Incident #${shortId} - Reply ACK`;
    const overhead = prefix.length + 1 + payload.service.length + 2 + suffix.length;
    // prefix + " " + service + ": " + suffix
    const availableChars = 160 - overhead;

    // Truncate title if needed
    let title = payload.title;
    if (title.length > availableChars) {
      title = title.substring(0, availableChars - 3) + '...';
    }

    const message = `${prefix} ${payload.service}: ${title}${suffix}`;

    // Final safety check
    if (message.length > 160) {
      logger.warn(
        { length: message.length, incidentId: payload.incidentId },
        'SMS message exceeds 160 chars, truncating'
      );
      return message.substring(0, 157) + '...';
    }

    return message;
  }
}

export const smsChannel = new SMSChannel();
