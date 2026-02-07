import crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import {
  buildIncidentEmailSubject,
  buildIncidentEmailHtml,
  buildIncidentEmailText
} from '../templates/email.templates.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export class EmailChannel extends BaseChannel {
  name = 'email';
  private sesClient: SESClient;

  constructor() {
    super();
    const config: any = { region: env.AWS_REGION };
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      };
    }
    this.sesClient = new SESClient(config);
  }

  supportsInteractivity(): boolean {
    return true;  // Magic links
  }

  async send(payload: NotificationPayload): Promise<ChannelDeliveryResult> {
    return this.withErrorHandling(async () => {
      // Get user email
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true }
      });

      if (!user?.email) {
        return { success: false, error: 'User email not found' };
      }

      // Generate magic link tokens (15 minute expiry per user decision)
      const ackToken = await this.generateMagicLinkToken(payload.incidentId, 'acknowledge');
      const resolveToken = await this.generateMagicLinkToken(payload.incidentId, 'resolve');

      const baseUrl = env.API_BASE_URL || 'http://localhost:3000';
      const ackUrl = `${baseUrl}/magic/ack/${payload.incidentId}/${ackToken}`;
      const resolveUrl = `${baseUrl}/magic/resolve/${payload.incidentId}/${resolveToken}`;

      const emailData = {
        ...payload,
        ackUrl,
        resolveUrl
      };

      const subject = buildIncidentEmailSubject(payload);
      const htmlBody = buildIncidentEmailHtml(emailData);
      const textBody = buildIncidentEmailText(emailData);

      const command = new SendEmailCommand({
        Source: env.AWS_SES_FROM_EMAIL,
        Destination: { ToAddresses: [user.email] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: htmlBody },
            Text: { Data: textBody }
          }
        }
      });

      const result = await this.sesClient.send(command);

      logger.info(
        { channel: 'email', incidentId: payload.incidentId, userId: payload.userId, messageId: result.MessageId },
        'Email notification sent'
      );

      return {
        success: true,
        providerId: result.MessageId,
        deliveredAt: new Date()
      };
    }, { incidentId: payload.incidentId, userId: payload.userId });
  }

  // Generate secure magic link token (OWASP pattern)
  private async generateMagicLinkToken(incidentId: string, action: 'acknowledge' | 'resolve'): Promise<string> {
    // Cryptographically secure random token (32 bytes = 256 bits)
    const token = crypto.randomBytes(32).toString('hex');

    // Store hash in database (never store plaintext)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await prisma.magicLinkToken.create({
      data: {
        tokenHash,
        incidentId,
        action,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)  // 15 minutes per user decision
      }
    });

    // Return unhashed token for URL
    return token;
  }
}

export const emailChannel = new EmailChannel();
