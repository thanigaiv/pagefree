import twilio from 'twilio';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { buildIncidentCallTwiml } from '../templates/twiml.templates.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export class VoiceChannel extends BaseChannel {
  name = 'voice';
  private twilioClient: ReturnType<typeof twilio>;

  constructor() {
    super();
    this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  supportsInteractivity(): boolean {
    return true;  // IVR keypress
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

      // Store payload temporarily for webhook handler (expires in 10 min)
      // In production, use Redis. For now, we'll use in-memory cache
      // and the webhook will re-fetch from database.

      const baseUrl = env.API_BASE_URL || 'http://localhost:3000';

      // Initiate call with TwiML URL
      const call = await this.twilioClient.calls.create({
        to: user.phone,
        from: env.TWILIO_PHONE_NUMBER,
        url: `${baseUrl}/webhooks/twilio/voice/incident/${payload.incidentId}`,
        statusCallback: `${baseUrl}/webhooks/twilio/voice/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        timeout: 30,  // Ring for 30 seconds
        machineDetection: 'Enable'  // Detect voicemail
      });

      logger.info(
        { channel: 'voice', incidentId: payload.incidentId, userId: payload.userId, callSid: call.sid },
        'Voice call initiated'
      );

      return {
        success: true,
        providerId: call.sid,
        deliveredAt: new Date()  // Call initiated, actual delivery depends on answer
      };
    }, { incidentId: payload.incidentId, userId: payload.userId });
  }

  // Get provider health status
  async getProviderStatus(): Promise<{ healthy: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.twilioClient.api.accounts(env.TWILIO_ACCOUNT_SID).fetch();
      return {
        healthy: true,
        latencyMs: Date.now() - start
      };
    } catch {
      return { healthy: false };
    }
  }
}

export const voiceChannel = new VoiceChannel();
