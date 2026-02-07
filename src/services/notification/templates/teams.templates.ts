import type { NotificationPayload } from '../types.js';

// Priority style mapping for Adaptive Cards
const PRIORITY_STYLES: Record<string, { color: string; style: string }> = {
  CRITICAL: { color: 'attention', style: 'emphasis' },
  HIGH: { color: 'warning', style: 'emphasis' },
  MEDIUM: { color: 'default', style: 'default' },
  LOW: { color: 'good', style: 'default' },
  INFO: { color: 'accent', style: 'default' }
};

// Build Adaptive Card for incident notification
export function buildTeamsIncidentCard(payload: NotificationPayload): any {
  const styling = PRIORITY_STYLES[payload.priority] || PRIORITY_STYLES.MEDIUM;
  const icon = payload.priority === 'CRITICAL' ? '🚨 ' : '';

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          // Header container with priority styling
          {
            type: 'Container',
            style: styling.style,
            bleed: true,
            items: [
              {
                type: 'TextBlock',
                text: `${icon}${payload.title}`,
                size: 'Large',
                weight: 'Bolder',
                wrap: true,
                color: styling.color
              },
              // Escalation badge if applicable
              ...(payload.escalationLevel ? [{
                type: 'TextBlock',
                text: `⚠️ Escalation Level ${payload.escalationLevel}`,
                weight: 'Bolder',
                color: 'warning'
              }] : [])
            ]
          },
          // Incident details
          {
            type: 'FactSet',
            facts: [
              { title: 'Service', value: payload.service },
              { title: 'Priority', value: payload.priority },
              { title: 'Incident', value: `#${payload.incidentId.slice(-8)}` },
              { title: 'Triggered', value: formatTimestamp(payload.triggeredAt) },
              { title: 'Alerts', value: `${payload.alertCount} alert${payload.alertCount > 1 ? 's' : ''}` },
              { title: 'Team', value: payload.teamName }
            ]
          },
          // Alert message
          {
            type: 'Container',
            style: 'default',
            items: [
              {
                type: 'TextBlock',
                text: 'Alert Details',
                weight: 'Bolder',
                spacing: 'Medium'
              },
              {
                type: 'TextBlock',
                text: truncateForTeams(payload.body, 2000),
                wrap: true,
                fontType: 'Monospace',
                size: 'Small'
              }
            ]
          }
        ],
        actions: [
          {
            type: 'Action.Submit',
            title: 'Acknowledge',
            style: 'positive',
            data: {
              action: 'acknowledge',
              incidentId: payload.incidentId
            }
          },
          {
            type: 'Action.Submit',
            title: 'Resolve',
            style: 'destructive',
            data: {
              action: 'resolve',
              incidentId: payload.incidentId
            }
          },
          {
            type: 'Action.OpenUrl',
            title: 'View Dashboard',
            url: `${payload.dashboardUrl}/incidents/${payload.incidentId}`
          }
        ]
      }
    }]
  };
}

// Build card showing acknowledged state
export function buildTeamsAcknowledgedCard(
  incidentId: string,
  acknowledgedBy: string,
  acknowledgedAt: Date
): any {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          {
            type: 'TextBlock',
            text: `✅ Incident #${incidentId.slice(-8)} acknowledged`,
            weight: 'Bolder',
            color: 'good'
          },
          {
            type: 'TextBlock',
            text: `Acknowledged by ${acknowledgedBy} at ${formatTimestamp(acknowledgedAt)}`,
            wrap: true
          }
        ]
      }
    }]
  };
}

// Build card showing resolved state
export function buildTeamsResolvedCard(
  incidentId: string,
  resolvedBy: string,
  resolvedAt: Date
): any {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          {
            type: 'TextBlock',
            text: `✅ Incident #${incidentId.slice(-8)} resolved`,
            weight: 'Bolder',
            color: 'good'
          },
          {
            type: 'TextBlock',
            text: `Resolved by ${resolvedBy} at ${formatTimestamp(resolvedAt)}`,
            wrap: true
          }
        ]
      }
    }]
  };
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function truncateForTeams(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 20) + '\n... (truncated)';
}
