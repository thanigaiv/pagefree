import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { incidentService } from '../incident.service.js';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  buildSlackAcknowledgedBlocks,
  buildSlackResolvedBlocks
} from './templates/slack.templates.js';

interface SlackActionPayload {
  type: string;
  user: { id: string; username: string };
  channel: { id: string };
  message: { ts: string; blocks: any[] };
  actions: Array<{ action_id: string; value: string }>;
  response_url: string;
}

class SlackInteractionService {
  private slackClient: WebClient;

  constructor() {
    this.slackClient = new WebClient(env.SLACK_BOT_TOKEN);
  }

  // Verify Slack request signature (required for security)
  verifySignature(signature: string, timestamp: string, body: string): boolean {
    // Check if Slack signing secret is configured
    if (!env.SLACK_SIGNING_SECRET) {
      logger.error('SLACK_SIGNING_SECRET not configured');
      return false;
    }

    // Prevent replay attacks (must be within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      logger.warn({ timestamp, now }, 'Slack request timestamp too old');
      return false;
    }

    // Compute expected signature
    const sigBaseString = `v0:${timestamp}:${body}`;
    const expectedSignature = 'v0=' + crypto
      .createHmac('sha256', env.SLACK_SIGNING_SECRET)
      .update(sigBaseString)
      .digest('hex');

    // Timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  // Process button click action
  async processAction(payload: SlackActionPayload): Promise<void> {
    const action = payload.actions[0];
    const incidentId = action.value;
    const slackUserId = payload.user.id;

    logger.info(
      { action: action.action_id, incidentId, slackUserId },
      'Processing Slack action'
    );

    // Look up platform user from Slack ID
    const slackConnection = await prisma.slackConnection.findUnique({
      where: { slackUserId }
    });

    if (!slackConnection) {
      await this.sendErrorResponse(payload.response_url, 'Your Slack account is not connected to OnCall Platform');
      return;
    }

    // Optimistic UI: Update message immediately with loading state
    await this.updateMessageWithLoading(payload.channel.id, payload.message.ts, action.action_id);

    try {
      switch (action.action_id) {
        case 'acknowledge_incident':
          await this.handleAcknowledge(incidentId, slackConnection.userId, payload, slackUserId);
          break;

        case 'resolve_incident':
          await this.handleResolve(incidentId, slackConnection.userId, payload, slackUserId);
          break;

        default:
          logger.warn({ actionId: action.action_id }, 'Unknown Slack action');
      }
    } catch (error) {
      // Rollback on failure (restore original message)
      await this.rollbackMessage(payload.channel.id, payload.message.ts, payload.message.blocks, error);
    }
  }

  private async handleAcknowledge(
    incidentId: string,
    userId: string,
    payload: SlackActionPayload,
    slackUserId: string
  ): Promise<void> {
    // Acknowledge incident in platform
    await incidentService.acknowledge(incidentId, userId, { note: 'Acknowledged via Slack' });

    // Update Slack message with final state
    const updatedBlocks = buildSlackAcknowledgedBlocks(
      payload.message.blocks,
      slackUserId,
      new Date()
    );

    await this.slackClient.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      blocks: updatedBlocks,
      attachments: [{
        color: '#00cc00',  // Green for acknowledged
        blocks: updatedBlocks
      }]
    });

    logger.info({ incidentId, userId, slackUserId }, 'Incident acknowledged via Slack');
  }

  private async handleResolve(
    incidentId: string,
    userId: string,
    payload: SlackActionPayload,
    slackUserId: string
  ): Promise<void> {
    // Resolve incident in platform
    await incidentService.resolve(incidentId, userId, { resolutionNote: 'Resolved via Slack' });

    // Update Slack message with final state
    const updatedBlocks = buildSlackResolvedBlocks(
      payload.message.blocks,
      slackUserId,
      new Date()
    );

    await this.slackClient.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      blocks: updatedBlocks,
      attachments: [{
        color: '#0066cc',  // Blue for resolved
        blocks: updatedBlocks
      }]
    });

    logger.info({ incidentId, userId, slackUserId }, 'Incident resolved via Slack');
  }

  // Update message with loading state (optimistic UI)
  private async updateMessageWithLoading(channelId: string, ts: string, actionId: string): Promise<void> {
    try {
      const actionText = actionId === 'acknowledge_incident' ? 'Acknowledging...' : 'Resolving...';
      await this.slackClient.chat.update({
        channel: channelId,
        ts: ts,
        text: actionText,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `:hourglass_flowing_sand: ${actionText}` }
        }]
      });
    } catch (error) {
      // Non-fatal: continue even if loading state fails
      logger.warn({ error }, 'Failed to update Slack message with loading state');
    }
  }

  // Rollback message on failure (per user decision: optimistic UI + rollback)
  private async rollbackMessage(channelId: string, ts: string, originalBlocks: any[], error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    try {
      await this.slackClient.chat.update({
        channel: channelId,
        ts: ts,
        blocks: originalBlocks,
        text: `Action failed: ${errorMessage}`
      });

      // Also post error as thread reply
      await this.slackClient.chat.postMessage({
        channel: channelId,
        thread_ts: ts,
        text: `:x: Action failed: ${errorMessage}`
      });
    } catch (rollbackError) {
      logger.error({ error: rollbackError }, 'Failed to rollback Slack message');
    }

    logger.warn({ channelId, ts, error: errorMessage }, 'Rolled back Slack message after action failure');
  }

  // Send error response to response_url
  private async sendErrorResponse(responseUrl: string, message: string): Promise<void> {
    try {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: `:x: ${message}`
        })
      });
    } catch (error) {
      logger.error({ error, responseUrl }, 'Failed to send error response to Slack');
    }
  }

  // Process slash command
  async processCommand(
    command: string,
    text: string,
    slackUserId: string,
    responseUrl: string
  ): Promise<void> {
    logger.info({ command, text, slackUserId }, 'Processing Slack slash command');

    // Look up platform user
    const slackConnection = await prisma.slackConnection.findUnique({
      where: { slackUserId }
    });

    if (!slackConnection) {
      await this.sendErrorResponse(responseUrl, 'Your Slack account is not connected to OnCall Platform. Visit /settings to connect.');
      return;
    }

    if (command !== '/oncall') {
      return;
    }

    const [action, incidentRef] = text.trim().split(/\s+/);

    try {
      switch (action?.toLowerCase()) {
        case 'ack':
        case 'acknowledge':
          if (!incidentRef) {
            await this.sendSlashResponse(responseUrl, 'ephemeral', 'Usage: `/oncall ack <incident-id>`');
            return;
          }
          await this.handleSlashAcknowledge(incidentRef, slackConnection.userId, slackUserId, responseUrl);
          break;

        case 'resolve':
          if (!incidentRef) {
            await this.sendSlashResponse(responseUrl, 'ephemeral', 'Usage: `/oncall resolve <incident-id>`');
            return;
          }
          await this.handleSlashResolve(incidentRef, slackConnection.userId, slackUserId, responseUrl);
          break;

        case 'list':
          await this.handleSlashList(slackConnection.userId, responseUrl);
          break;

        default:
          await this.sendSlashResponse(responseUrl, 'ephemeral',
            'Usage:\n' +
            '`/oncall ack <id>` - Acknowledge incident\n' +
            '`/oncall resolve <id>` - Resolve incident\n' +
            '`/oncall list` - List your open incidents'
          );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await this.sendSlashResponse(responseUrl, 'ephemeral', `:x: Error: ${msg}`);
    }
  }

  private async handleSlashAcknowledge(
    incidentRef: string,
    userId: string,
    slackUserId: string,
    responseUrl: string
  ): Promise<void> {
    // Find incident by ID or short ID
    const incident = await this.findIncident(incidentRef);
    if (!incident) {
      await this.sendSlashResponse(responseUrl, 'ephemeral', `Incident not found: ${incidentRef}`);
      return;
    }

    await incidentService.acknowledge(incident.id, userId, { note: 'Acknowledged via Slack slash command' });
    await this.sendSlashResponse(responseUrl, 'in_channel',
      `:white_check_mark: Incident #${incident.id.slice(-8)} acknowledged by <@${slackUserId}>`
    );
  }

  private async handleSlashResolve(
    incidentRef: string,
    userId: string,
    slackUserId: string,
    responseUrl: string
  ): Promise<void> {
    const incident = await this.findIncident(incidentRef);
    if (!incident) {
      await this.sendSlashResponse(responseUrl, 'ephemeral', `Incident not found: ${incidentRef}`);
      return;
    }

    await incidentService.resolve(incident.id, userId, { resolutionNote: 'Resolved via Slack slash command' });
    await this.sendSlashResponse(responseUrl, 'in_channel',
      `:white_check_mark: Incident #${incident.id.slice(-8)} resolved by <@${slackUserId}>`
    );
  }

  private async handleSlashList(userId: string, responseUrl: string): Promise<void> {
    const { incidents } = await incidentService.list(
      { assignedUserId: userId, status: ['OPEN', 'ACKNOWLEDGED'] },
      { limit: 10 }
    );

    if (incidents.length === 0) {
      await this.sendSlashResponse(responseUrl, 'ephemeral', 'You have no open incidents assigned to you.');
      return;
    }

    const lines = incidents.map(inc =>
      `- *#${inc.id.slice(-8)}* [${inc.priority}] ${inc.team.name}: ${inc.status}`
    );

    await this.sendSlashResponse(responseUrl, 'ephemeral',
      `*Your open incidents:*\n${lines.join('\n')}`
    );
  }

  private async findIncident(ref: string): Promise<any> {
    // Try full ID first
    let incident = await prisma.incident.findUnique({ where: { id: ref } });
    if (incident) return incident;

    // Try short ID suffix match
    incident = await prisma.incident.findFirst({
      where: { id: { endsWith: ref } },
      orderBy: { createdAt: 'desc' }
    });

    return incident;
  }

  private async sendSlashResponse(responseUrl: string, type: 'ephemeral' | 'in_channel', text: string): Promise<void> {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: type,
        text
      })
    });
  }
}

export const slackInteractionService = new SlackInteractionService();
