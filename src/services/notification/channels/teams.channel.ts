import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { BaseChannel } from './base.channel.js';
import type { NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { buildTeamsIncidentCard } from '../templates/teams.templates.js';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export class TeamsChannel extends BaseChannel {
  name = 'teams';
  private graphClient: Client | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    if (!env.TEAMS_APP_ID || !env.TEAMS_APP_SECRET || !env.TEAMS_TENANT_ID) {
      logger.warn('Teams credentials not configured, Teams channel disabled');
      return;
    }

    try {
      const credential = new ClientSecretCredential(
        env.TEAMS_TENANT_ID,
        env.TEAMS_APP_ID,
        env.TEAMS_APP_SECRET
      );

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token?.token || '';
          }
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Teams Graph client');
    }
  }

  supportsInteractivity(): boolean {
    return true;  // Action.Submit buttons
  }

  async send(payload: NotificationPayload): Promise<ChannelDeliveryResult> {
    if (!this.graphClient) {
      return { success: false, error: 'Teams client not initialized' };
    }

    return this.withErrorHandling(async () => {
      // Get user's Teams connection
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { teamsConnection: true }
      });

      if (!user?.teamsConnection) {
        return { success: false, error: 'User has no Teams connection' };
      }

      if (!user.teamsConnection.isActive) {
        return { success: false, error: 'Teams connection is not active' };
      }

      // Build Adaptive Card
      const card = buildTeamsIncidentCard(payload);
      const results: string[] = [];

      // Send to user chat (1:1 with bot)
      // Note: Teams requires a chat to exist first. For proactive messaging,
      // we need the conversation ID from when user installed the app.
      try {
        // Create or get conversation with user
        const chat = await this.graphClient!.api('/chats')
          .post({
            chatType: 'oneOnOne',
            members: [
              {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: ['owner'],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${user.teamsConnection.teamsUserId}`
              }
            ]
          });

        // Send message to chat
        const message = await this.graphClient!.api(`/chats/${chat.id}/messages`)
          .post({
            body: {
              contentType: 'html',
              content: `<attachment id="card"></attachment>`
            },
            attachments: [{
              id: 'card',
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: JSON.stringify(card.attachments[0].content)
            }]
          });

        if (message.id) {
          results.push(`chat:${message.id}`);
        }

        logger.info(
          { channel: 'teams', type: 'chat', incidentId: payload.incidentId, userId: payload.userId, messageId: message.id },
          'Teams chat message sent'
        );
      } catch (chatError) {
        logger.warn(
          { channel: 'teams', type: 'chat', incidentId: payload.incidentId, error: (chatError as Error).message },
          'Failed to send Teams chat message'
        );
      }

      // Update last used timestamp
      await prisma.teamsConnection.update({
        where: { id: user.teamsConnection.id },
        data: { lastUsedAt: new Date() }
      });

      // Consider success if at least one message sent
      if (results.length === 0) {
        return { success: false, error: 'Failed to send Teams message' };
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
    if (!this.graphClient) {
      return { healthy: false };
    }

    const start = Date.now();
    try {
      await this.graphClient.api('/me').get();
      return {
        healthy: true,
        latencyMs: Date.now() - start
      };
    } catch {
      return { healthy: false };
    }
  }
}

export const teamsChannel = new TeamsChannel();
