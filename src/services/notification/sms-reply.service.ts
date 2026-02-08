import twilio from 'twilio';
import { prisma } from '../../config/database.js';
import { incidentService } from '../incident.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

class SMSReplyService {
  private twilioClient: ReturnType<typeof twilio>;

  constructor() {
    this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  // Process incoming SMS reply
  async processReply(from: string, body: string): Promise<string | null> {
    logger.info({ from, body }, 'Processing SMS reply');

    // Normalize phone number (remove formatting)
    const normalizedPhone = from.replace(/\D/g, '');

    // Look up user by phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: from },
          { phone: normalizedPhone },
          { phone: `+${normalizedPhone}` }
        ],
        isActive: true
      }
    });

    if (!user) {
      logger.warn({ from }, 'SMS reply from unknown phone number');
      return 'Your phone number is not registered with PageFree.';
    }

    // Parse incident ID from reply
    // Per user decision: Format is "Reply ACK" or "ACK 123456"
    const match = body.match(/\b(\d{4,})\b/);  // Find 4+ digit number (incident short ID)

    if (!match) {
      // Try to find most recent open incident for this user
      const recentIncident = await prisma.incident.findFirst({
        where: {
          assignedUserId: user.id,
          status: 'OPEN'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentIncident && /\b(ack|acknowledge)\b/i.test(body)) {
        // Acknowledge most recent incident
        await incidentService.acknowledge(recentIncident.id, user.id, { note: 'Acknowledged via SMS reply' });
        logger.info({ incidentId: recentIncident.id, userId: user.id }, 'Incident acknowledged via SMS');
        return `Incident #${recentIncident.id.slice(-6)} acknowledged.`;
      }

      return 'Reply with incident number to acknowledge (e.g., "ACK 123456")';
    }

    const shortId = match[1];

    // Find incident by short ID suffix
    const incident = await prisma.incident.findFirst({
      where: {
        id: { endsWith: shortId },
        status: { in: ['OPEN', 'ACKNOWLEDGED'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!incident) {
      return `Incident #${shortId} not found or already resolved.`;
    }

    // Check for ACK or RESOLVE keywords
    if (/\b(ack|acknowledge)\b/i.test(body)) {
      try {
        await incidentService.acknowledge(incident.id, user.id, { note: 'Acknowledged via SMS reply' });
        logger.info({ incidentId: incident.id, userId: user.id }, 'Incident acknowledged via SMS');
        return `Incident #${shortId} acknowledged.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Failed to acknowledge: ${msg}`;
      }
    }

    if (/\b(resolve|resolved)\b/i.test(body)) {
      try {
        await incidentService.resolve(incident.id, user.id, { resolutionNote: 'Resolved via SMS reply' });
        logger.info({ incidentId: incident.id, userId: user.id }, 'Incident resolved via SMS');
        return `Incident #${shortId} resolved.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Failed to resolve: ${msg}`;
      }
    }

    return `Incident #${shortId} found. Reply ACK to acknowledge or RESOLVE to resolve.`;
  }

  // Send reply SMS
  async sendReply(to: string, body: string): Promise<void> {
    try {
      await this.twilioClient.messages.create({
        from: env.TWILIO_PHONE_NUMBER,
        to,
        body
      });
    } catch (error) {
      logger.error({ error, to }, 'Failed to send SMS reply');
    }
  }
}

export const smsReplyService = new SMSReplyService();
