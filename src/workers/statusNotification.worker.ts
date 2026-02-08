import { Worker, Job } from 'bullmq';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getRedisConnectionOptions } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import type { StatusNotificationJobData } from '../queues/statusNotification.queue.js';

// SES client for email notifications
const sesConfig: Record<string, unknown> = { region: env.AWS_REGION };
if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
  sesConfig.credentials = {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  };
}
const sesClient = new SESClient(sesConfig);

// Status color mapping for visual indicators
const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: '#22c55e', // green
  DEGRADED_PERFORMANCE: '#eab308', // yellow
  PARTIAL_OUTAGE: '#f97316', // orange
  MAJOR_OUTAGE: '#ef4444', // red
  UNDER_MAINTENANCE: '#6366f1', // indigo
};

// Worker instance
let worker: Worker<StatusNotificationJobData> | null = null;

/**
 * Process a status notification job.
 */
async function processStatusNotification(
  job: Job<StatusNotificationJobData>
): Promise<void> {
  const { type, channel, destination, data } = job.data;

  logger.info(
    { jobId: job.id, type, channel, destination: destination.substring(0, 20) },
    'Processing status notification'
  );

  switch (channel.toUpperCase()) {
    case 'EMAIL':
      await sendEmailNotification(type, destination, data);
      break;
    case 'WEBHOOK':
      await sendWebhookNotification(type, destination, data);
      break;
    case 'SLACK':
      await sendSlackNotification(type, destination, data);
      break;
    default:
      logger.warn({ channel }, 'Unknown notification channel');
  }
}

/**
 * Send an email notification via AWS SES.
 */
async function sendEmailNotification(
  type: string,
  email: string,
  data: StatusNotificationJobData['data']
): Promise<void> {
  let subject: string;
  let htmlBody: string;
  let textBody: string;

  switch (type) {
    case 'verification':
      subject = `Verify your subscription to ${data.statusPageName || 'Status Page'}`;
      htmlBody = buildVerificationEmailHtml(data);
      textBody = buildVerificationEmailText(data);
      break;
    case 'status_change':
      subject = `[Status] ${data.componentName} is now ${formatStatus(data.newStatus)}`;
      htmlBody = buildStatusChangeEmailHtml(data);
      textBody = buildStatusChangeEmailText(data);
      break;
    case 'maintenance':
      subject = `[Maintenance] ${data.maintenanceTitle}`;
      htmlBody = buildMaintenanceEmailHtml(data);
      textBody = buildMaintenanceEmailText(data);
      break;
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }

  const command = new SendEmailCommand({
    Source: env.AWS_SES_FROM_EMAIL,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: htmlBody },
        Text: { Data: textBody },
      },
    },
  });

  await sesClient.send(command);

  logger.info({ type, email: email.substring(0, 20) }, 'Email notification sent');
}

/**
 * Send a webhook notification via HTTP POST.
 */
async function sendWebhookNotification(
  type: string,
  url: string,
  data: StatusNotificationJobData['data']
): Promise<void> {
  const payload = {
    type,
    statusPageId: data.statusPageId,
    componentName: data.componentName,
    previousStatus: data.previousStatus,
    newStatus: data.newStatus,
    message: data.message,
    maintenanceTitle: data.maintenanceTitle,
    maintenanceStartTime: data.maintenanceStartTime,
    maintenanceEndTime: data.maintenanceEndTime,
    timestamp: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    logger.info({ type, url: url.substring(0, 50) }, 'Webhook notification sent');
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Send a Slack notification via incoming webhook.
 */
async function sendSlackNotification(
  type: string,
  webhookUrl: string,
  data: StatusNotificationJobData['data']
): Promise<void> {
  const color = STATUS_COLORS[data.newStatus || 'OPERATIONAL'] || '#6b7280';

  let blocks;
  switch (type) {
    case 'status_change':
      blocks = buildSlackStatusChangeBlocks(data, color);
      break;
    case 'maintenance':
      blocks = buildSlackMaintenanceBlocks(data);
      break;
    default:
      // Verification doesn't go to Slack
      logger.debug({ type }, 'Skipping Slack notification for type');
      return;
  }

  const payload = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with status ${response.status}`);
  }

  logger.info({ type }, 'Slack notification sent');
}

// ===========================================================================
// Email Templates
// ===========================================================================

function buildVerificationEmailHtml(
  data: StatusNotificationJobData['data']
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Subscription</h2>
    <p>You've requested to receive status updates for <strong>${data.statusPageName || 'Status Page'}</strong>.</p>
    <p>Please click the button below to verify your email address:</p>
    <p><a href="${data.verifyUrl}" class="button">Verify Email</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #666;">${data.verifyUrl}</p>
    <div class="footer">
      <p>If you didn't request this subscription, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function buildVerificationEmailText(
  data: StatusNotificationJobData['data']
): string {
  return `
Verify Your Subscription

You've requested to receive status updates for ${data.statusPageName || 'Status Page'}.

Please click the link below to verify your email address:
${data.verifyUrl}

If you didn't request this subscription, you can safely ignore this email.
  `.trim();
}

function buildStatusChangeEmailHtml(
  data: StatusNotificationJobData['data']
): string {
  const color = STATUS_COLORS[data.newStatus || 'OPERATIONAL'] || '#6b7280';
  const statusText = formatStatus(data.newStatus);
  const previousText = formatStatus(data.previousStatus);

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .status-header { padding: 15px; border-left: 4px solid ${color}; background: #f9fafb; margin-bottom: 20px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; color: white; font-weight: 600; font-size: 14px; background: ${color}; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-header">
      <h2 style="margin: 0 0 10px 0;">${data.componentName || 'Component'}</h2>
      <span class="status-badge">${statusText}</span>
    </div>
    <p><strong>Status Changed:</strong> ${previousText} &rarr; ${statusText}</p>
    ${data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : ''}
    <p><strong>Status Page:</strong> ${data.statusPageName || 'Status Page'}</p>
    <div class="footer">
      <p>You are receiving this because you subscribed to status updates.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function buildStatusChangeEmailText(
  data: StatusNotificationJobData['data']
): string {
  const statusText = formatStatus(data.newStatus);
  const previousText = formatStatus(data.previousStatus);

  return `
${data.componentName || 'Component'} - Status Update

Status Changed: ${previousText} -> ${statusText}
${data.message ? `Message: ${data.message}` : ''}
Status Page: ${data.statusPageName || 'Status Page'}

---
You are receiving this because you subscribed to status updates.
  `.trim();
}

function buildMaintenanceEmailHtml(
  data: StatusNotificationJobData['data']
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .maintenance-header { padding: 15px; border-left: 4px solid #6366f1; background: #f9fafb; margin-bottom: 20px; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="maintenance-header">
      <h2 style="margin: 0;">Scheduled Maintenance</h2>
    </div>
    <h3>${data.maintenanceTitle}</h3>
    <p><strong>Start Time:</strong> ${data.maintenanceStartTime || 'TBD'}</p>
    <p><strong>End Time:</strong> ${data.maintenanceEndTime || 'TBD'}</p>
    ${data.message ? `<p><strong>Details:</strong> ${data.message}</p>` : ''}
    <p><strong>Status Page:</strong> ${data.statusPageName || 'Status Page'}</p>
    <div class="footer">
      <p>You are receiving this because you subscribed to maintenance notifications.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function buildMaintenanceEmailText(
  data: StatusNotificationJobData['data']
): string {
  return `
Scheduled Maintenance: ${data.maintenanceTitle}

Start Time: ${data.maintenanceStartTime || 'TBD'}
End Time: ${data.maintenanceEndTime || 'TBD'}
${data.message ? `Details: ${data.message}` : ''}
Status Page: ${data.statusPageName || 'Status Page'}

---
You are receiving this because you subscribed to maintenance notifications.
  `.trim();
}

// ===========================================================================
// Slack Templates
// ===========================================================================

function buildSlackStatusChangeBlocks(
  data: StatusNotificationJobData['data'],
  _color: string
): object[] {
  const statusText = formatStatus(data.newStatus);
  const previousText = formatStatus(data.previousStatus);

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${data.componentName || 'Component'} Status Update`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Status:* ${statusText}`,
        },
        {
          type: 'mrkdwn',
          text: `*Previous:* ${previousText}`,
        },
      ],
    },
    ...(data.message
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Message:* ${data.message}`,
            },
          },
        ]
      : []),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Status Page: ${data.statusPageName || 'Status Page'}`,
        },
      ],
    },
  ];
}

function buildSlackMaintenanceBlocks(
  data: StatusNotificationJobData['data']
): object[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Scheduled Maintenance',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${data.maintenanceTitle}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Start:* ${data.maintenanceStartTime || 'TBD'}`,
        },
        {
          type: 'mrkdwn',
          text: `*End:* ${data.maintenanceEndTime || 'TBD'}`,
        },
      ],
    },
    ...(data.message
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Details:* ${data.message}`,
            },
          },
        ]
      : []),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Status Page: ${data.statusPageName || 'Status Page'}`,
        },
      ],
    },
  ];
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Format status enum to human-readable text.
 */
function formatStatus(status?: string): string {
  if (!status) return 'Unknown';

  const statusMap: Record<string, string> = {
    OPERATIONAL: 'Operational',
    DEGRADED_PERFORMANCE: 'Degraded Performance',
    PARTIAL_OUTAGE: 'Partial Outage',
    MAJOR_OUTAGE: 'Major Outage',
    UNDER_MAINTENANCE: 'Under Maintenance',
  };

  return statusMap[status] || status;
}

// ===========================================================================
// Worker Management
// ===========================================================================

/**
 * Start the status notification worker.
 */
export async function startStatusNotificationWorker(): Promise<void> {
  worker = new Worker<StatusNotificationJobData>(
    'status-notification',
    processStatusNotification,
    {
      connection: getRedisConnectionOptions(),
      concurrency: 10,
      limiter: {
        max: 50, // 50 notifications per minute rate limit
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job: Job<StatusNotificationJobData>) => {
    logger.debug(
      { jobId: job.id, type: job.data.type },
      'Status notification job completed'
    );
  });

  worker.on('failed', (job: Job<StatusNotificationJobData> | undefined, err: Error) => {
    logger.error(
      { jobId: job?.id, type: job?.data.type, error: err.message },
      'Status notification job failed'
    );
  });

  worker.on('error', (err: Error) => {
    logger.error({ error: err.message }, 'Status notification worker error');
  });

  logger.info('Status notification worker started');
}

/**
 * Stop the status notification worker.
 */
export async function stopStatusNotificationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Status notification worker stopped');
  }
}

export { worker as statusNotificationWorker };
