import type { NotificationPayload } from '../types.js';

// Priority color mapping for Slack attachments
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff0000',  // Red
  HIGH: '#ff6600',      // Orange
  MEDIUM: '#ffcc00',    // Yellow
  LOW: '#00cc00',       // Green
  INFO: '#0066cc'       // Blue
};

// Build Slack Block Kit message for incident notification
export function buildSlackIncidentBlocks(payload: NotificationPayload): {
  text: string;
  attachments: any[];
} {
  const color = PRIORITY_COLORS[payload.priority] || PRIORITY_COLORS.MEDIUM;
  const icon = payload.priority === 'CRITICAL' ? ':rotating_light: ' : '';

  return {
    // Fallback text for notifications
    text: `${icon}[${payload.priority}] ${payload.service}: ${payload.title}`,
    attachments: [{
      color: color,
      blocks: [
        // Header
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${icon}${payload.title}`.substring(0, 150),
            emoji: true
          }
        },
        // Escalation badge if applicable
        ...(payload.escalationLevel ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:warning: *Escalation Level ${payload.escalationLevel}*`
          }
        }] : []),
        // Incident details
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Service:*\n${payload.service}`
            },
            {
              type: 'mrkdwn',
              text: `*Priority:*\n${payload.priority}`
            },
            {
              type: 'mrkdwn',
              text: `*Incident:*\n#${payload.incidentId.slice(-8)}`
            },
            {
              type: 'mrkdwn',
              text: `*Triggered:*\n<!date^${Math.floor(payload.triggeredAt.getTime() / 1000)}^{date_short_pretty} {time}|${payload.triggeredAt.toISOString()}>`
            }
          ]
        },
        // Alert count and team
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Alerts:* ${payload.alertCount} | *Team:* ${payload.teamName}`
            }
          ]
        },
        // Alert message (truncated if long)
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `\`\`\`${truncateForSlack(payload.body, 2900)}\`\`\``
          }
        },
        // Action buttons
        {
          type: 'actions',
          block_id: `incident_actions_${payload.incidentId}`,
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Acknowledge',
                emoji: true
              },
              style: 'primary',
              value: payload.incidentId,
              action_id: 'acknowledge_incident'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Resolve',
                emoji: true
              },
              style: 'danger',
              value: payload.incidentId,
              action_id: 'resolve_incident'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Dashboard',
                emoji: true
              },
              url: `${payload.dashboardUrl}/incidents/${payload.incidentId}`,
              action_id: 'view_incident'
            }
          ]
        }
      ]
    }]
  };
}

// Build updated message after acknowledgment
export function buildSlackAcknowledgedBlocks(
  originalBlocks: any[],
  acknowledgedBy: string,
  acknowledgedAt: Date
): any[] {
  return originalBlocks.map(block => {
    // Update action buttons block
    if (block.type === 'actions' && block.block_id?.startsWith('incident_actions_')) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: *Acknowledged by <@${acknowledgedBy}>* at <!date^${Math.floor(acknowledgedAt.getTime() / 1000)}^{date_short_pretty} {time}|${acknowledgedAt.toISOString()}>`
        }
      };
    }
    return block;
  });
}

// Build updated message after resolution
export function buildSlackResolvedBlocks(
  originalBlocks: any[],
  resolvedBy: string,
  resolvedAt: Date
): any[] {
  return originalBlocks.map(block => {
    // Update action buttons block
    if (block.type === 'actions' && block.block_id?.startsWith('incident_actions_')) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_check_mark: *Resolved by <@${resolvedBy}>* at <!date^${Math.floor(resolvedAt.getTime() / 1000)}^{date_short_pretty} {time}|${resolvedAt.toISOString()}>`
        }
      };
    }
    return block;
  });
}

function truncateForSlack(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 20) + '\n... (truncated)';
}
