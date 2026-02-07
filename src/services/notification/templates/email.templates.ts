import type { NotificationPayload } from '../types.js';

// Colors by priority (per user decision - PagerDuty style)
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff0000',
  HIGH: '#ff6600',
  MEDIUM: '#ffcc00',
  LOW: '#00cc00',
  INFO: '#0066cc'
};

interface EmailData extends NotificationPayload {
  ackUrl: string;
  resolveUrl: string;
}

export function buildIncidentEmailSubject(data: NotificationPayload): string {
  const prefix = data.escalationLevel
    ? `[ESCALATION - Level ${data.escalationLevel}] `
    : '';
  return `${prefix}[${data.priority}] ${data.service}: ${data.title}`;
}

export function buildIncidentEmailHtml(data: EmailData): string {
  const color = PRIORITY_COLORS[data.priority] || PRIORITY_COLORS.MEDIUM;
  const icon = data.priority === 'CRITICAL' ? '&#128680;' : '&#9888;';  // Siren or warning
  const escalationBadge = data.escalationLevel
    ? `<p style="margin: 8px 0; font-size: 14px;">Escalation Level ${data.escalationLevel}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
    }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header {
      background: ${color};
      color: white;
      padding: 20px;
      text-align: center;
    }
    .header h2 { margin: 0; font-size: 20px; }
    .content { padding: 24px; }
    .details {
      background: #f9f9f9;
      padding: 16px;
      border-left: 4px solid #007bff;
      margin: 16px 0;
    }
    .detail-row { margin: 8px 0; }
    .label { font-weight: bold; color: #666; display: inline-block; width: 100px; }
    .alert-message {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 16px 0;
      font-size: 13px;
    }
    .actions { text-align: center; margin: 24px 0; }
    .button {
      display: inline-block;
      padding: 14px 32px;
      margin: 8px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
    }
    .btn-primary { background: #007bff; color: white !important; }
    .btn-danger { background: #dc3545; color: white !important; }
    .footer {
      text-align: center;
      padding: 16px;
      color: #666;
      font-size: 12px;
      background: #f9f9f9;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${icon} ${data.priority} Incident</h2>
      ${escalationBadge}
    </div>

    <div class="content">
      <h3 style="margin-top: 0; color: #333;">${data.title}</h3>

      <div class="details">
        <div class="detail-row">
          <span class="label">Service:</span> ${data.service}
        </div>
        <div class="detail-row">
          <span class="label">Priority:</span> ${data.priority}
        </div>
        <div class="detail-row">
          <span class="label">Triggered:</span> ${formatTimestamp(data.triggeredAt)}
        </div>
        <div class="detail-row">
          <span class="label">Alert Count:</span> ${data.alertCount} alert${data.alertCount > 1 ? 's' : ''}
        </div>
        <div class="detail-row">
          <span class="label">Incident:</span> #${data.incidentId.slice(-8)}
        </div>
        <div class="detail-row">
          <span class="label">Team:</span> ${data.teamName}
        </div>
      </div>

      <div class="alert-message">${escapeHtml(data.body)}</div>

      <div class="actions">
        <a href="${data.ackUrl}" class="button btn-primary">Acknowledge Incident</a>
        <a href="${data.resolveUrl}" class="button btn-danger">Resolve Incident</a>
      </div>

      <p style="text-align: center; margin: 24px 0;">
        <a href="${data.dashboardUrl}/incidents/${data.incidentId}" style="color: #007bff;">
          View Full Details in Dashboard &rarr;
        </a>
      </p>
    </div>

    <div class="footer">
      <p>Action links expire in 15 minutes.</p>
      <p>You're receiving this because you're on-call for ${data.teamName}.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function buildIncidentEmailText(data: EmailData): string {
  const icon = data.priority === 'CRITICAL' ? '[!!!]' : '[!]';
  const escalationLine = data.escalationLevel
    ? `Escalation Level: ${data.escalationLevel}\n`
    : '';

  return `
${icon} ${data.priority} INCIDENT${data.escalationLevel ? ` - ESCALATION LEVEL ${data.escalationLevel}` : ''}

${data.title}

Service: ${data.service}
Priority: ${data.priority}
Triggered: ${formatTimestamp(data.triggeredAt)}
Alert Count: ${data.alertCount}
Incident: #${data.incidentId.slice(-8)}
Team: ${data.teamName}
${escalationLine}
Alert Message:
${data.body}

Actions:
Acknowledge: ${data.ackUrl}
Resolve: ${data.resolveUrl}
View Dashboard: ${data.dashboardUrl}/incidents/${data.incidentId}

Links expire in 15 minutes.
  `.trim();
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
