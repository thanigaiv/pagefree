import { WebClient } from '@slack/web-api';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { buildSlackIncidentBlocks } from '../templates/slack.templates.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export class SlackChannel extends BaseChannel {
  name = 'slack';
  private slackClient: WebClient;

  constructor() {
    super();
    this.slackClient = new WebClient(env.SLACK_BOT_TOKEN);
  }

  supportsInteractivity(): boolean {
    return true;  // Action buttons
  }

  async send(payload: NotificationPayload): Promise<ChannelDeliveryResult> {
    return this.withErrorHandling(async () => {
      // Get user's Slack connection
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { slackConnection: true }
      });

      if (!user?.slackConnection) {
        return { success: false, error: 'User has no Slack connection' };
      }

      if (!user.slackConnection.isActive) {
        return { success: false, error: 'Slack connection is not active' };
      }

      // Build Block Kit message
      const message = buildSlackIncidentBlocks(payload);
      const results: string[] = [];

      // Send to user DM (per user decision: send to both personal AND team channel)
      try {
        const dmResult = await this.slackClient.chat.postMessage({
          channel: user.slackConnection.slackUserId,  // DM by user ID
          text: message.text,
          attachments: message.attachments
        });

        if (dmResult.ts) {
          results.push(`dm:${dmResult.ts}`);
        }

        logger.info(
          { channel: 'slack', type: 'dm', incidentId: payload.incidentId, userId: payload.userId, ts: dmResult.ts },
          'Slack DM sent'
        );
      } catch (dmError) {
        logger.warn(
          { channel: 'slack', type: 'dm', incidentId: payload.incidentId, error: (dmError as Error).message },
          'Failed to send Slack DM'
        );
      }

      // Send to team channel if configured
      const team = await prisma.team.findFirst({
        where: { id: payload.teamName },  // teamName is actually team ID in payload
        select: { slackChannel: true }
      });

      // Fallback: try to find team by name
      const teamByName = team || await prisma.team.findFirst({
        where: { name: payload.teamName },
        select: { slackChannel: true }
      });

      if (teamByName?.slackChannel) {
        try {
          const channelResult = await this.slackClient.chat.postMessage({
            channel: teamByName.slackChannel,
            text: message.text,
            attachments: message.attachments
          });

          if (channelResult.ts) {
            results.push(`channel:${channelResult.ts}`);
          }

          logger.info(
            { channel: 'slack', type: 'team_channel', incidentId: payload.incidentId, slackChannel: teamByName.slackChannel, ts: channelResult.ts },
            'Slack team channel message sent'
          );
        } catch (channelError) {
          logger.warn(
            { channel: 'slack', type: 'team_channel', incidentId: payload.incidentId, error: (channelError as Error).message },
            'Failed to send Slack team channel message'
          );
        }
      }

      // Update last used timestamp
      await prisma.slackConnection.update({
        where: { id: user.slackConnection.id },
        data: { lastUsedAt: new Date() }
      });

      // Consider success if at least one message sent
      if (results.length === 0) {
        return { success: false, error: 'Failed to send to both DM and channel' };
      }

      return {
        success: true,
        providerId: results.join(','),
        deliveredAt: new Date()
      };
    }, { incidentId: payload.incidentId, userId: payload.userId });
  }

  // Get provider health status
  async getProviderStatus(): Promise<{ healthy: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.slackClient.auth.test();
      return {
        healthy: true,
        latencyMs: Date.now() - start
      };
    } catch {
      return { healthy: false };
    }
  }
}

export const slackChannel = new SlackChannel();
