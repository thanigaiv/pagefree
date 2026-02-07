# Phase 5: Multi-Channel Notifications - Research

**Researched:** 2026-02-06
**Domain:** Multi-channel notification delivery (email, SMS, voice, Slack, Teams, push)
**Confidence:** HIGH

## Summary

Multi-channel notification systems require orchestrating multiple external services (AWS SES, Twilio, Slack, Teams, AWS SNS) with robust retry logic, delivery tracking, and graceful failover. The standard approach uses a job queue (BullMQ) to enqueue notification jobs per channel, with workers that implement exponential backoff retry policies and per-channel delivery status tracking. Interactive channels (Slack, Teams) require OAuth authentication, webhook endpoints to receive button interactions, and optimistic UI patterns to handle race conditions when multiple users act simultaneously.

The established pattern is to separate concerns: notification dispatcher enqueues jobs, channel-specific workers handle delivery, and a separate interaction handler processes button clicks and slash commands. Magic links in emails use cryptographically secure one-time tokens with short expiration (15 minutes typical). Critical notifications on mobile require platform-specific configuration (iOS critical alerts with entitlement, Android high-priority notification channels).

**Primary recommendation:** Use BullMQ for all notification delivery with per-channel workers, implement Slack Block Kit messages with interactive buttons + slash commands, use Teams Adaptive Cards for consistency, leverage Twilio's TwiML `<Gather>` for IVR, and track delivery status asynchronously via provider webhooks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Email Notifications**
- Match PagerDuty email format (team is familiar with that structure)
- Include magic links for acknowledge/resolve actions (token-based auth for convenience)
- Full incident details in email body (subject, priority, service, triggered time, alert count, full alert message, dashboard link)

**Slack Notifications**
- Rich message with action buttons (structured message, color-coded by priority, inline Acknowledge and Resolve buttons)
- When user acknowledges: Update button state ("Acknowledged by @user"), change message background color, stop escalation
- OAuth session-based authentication (user connects Slack account once, action buttons use that session)
- Optimistic UI with rollback for race conditions (button shows loading, rolls back if another user beat you to it)
- Support both action buttons AND slash commands (/oncall ack <id>, /oncall resolve <id>) for power users

**Microsoft Teams Notifications**
- Mirror Slack approach (Adaptive Cards with action buttons, OAuth auth, consistent UX)
- Same interaction model as Slack for consistency across platforms

**SMS Notifications**
- Format: `[PRIORITY] service-name: short message. Incident #ID - Reply ACK to acknowledge`
- Example: `[CRITICAL] payments-api: High error rate. Incident #1234 - Reply ACK to acknowledge`
- Optimize for 160 character SMS limit

**Push Notifications**
- Critical incidents override Do Not Disturb (use platform critical alerts - Android notification channel, iOS critical alert)
- Lower priority incidents respect user device settings

**Phone Call Notifications**
- Text-to-speech with keypress menu
- TTS reads: "Critical incident for [service]. [brief message]. Press 1 to acknowledge, press 2 for details, press 9 to escalate"
- Interactive IVR flow for on-call response

**Notification Content**
- Escalation notifications prefixed with level: `[ESCALATION - Level 2]` in subject/message
- Send to both personal channels AND shared team Slack/Teams channel for visibility
- Alert grouping display: Claude decides balance between information vs notification length

**Delivery & Retry Strategy**
- Aggressive retries: 5 attempts over 10 minutes with exponential backoff (30s, 1m, 2m, 4m, 3m)
- Per-channel tracking: Retry only failed channels (don't resend to channels that succeeded)
- Permanent failure: Mark failed when critical channels (email + SMS) both fail after all retries
- Delivery tracking: Track both provider acceptance AND end-user delivery status asynchronously
- Rate limiting: Bundle rapid alerts (5+ incidents for same service in 10 minutes → single "Multiple incidents" notification)
- Maintenance windows: Queue all notifications during scheduled maintenance, deliver when maintenance ends

**Slack/Teams Integration**
- OAuth token refresh: Silent automatic refresh in background - user never notices expiration
- Race condition handling: Optimistic UI + rollback (first click wins, others see rollback)
- Both buttons + slash commands for flexibility

**Failover & Channel Escalation**
- Channel escalation trigger: On delivery failure (if push fails after retries, immediately try SMS; if SMS fails, try voice)
- Hybrid parallel/sequential: Send non-intrusive channels in parallel (push/email/Slack), sequential for intrusive (SMS/voice only if needed)
- Total failure handling: Alert ops team if all channels fail (create high-priority alert for ops via separate escalation path)

### Claude's Discretion

- Slack rate limiting strategy (queue + backoff vs bundle vs email failover)
- Provider failover implementation (Twilio → AWS SNS switch logic)
- Queue TTL and expiration during outages (balance queue health vs delivery guarantees)
- Alert grouping details in notifications (how much history to show)

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope

</user_constraints>

## Standard Stack

The established libraries/tools for multi-channel notifications:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **BullMQ** | 5.x (already in project) | Job queue for notification delivery | Industry standard for reliable async job processing with Redis. Exponential backoff, retry logic, and per-job status tracking built-in. Essential for at-least-once delivery guarantee. |
| **@aws-sdk/client-ses** | ^3.985.0 (already in project) | Email delivery via AWS SES | AWS's native email service. High deliverability, no SMTP complexity, integrated delivery tracking. Project already uses this. |
| **twilio** | ^5.12.1 (already in project) | SMS + Voice via Twilio | Industry leader for SMS/voice. Programmable Voice with TwiML for IVR, delivery webhooks, global reach. Project already uses this. |
| **@slack/web-api** | ^7.x | Slack integration | Official Slack SDK for Node.js. Handles OAuth, rate limiting, message posting, interactive actions. |
| **@microsoft/microsoft-graph-client** | ^3.0.7 (already in project) | Teams integration via Microsoft Graph | Official Microsoft SDK for Teams bot messaging. Required for sending Adaptive Cards and handling Teams interactions. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@aws-sdk/client-sns** | ^3.x | Push notifications (iOS/Android) | AWS SNS abstracts FCM (Android) and APNs (iOS) with unified API. Handles device token management and platform-specific payloads. Use for mobile push. |
| **crypto** (Node.js native) | - | Token generation for magic links | Native Node.js crypto module for cryptographically secure random tokens. Use `randomBytes(32)` for magic link tokens. |
| **jsonwebtoken** or **jose** | ^9.x / ^5.x | Temporary JWT tokens for interactions | For signed tokens in Slack/Teams OAuth flows and magic link verification. `jose` is modern, `jsonwebtoken` is established. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| **AWS SES** | SendGrid / Mailgun | SendGrid has nicer templates but adds dependency. SES is already integrated and sufficient for transactional email. |
| **AWS SNS** | Direct FCM/APNs integration | SNS abstracts platform differences. Direct integration gives more control but requires managing two separate APIs and credential rotation. |
| **Twilio** | AWS SNS (SMS/Voice) | Twilio has superior voice capabilities (TwiML is powerful). SNS voice is basic. Keep Twilio for voice, use SNS as failover only. |
| **BullMQ** | AWS SQS | BullMQ provides exactly-once semantics, job priority, and Redis-based state. SQS requires more orchestration. BullMQ already in project. |

**Installation:**
```bash
# New dependencies needed for Phase 5
npm install @slack/web-api@^7.0.0 @aws-sdk/client-sns@^3.0.0 jose@^5.0.0

# Already installed (from Phase 1/2)
# @aws-sdk/client-ses@^3.985.0
# @microsoft/microsoft-graph-client@^3.0.7
# twilio@^5.12.1
# bullmq@^5.67.3
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── notification/
│   │   ├── dispatcher.ts          # Main notification orchestrator
│   │   ├── channels/
│   │   │   ├── email.channel.ts   # Email delivery via SES
│   │   │   ├── sms.channel.ts     # SMS via Twilio/SNS
│   │   │   ├── voice.channel.ts   # Voice calls via Twilio
│   │   │   ├── slack.channel.ts   # Slack Web API integration
│   │   │   ├── teams.channel.ts   # Teams Graph API integration
│   │   │   └── push.channel.ts    # Push via AWS SNS
│   │   ├── templates/
│   │   │   ├── email.templates.ts # Email HTML/text generation
│   │   │   ├── slack.templates.ts # Slack Block Kit builders
│   │   │   ├── teams.templates.ts # Adaptive Card builders
│   │   │   └── twiml.templates.ts # TwiML XML generation
│   │   └── delivery-tracker.ts    # Async delivery status tracking
├── workers/
│   ├── notification-worker.ts     # BullMQ worker for notifications
│   └── delivery-status-worker.ts  # Processes provider webhooks
├── routes/
│   ├── webhooks/
│   │   ├── slack-interactions.ts  # Slack button clicks & slash commands
│   │   ├── teams-interactions.ts  # Teams Adaptive Card actions
│   │   ├── twilio-webhooks.ts     # SMS delivery status, voice IVR
│   │   └── sns-webhooks.ts        # Push delivery confirmations
│   └── magic-links.ts             # Magic link token verification
├── queues/
│   └── notification.queue.ts      # Already exists, extend for channels
└── models/
    └── notification-log.ts        # Delivery audit trail (Prisma)
```

### Pattern 1: Channel Abstraction with Unified Interface

**What:** Define a common interface for all notification channels, with channel-specific implementations handling provider details.

**When to use:** When supporting multiple notification channels that need consistent retry, tracking, and error handling.

**Example:**
```typescript
// Source: Architecture research patterns (HIGH confidence)

interface NotificationChannel {
  name: string;
  send(notification: NotificationPayload): Promise<ChannelDeliveryResult>;
  supportsInteractivity(): boolean;
  getProviderStatus(): Promise<ProviderStatus>;
}

interface NotificationPayload {
  incidentId: string;
  userId: string;
  title: string;
  body: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  actions?: NotificationAction[];
}

interface ChannelDeliveryResult {
  success: boolean;
  providerId?: string;  // External message ID from provider
  error?: string;
  deliveredAt?: Date;
  estimatedDelivery?: Date;  // For async channels
}

// Channel implementations
class EmailChannel implements NotificationChannel {
  name = 'email';

  async send(notification: NotificationPayload): Promise<ChannelDeliveryResult> {
    const command = new SendEmailCommand({
      Source: env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [user.email] },
      Message: {
        Subject: { Data: this.buildSubject(notification) },
        Body: { Html: { Data: this.buildHtmlBody(notification) } }
      }
    });

    const result = await sesClient.send(command);
    return {
      success: true,
      providerId: result.MessageId,
      deliveredAt: new Date()
    };
  }

  supportsInteractivity() { return true; } // Magic links
}

class SlackChannel implements NotificationChannel {
  name = 'slack';

  async send(notification: NotificationPayload): Promise<ChannelDeliveryResult> {
    const slackClient = await this.getSlackClient(notification.userId);

    const result = await slackClient.chat.postMessage({
      channel: user.slackChannelId,
      blocks: this.buildBlockKit(notification),
      text: notification.title  // Fallback
    });

    return {
      success: true,
      providerId: result.ts,  // Slack message timestamp
      deliveredAt: new Date()
    };
  }

  supportsInteractivity() { return true; } // Action buttons
}
```

### Pattern 2: Notification Job Fanout with Per-Channel Workers

**What:** When incident requires notification, enqueue separate jobs per channel. Each channel worker processes its queue independently with channel-specific retry logic.

**When to use:** Multi-channel notifications where channels have different latency profiles and failure modes.

**Example:**
```typescript
// Source: BullMQ documentation + Architecture patterns (HIGH confidence)

// Dispatcher: Creates jobs for each channel
async function dispatchNotification(incident: Incident, user: User) {
  const channels = await getUserEnabledChannels(user.id);

  // Create separate job per channel
  const jobs = channels.map(channel => ({
    name: `notify-${channel}`,
    data: {
      incidentId: incident.id,
      userId: user.id,
      channel: channel,
      priority: incident.priority
    },
    opts: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30000  // 30s, 1m, 2m, 4m, 8m
      },
      priority: incident.priority === 'CRITICAL' ? 1 : 10,
      removeOnComplete: false,  // Keep for audit trail
      removeOnFail: false
    }
  }));

  // Add all jobs in bulk
  await notificationQueue.addBulk(jobs);

  // Log to audit trail
  await prisma.notificationLog.createMany({
    data: jobs.map(job => ({
      incidentId: incident.id,
      userId: user.id,
      channel: job.data.channel,
      status: 'QUEUED',
      queuedAt: new Date()
    }))
  });
}

// Worker: Process channel-specific jobs
notificationQueue.process('notify-*', async (job) => {
  const { incidentId, userId, channel } = job.data;

  // Get channel implementation
  const channelImpl = getChannelImplementation(channel);

  try {
    const result = await channelImpl.send({
      incidentId,
      userId,
      ...await buildNotificationPayload(incidentId)
    });

    // Update delivery status
    await prisma.notificationLog.update({
      where: {
        incidentId_userId_channel: { incidentId, userId, channel }
      },
      data: {
        status: 'DELIVERED',
        providerId: result.providerId,
        deliveredAt: result.deliveredAt
      }
    });

    return result;
  } catch (error) {
    // Log failure for retry tracking
    await prisma.notificationLog.update({
      where: {
        incidentId_userId_channel: { incidentId, userId, channel }
      },
      data: {
        status: 'FAILED',
        error: error.message,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 }
      }
    });

    throw error;  // BullMQ will retry
  }
});
```

### Pattern 3: Slack Block Kit with Interactive Actions

**What:** Build Slack messages using Block Kit (structured JSON) with action buttons. Handle button clicks via webhook endpoint that verifies Slack signature and processes action.

**When to use:** Slack notifications requiring user interaction (acknowledge, resolve, escalate).

**Example:**
```typescript
// Source: Slack documentation (https://docs.slack.dev) - HIGH confidence

// Build Block Kit message
function buildSlackIncidentMessage(incident: Incident): any {
  const color = {
    'CRITICAL': '#ff0000',
    'HIGH': '#ff6600',
    'MEDIUM': '#ffcc00',
    'LOW': '#00cc00'
  }[incident.priority];

  return {
    attachments: [{
      color: color,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${incident.priority === 'CRITICAL' ? '🚨 ' : ''}${incident.title}`
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Service:*\n${incident.service}` },
            { type: 'mrkdwn', text: `*Priority:*\n${incident.priority}` },
            { type: 'mrkdwn', text: `*Incident:*\n#${incident.id}` },
            { type: 'mrkdwn', text: `*Triggered:*\n${formatTimestamp(incident.createdAt)}` }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: incident.description
          }
        },
        {
          type: 'actions',
          block_id: `incident_actions_${incident.id}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Acknowledge' },
              style: 'primary',
              value: incident.id,
              action_id: 'acknowledge_incident'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Resolve' },
              style: 'danger',
              value: incident.id,
              action_id: 'resolve_incident'
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Dashboard' },
              url: `${env.DASHBOARD_URL}/incidents/${incident.id}`,
              action_id: 'view_incident'
            }
          ]
        }
      ]
    }]
  };
}

// Handle button clicks
app.post('/webhooks/slack/interactions', async (req, res) => {
  // Verify Slack signature (required for security)
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const isValid = verifySlackSignature(signature, timestamp, req.body);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse payload
  const payload = JSON.parse(req.body.payload);
  const action = payload.actions[0];
  const incidentId = action.value;
  const userId = payload.user.id;

  // Acknowledge receipt immediately (required within 3 seconds)
  res.status(200).json({
    response_type: 'in_channel',
    text: 'Processing...'
  });

  // Process action asynchronously
  setImmediate(async () => {
    try {
      // Optimistic UI: Update message immediately
      await slackClient.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        blocks: updateBlocksWithLoadingState(payload.message.blocks, action.action_id)
      });

      // Perform action
      if (action.action_id === 'acknowledge_incident') {
        await acknowledgeIncident(incidentId, userId);
      } else if (action.action_id === 'resolve_incident') {
        await resolveIncident(incidentId, userId);
      }

      // Update message with final state
      await slackClient.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        blocks: updateBlocksWithFinalState(payload.message.blocks, action.action_id, userId)
      });
    } catch (error) {
      // Rollback on failure
      await slackClient.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        blocks: payload.message.blocks,  // Original state
        text: `Failed to ${action.action_id}: ${error.message}`
      });
    }
  });
});
```

### Pattern 4: Slash Command Handler

**What:** Slack slash commands provide text-based interface for power users. Commands like `/oncall ack <id>` allow quick actions without clicking buttons.

**When to use:** Provide alternative to button-based interactions for experienced users who prefer keyboard-driven workflows.

**Example:**
```typescript
// Source: Slack slash command documentation - HIGH confidence

app.post('/webhooks/slack/commands', async (req, res) => {
  // Verify signature
  const isValid = verifySlackSignature(
    req.headers['x-slack-signature'],
    req.headers['x-slack-request-timestamp'],
    req.body
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { command, text, user_id, channel_id, response_url } = req.body;

  // Acknowledge immediately (3 second timeout)
  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Processing command...'
  });

  // Process command asynchronously
  setImmediate(async () => {
    try {
      if (command === '/oncall') {
        const [action, incidentId] = text.split(' ');

        switch (action) {
          case 'ack':
          case 'acknowledge':
            await acknowledgeIncident(incidentId, user_id);
            await axios.post(response_url, {
              response_type: 'in_channel',
              text: `✅ Incident #${incidentId} acknowledged by <@${user_id}>`
            });
            break;

          case 'resolve':
            await resolveIncident(incidentId, user_id);
            await axios.post(response_url, {
              response_type: 'in_channel',
              text: `✅ Incident #${incidentId} resolved by <@${user_id}>`
            });
            break;

          case 'list':
            const incidents = await getOpenIncidents(user_id);
            await axios.post(response_url, {
              response_type: 'ephemeral',
              blocks: buildIncidentListBlocks(incidents)
            });
            break;

          default:
            await axios.post(response_url, {
              response_type: 'ephemeral',
              text: 'Usage: /oncall [ack|resolve|list] [incident-id]'
            });
        }
      }
    } catch (error) {
      await axios.post(response_url, {
        response_type: 'ephemeral',
        text: `Error: ${error.message}`
      });
    }
  });
});
```

### Pattern 5: Teams Adaptive Cards with Action.Submit

**What:** Teams uses Adaptive Cards (JSON-based UI) with Action.Submit buttons. Button clicks send HTTP POST to your bot's messaging endpoint with user input.

**When to use:** Teams notifications requiring interactive actions (mirror Slack functionality).

**Example:**
```typescript
// Source: Microsoft Teams bot documentation - HIGH confidence

function buildTeamsIncidentCard(incident: Incident): any {
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
            type: 'Container',
            style: incident.priority === 'CRITICAL' ? 'attention' : 'default',
            items: [
              {
                type: 'TextBlock',
                text: incident.title,
                size: 'Large',
                weight: 'Bolder',
                wrap: true
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Service', value: incident.service },
                  { title: 'Priority', value: incident.priority },
                  { title: 'Incident', value: `#${incident.id}` },
                  { title: 'Triggered', value: formatTimestamp(incident.createdAt) }
                ]
              },
              {
                type: 'TextBlock',
                text: incident.description,
                wrap: true
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
              incidentId: incident.id
            }
          },
          {
            type: 'Action.Submit',
            title: 'Resolve',
            style: 'destructive',
            data: {
              action: 'resolve',
              incidentId: incident.id
            }
          },
          {
            type: 'Action.OpenUrl',
            title: 'View Dashboard',
            url: `${env.DASHBOARD_URL}/incidents/${incident.id}`
          }
        ]
      }
    }]
  };
}

// Handle Action.Submit from Teams
async function onTeamsCardAction(context: TurnContext) {
  const action = context.activity.value;
  const userId = context.activity.from.id;

  try {
    // Optimistic UI: Update card immediately
    const loadingCard = buildLoadingCard(action.incidentId);
    await context.updateActivity({
      ...context.activity,
      attachments: [loadingCard]
    });

    // Perform action
    if (action.action === 'acknowledge') {
      await acknowledgeIncident(action.incidentId, userId);
    } else if (action.action === 'resolve') {
      await resolveIncident(action.incidentId, userId);
    }

    // Update card with final state
    const finalCard = buildAcknowledgedCard(action.incidentId, userId);
    await context.updateActivity({
      ...context.activity,
      attachments: [finalCard]
    });
  } catch (error) {
    // Rollback on failure
    const errorCard = buildErrorCard(action.incidentId, error.message);
    await context.updateActivity({
      ...context.activity,
      attachments: [errorCard]
    });
  }
}
```

### Pattern 6: Twilio IVR with TwiML Gather

**What:** Phone call notifications use TwiML XML to create interactive voice response (IVR). `<Gather>` collects keypress input, which triggers next action URL.

**When to use:** Critical incident notifications requiring voice call escalation with interactive acknowledgment.

**Example:**
```typescript
// Source: Twilio TwiML documentation - HIGH confidence

// Initiate call
async function makeIncidentCall(user: User, incident: Incident) {
  const call = await twilioClient.calls.create({
    to: user.phone,
    from: env.TWILIO_PHONE_NUMBER,
    url: `${env.API_BASE_URL}/webhooks/twilio/voice/incident/${incident.id}`,
    statusCallback: `${env.API_BASE_URL}/webhooks/twilio/voice/status`,
    statusCallbackEvent: ['initiated', 'answered', 'completed']
  });

  return call.sid;
}

// Initial TwiML response
app.post('/webhooks/twilio/voice/incident/:incidentId', async (req, res) => {
  const { incidentId } = req.params;
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/webhooks/twilio/voice/incident/${incidentId}/input" timeout="10">
    <Say voice="alice">
      Critical incident for ${incident.service}.
      ${incident.title}.
      Press 1 to acknowledge.
      Press 2 to hear details.
      Press 9 to escalate.
    </Say>
  </Gather>
  <Say>We did not receive any input. Goodbye.</Say>
</Response>`;

  res.type('text/xml').send(twiml);
});

// Handle keypress input
app.post('/webhooks/twilio/voice/incident/:incidentId/input', async (req, res) => {
  const { incidentId } = req.params;
  const { Digits, CallSid } = req.body;
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });

  let twiml = '';

  switch (Digits) {
    case '1':
      // Acknowledge incident
      await acknowledgeIncident(incidentId, getUserFromCallSid(CallSid));
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Incident ${incident.id} has been acknowledged. Thank you.</Say>
</Response>`;
      break;

    case '2':
      // Read full details
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    ${incident.description}
    Alert count: ${incident.alertCount}.
    Press 1 to acknowledge, or hang up.
  </Say>
  <Gather numDigits="1" action="/webhooks/twilio/voice/incident/${incidentId}/input" timeout="5">
    <Pause length="1"/>
  </Gather>
</Response>`;
      break;

    case '9':
      // Escalate manually
      await escalateIncident(incidentId);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Escalating to next level. Goodbye.</Say>
</Response>`;
      break;

    default:
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid input. Goodbye.</Say>
</Response>`;
  }

  res.type('text/xml').send(twiml);
});
```

### Pattern 7: Magic Links with One-Time Tokens

**What:** Email notifications include time-limited, single-use tokens for acknowledge/resolve actions without requiring login.

**When to use:** Email notifications where user needs quick action without opening dashboard.

**Example:**
```typescript
// Source: OWASP password reset cheat sheet + security patterns - HIGH confidence

// Generate magic link token
async function generateMagicLinkToken(incidentId: string, action: 'acknowledge' | 'resolve'): Promise<string> {
  // Cryptographically secure random token (32 bytes = 256 bits)
  const token = crypto.randomBytes(32).toString('hex');

  // Store token in database with expiration
  await prisma.magicLinkToken.create({
    data: {
      token: crypto.createHash('sha256').update(token).digest('hex'),  // Hash in DB
      incidentId,
      action,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),  // 15 minutes
      used: false
    }
  });

  // Return unhashed token for URL
  return token;
}

// Build email with magic links
async function buildIncidentEmail(incident: Incident, user: User): Promise<string> {
  const ackToken = await generateMagicLinkToken(incident.id, 'acknowledge');
  const resolveToken = await generateMagicLinkToken(incident.id, 'resolve');

  const ackUrl = `${env.API_BASE_URL}/magic/ack/${incident.id}/${ackToken}`;
  const resolveUrl = `${env.API_BASE_URL}/magic/resolve/${incident.id}/${resolveToken}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .header { background: #ff0000; color: white; padding: 16px; }
    .button { display: inline-block; padding: 12px 24px; margin: 8px;
              text-decoration: none; border-radius: 4px; font-weight: bold; }
    .btn-primary { background: #007bff; color: white; }
    .btn-danger { background: #dc3545; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🚨 ${incident.priority} Incident: ${incident.service}</h2>
  </div>
  <div style="padding: 24px;">
    <h3>${incident.title}</h3>
    <p><strong>Priority:</strong> ${incident.priority}</p>
    <p><strong>Service:</strong> ${incident.service}</p>
    <p><strong>Triggered:</strong> ${formatTimestamp(incident.createdAt)}</p>
    <p><strong>Alert Count:</strong> ${incident.alertCount}</p>
    <p><strong>Incident:</strong> #${incident.id}</p>

    <h4>Alert Details:</h4>
    <pre>${incident.description}</pre>

    <div style="margin: 24px 0;">
      <a href="${ackUrl}" class="button btn-primary">Acknowledge</a>
      <a href="${resolveUrl}" class="button btn-danger">Resolve</a>
    </div>

    <p><small>Links expire in 15 minutes. <a href="${env.DASHBOARD_URL}/incidents/${incident.id}">View in Dashboard</a></small></p>
  </div>
</body>
</html>
  `;
}

// Handle magic link click
app.get('/magic/:action/:incidentId/:token', async (req, res) => {
  const { action, incidentId, token } = req.params;

  // Hash token for DB lookup
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Find token
  const magicToken = await prisma.magicLinkToken.findUnique({
    where: { token: tokenHash }
  });

  // Validate token
  if (!magicToken) {
    return res.status(404).send('Invalid or expired link');
  }

  if (magicToken.used) {
    return res.status(400).send('Link already used');
  }

  if (magicToken.expiresAt < new Date()) {
    return res.status(400).send('Link expired');
  }

  if (magicToken.incidentId !== incidentId || magicToken.action !== action) {
    return res.status(400).send('Invalid link');
  }

  // Mark token as used (one-time use)
  await prisma.magicLinkToken.update({
    where: { token: tokenHash },
    data: { used: true, usedAt: new Date() }
  });

  // Perform action
  if (action === 'acknowledge') {
    await acknowledgeIncident(incidentId, 'magic-link');
    res.redirect(`${env.DASHBOARD_URL}/incidents/${incidentId}?acknowledged=true`);
  } else if (action === 'resolve') {
    await resolveIncident(incidentId, 'magic-link');
    res.redirect(`${env.DASHBOARD_URL}/incidents/${incidentId}?resolved=true`);
  }
});
```

### Pattern 8: Push Notifications with Critical Alerts

**What:** Mobile push notifications use AWS SNS to abstract FCM (Android) and APNs (iOS). Critical incidents use platform-specific settings to bypass Do Not Disturb.

**When to use:** Mobile app notifications where critical incidents must break through DND mode.

**Example:**
```typescript
// Source: AWS SNS documentation + iOS/Android critical notification patterns - MEDIUM confidence

// Register device for push notifications
async function registerPushDevice(userId: string, platform: 'ios' | 'android', deviceToken: string) {
  // Create SNS platform endpoint
  const endpoint = await snsClient.send(new CreatePlatformEndpointCommand({
    PlatformApplicationArn: platform === 'ios'
      ? env.SNS_PLATFORM_APP_ARN_IOS
      : env.SNS_PLATFORM_APP_ARN_ANDROID,
    Token: deviceToken,
    CustomUserData: userId
  }));

  // Store endpoint in database
  await prisma.userDevice.upsert({
    where: {
      userId_deviceToken: { userId, deviceToken }
    },
    create: {
      userId,
      platform,
      deviceToken,
      endpointArn: endpoint.EndpointArn,
      lastSeenAt: new Date()
    },
    update: {
      endpointArn: endpoint.EndpointArn,
      lastSeenAt: new Date()
    }
  });

  return endpoint.EndpointArn;
}

// Send push notification with critical alert
async function sendPushNotification(incident: Incident, user: User) {
  const devices = await prisma.userDevice.findMany({
    where: { userId: user.id }
  });

  for (const device of devices) {
    const isCritical = incident.priority === 'CRITICAL' || incident.priority === 'HIGH';

    let message: any = {
      default: incident.title,  // Fallback
    };

    if (device.platform === 'ios') {
      // iOS-specific payload with critical alert
      message.APNS = JSON.stringify({
        aps: {
          alert: {
            title: `[${incident.priority}] ${incident.service}`,
            body: incident.title,
            subtitle: `Incident #${incident.id}`
          },
          sound: isCritical ? {
            critical: 1,
            name: 'critical-alert.wav',
            volume: 1.0
          } : 'default',
          badge: 1,
          'interruption-level': isCritical ? 'critical' : 'active',
          'relevance-score': isCritical ? 1.0 : 0.5
        },
        incidentId: incident.id,
        action: 'view_incident'
      });
    } else if (device.platform === 'android') {
      // Android-specific payload with high-priority channel
      message.GCM = JSON.stringify({
        notification: {
          title: `[${incident.priority}] ${incident.service}`,
          body: incident.title,
          channel_id: isCritical ? 'critical_alerts' : 'default',
          priority: isCritical ? 'high' : 'default',
          sound: 'default',
          click_action: 'VIEW_INCIDENT'
        },
        data: {
          incidentId: incident.id,
          priority: incident.priority
        },
        android: {
          priority: isCritical ? 'high' : 'normal',
          notification: {
            channel_id: isCritical ? 'critical_alerts' : 'default',
            notification_priority: isCritical ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT'
          }
        }
      });
    }

    await snsClient.send(new PublishCommand({
      TargetArn: device.endpointArn,
      Message: JSON.stringify(message),
      MessageStructure: 'json'
    }));
  }
}

// Note: iOS critical alerts require com.apple.developer.usernotifications.critical-alerts entitlement
// Note: Android high-priority channels must be created in app code (NotificationChannel with IMPORTANCE_HIGH)
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Slack signature verification** | Custom HMAC validation | `@slack/web-api` built-in verification or copy their reference implementation | Slack's signature scheme uses timestamp + body concatenation with specific HMAC construction. Easy to get wrong, causing security issues. |
| **TwiML XML generation** | String concatenation or manual XML building | `twilio.twiml.VoiceResponse()` builder from Twilio SDK | XML escaping, proper nesting, and TwiML schema compliance are error-prone. SDK handles edge cases. |
| **Push notification payload formatting** | Direct JSON for APNs/FCM | AWS SNS MessageStructure: 'json' with platform-specific keys | APNs and FCM have different payload structures, size limits, and required fields. SNS abstracts this. |
| **Exponential backoff calculation** | Manual setTimeout with 2^n formula | BullMQ's built-in `backoff: { type: 'exponential', delay: ms }` | BullMQ handles retry scheduling, persistence across restarts, and jitter to prevent thundering herd. |
| **OAuth token refresh** | Manual tracking of expiration + refresh flow | `@slack/web-api` automatic token refresh or Microsoft Graph SDK | OAuth refresh has edge cases: race conditions on concurrent requests, token rotation, refresh token expiration. SDKs handle this. |
| **Email HTML templates** | String concatenation or template literals | Consider `mjml` or `react-email` for complex emails | Email HTML rendering is inconsistent across clients. MJML compiles to compatible HTML. For simple transactional emails, template literals are acceptable. |
| **Rate limiting per provider** | In-memory counters or setTimeout | BullMQ rate limiter (`limiter: { max: 10, duration: 1000 }`) per queue | Redis-backed rate limiting survives restarts and works across multiple workers. In-memory limits don't scale horizontally. |

**Key insight:** Notification delivery has many subtle failure modes (network timeouts, rate limits, token expiration, signature verification, race conditions on button clicks). Use battle-tested libraries for authentication, retry logic, and provider SDKs. Hand-roll only the business logic (incident data formatting, channel selection, delivery tracking).

## Common Pitfalls

### Pitfall 1: Synchronous Notification Sending in HTTP Request Path

**What goes wrong:** Sending notifications directly in the API endpoint that creates/updates incidents causes HTTP timeouts, failed responses when providers are slow, and no automatic retries.

**Why it happens:** It's the simplest implementation - create incident, send notifications, return response. But external services (Twilio, Slack, AWS SES) can take 1-5 seconds per call, and HTTP clients timeout after 30-60 seconds.

**How to avoid:** Always use async job queue (BullMQ). Enqueue notification jobs, return 202 Accepted immediately. Let background workers handle delivery with retries.

**Warning signs:**
- API response times >1 second for incident creation
- Failed incident creation when notification provider is down
- No retry mechanism for failed notifications
- HTTP 504 Gateway Timeout errors during provider outages

### Pitfall 2: Not Verifying Slack/Twilio Webhook Signatures

**What goes wrong:** Accepting webhook requests without signature verification allows attackers to forge button clicks, slash commands, and delivery status callbacks. An attacker could acknowledge all incidents or trigger false delivery confirmations.

**Why it happens:** Signature verification requires understanding HMAC, timestamp validation, and replay attack prevention. Developers skip it during development and forget to add it before production.

**How to avoid:**
- Slack: Verify `X-Slack-Signature` using HMAC-SHA256 of `v0:{timestamp}:{body}` against signing secret
- Twilio: Verify `X-Twilio-Signature` using HMAC-SHA1 of URL + sorted POST params against auth token
- Reject requests with timestamps >5 minutes old (replay attack prevention)
- Fail closed: return 401 if signature invalid, never process request

**Warning signs:**
- No signature verification code in webhook handlers
- Webhook endpoints accessible in Postman without headers
- Missing timestamp freshness check
- Using verification token instead of signature (Slack deprecated this)

### Pitfall 3: Not Handling OAuth Token Expiration

**What goes wrong:** Slack/Teams OAuth access tokens expire (typically after 1-12 hours). Notifications silently fail after token expiration until user manually reconnects.

**Why it happens:** Initial OAuth flow works perfectly. Token expiration happens later, often outside business hours, causing missed critical alerts.

**How to avoid:**
- Store refresh tokens (encrypted) in database alongside access tokens
- Check token expiration before each API call
- Automatically refresh token when expired (use SDK built-in refresh if available)
- Implement retry logic: if API call fails with 401, refresh token and retry once
- Alert user if refresh token is expired (requires re-authentication)

**Warning signs:**
- Notifications work initially but stop after hours/days
- No refresh token stored in database
- No token expiration checking logic
- No fallback channel when OAuth fails (e.g., email if Slack fails)

### Pitfall 4: Race Conditions on Button Clicks

**What goes wrong:** Two users click "Acknowledge" simultaneously. Both see loading state, both try to acknowledge, one succeeds, other gets error. Without proper handling, both buttons show success or both show error.

**Why it happens:** Button click → HTTP request → database update is not atomic. Between click and response, another user can act on the same incident.

**How to avoid:**
- Use database-level optimistic locking (Prisma: `where: { id, status: 'OPEN' }` only updates if still open)
- Implement idempotent actions (acknowledging an already-acknowledged incident is a no-op, not an error)
- Optimistic UI: Update button immediately, then verify. If verification fails, rollback to original state with error message
- WebSocket broadcast: When incident state changes, push update to all connected clients immediately

**Warning signs:**
- Button click errors when two users act simultaneously
- Incident state inconsistent across different users' Slack messages
- No optimistic locking in database queries
- No idempotency checks in action handlers

### Pitfall 5: Not Tracking Delivery Status Asynchronously

**What goes wrong:** Marking notification as "delivered" immediately after calling provider API, but actual delivery fails (invalid phone number, bounce, spam filter). Audit logs show "delivered" but user never received notification.

**Why it happens:** Provider APIs return success when they accept the message, not when end-user receives it. Delivery status arrives later via webhook.

**How to avoid:**
- Mark as "SENT" when provider accepts message (initial state)
- Listen for provider webhooks (Twilio delivery status, AWS SNS confirmations, Slack message posted)
- Update status to "DELIVERED" when webhook confirms end-user receipt
- Set timeout (e.g., 5 minutes): if no delivery confirmation, mark as "DELIVERY_UNKNOWN"
- Retry or escalate to next channel if delivery fails

**Warning signs:**
- All notifications marked "delivered" but users report not receiving them
- No webhook endpoints for delivery status
- No status field distinguishing "sent to provider" vs "delivered to user"
- No timeout handling for stuck "sending" states

### Pitfall 6: SMS Character Limit Truncation Without Handling

**What goes wrong:** SMS has 160 character limit (GSM-7) or 70 characters (Unicode). Long incident titles get silently truncated, making SMS useless for understanding the alert.

**Why it happens:** Developers test with short messages. Real incidents have long service names and error messages.

**How to avoid:**
- Enforce 160 character limit in SMS formatter
- Truncate intelligently: `[CRITICAL] service-name: error message... Incident #123`
- Put most important info first (priority, service, incident ID)
- Keep action instructions short: "Reply ACK to acknowledge"
- Consider multi-part SMS for non-critical messages, but critical alerts should fit in 160 chars

**Warning signs:**
- SMS messages over 160 characters in tests
- No truncation logic in SMS formatter
- Important info (incident ID, service name) at end of message where it gets cut
- No character count validation

### Pitfall 7: Hardcoding Retry Delays Instead of Using Exponential Backoff

**What goes wrong:** Fixed retry delays (e.g., retry every 30 seconds) cause thundering herd when service recovers. All queued notifications retry simultaneously, overwhelming provider.

**Why it happens:** Fixed delays are simpler to understand and implement. Exponential backoff formula feels like overengineering.

**How to avoid:**
- Use BullMQ's built-in exponential backoff: `backoff: { type: 'exponential', delay: 30000 }`
- This gives delays like: 30s, 1m, 2m, 4m, 8m (2^n * 30s)
- Optionally add jitter to randomize retry times: `backoff: { type: 'exponential', delay: 30000, jitter: true }`
- Set maximum retry delay cap (e.g., max 5 minutes)

**Warning signs:**
- Fixed delay in retry logic: `setTimeout(retry, 30000)`
- All retries happen at same time after provider outage
- No jitter/randomization in retry timing
- Provider rate limit errors during recovery from outage

## Code Examples

Verified patterns from official sources:

### Email Notification with PagerDuty-Style Format

```typescript
// Source: AWS SES SDK + PagerDuty email pattern research - HIGH confidence

interface IncidentEmailData {
  incident: Incident;
  user: User;
  escalationLevel?: number;
  dashboardUrl: string;
}

async function sendIncidentEmail(data: IncidentEmailData): Promise<boolean> {
  const { incident, user, escalationLevel, dashboardUrl } = data;

  // Generate magic link tokens
  const ackToken = await generateMagicLinkToken(incident.id, 'acknowledge');
  const resolveToken = await generateMagicLinkToken(incident.id, 'resolve');

  const ackUrl = `${process.env.API_BASE_URL}/magic/ack/${incident.id}/${ackToken}`;
  const resolveUrl = `${process.env.API_BASE_URL}/magic/resolve/${incident.id}/${resolveToken}`;

  // Build subject with escalation prefix if applicable
  const subject = escalationLevel
    ? `[ESCALATION - Level ${escalationLevel}] [${incident.priority}] ${incident.service}: ${incident.title}`
    : `[${incident.priority}] ${incident.service}: ${incident.title}`;

  // Build HTML body
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .container { max-width: 600px; margin: 0 auto; }
    .header {
      background: ${incident.priority === 'CRITICAL' ? '#ff0000' : '#ff6600'};
      color: white;
      padding: 20px;
      text-align: center;
    }
    .content { padding: 24px; background: #f9f9f9; }
    .details { background: white; padding: 16px; border-left: 4px solid #007bff; margin: 16px 0; }
    .detail-row { margin: 8px 0; }
    .label { font-weight: bold; color: #666; }
    .alert-message {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      font-family: monospace;
      white-space: pre-wrap;
      margin: 16px 0;
    }
    .actions { text-align: center; margin: 24px 0; }
    .button {
      display: inline-block;
      padding: 12px 32px;
      margin: 8px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: bold;
      font-size: 14px;
    }
    .btn-primary { background: #007bff; color: white; }
    .btn-danger { background: #dc3545; color: white; }
    .footer {
      text-align: center;
      padding: 16px;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${incident.priority === 'CRITICAL' ? '🚨' : '⚠️'} ${incident.priority} Incident</h2>
      ${escalationLevel ? `<p style="margin: 8px 0;">Escalation Level ${escalationLevel}</p>` : ''}
    </div>

    <div class="content">
      <h3 style="margin-top: 0;">${incident.title}</h3>

      <div class="details">
        <div class="detail-row">
          <span class="label">Service:</span> ${incident.service}
        </div>
        <div class="detail-row">
          <span class="label">Priority:</span> ${incident.priority}
        </div>
        <div class="detail-row">
          <span class="label">Triggered:</span> ${formatTimestamp(incident.createdAt)}
        </div>
        <div class="detail-row">
          <span class="label">Alert Count:</span> ${incident.alertCount} alert${incident.alertCount > 1 ? 's' : ''}
        </div>
        <div class="detail-row">
          <span class="label">Incident:</span> #${incident.id}
        </div>
      </div>

      <div class="alert-message">${incident.description}</div>

      <div class="actions">
        <a href="${ackUrl}" class="button btn-primary">Acknowledge Incident</a>
        <a href="${resolveUrl}" class="button btn-danger">Resolve Incident</a>
      </div>

      <p style="text-align: center; margin: 24px 0;">
        <a href="${dashboardUrl}/incidents/${incident.id}" style="color: #007bff;">View Full Details in Dashboard →</a>
      </p>
    </div>

    <div class="footer">
      <p>Action links expire in 15 minutes.</p>
      <p>You're receiving this because you're on-call for ${incident.team.name}.</p>
    </div>
  </div>
</body>
</html>
  `;

  // Plain text version
  const textBody = `
${incident.priority === 'CRITICAL' ? '🚨' : '⚠️'} ${incident.priority} INCIDENT${escalationLevel ? ` - ESCALATION LEVEL ${escalationLevel}` : ''}

${incident.title}

Service: ${incident.service}
Priority: ${incident.priority}
Triggered: ${formatTimestamp(incident.createdAt)}
Alert Count: ${incident.alertCount}
Incident: #${incident.id}

Alert Message:
${incident.description}

Actions:
Acknowledge: ${ackUrl}
Resolve: ${resolveUrl}
View Dashboard: ${dashboardUrl}/incidents/${incident.id}

Links expire in 15 minutes.
  `.trim();

  try {
    const command = new SendEmailCommand({
      Source: process.env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [user.email] },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: htmlBody },
          Text: { Data: textBody }
        }
      }
    });

    await sesClient.send(command);
    return true;
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}
```

### SMS Notification with 160-Character Limit

```typescript
// Source: Twilio SMS best practices + user requirements - HIGH confidence

interface IncidentSMSData {
  incident: Incident;
  user: User;
  escalationLevel?: number;
}

function buildSMSMessage(data: IncidentSMSData): string {
  const { incident, escalationLevel } = data;

  // Format: [PRIORITY] service: message. Incident #ID - Reply ACK
  let prefix = escalationLevel
    ? `[ESC-L${escalationLevel}][${incident.priority}]`
    : `[${incident.priority}]`;

  // Calculate available space for message
  const overhead = prefix.length + incident.service.length + incident.id.length + 30; // includes " ", ": ", ". Incident #", " - Reply ACK"
  const availableChars = 160 - overhead;

  // Truncate message to fit
  let message = incident.title;
  if (message.length > availableChars) {
    message = message.substring(0, availableChars - 3) + '...';
  }

  return `${prefix} ${incident.service}: ${message}. Incident #${incident.id} - Reply ACK`;
}

async function sendSMS(data: IncidentSMSData): Promise<boolean> {
  const { user } = data;
  const body = buildSMSMessage(data);

  // Ensure under 160 characters
  if (body.length > 160) {
    console.error('SMS message exceeds 160 characters:', body.length);
    // Truncate as emergency fallback
    body = body.substring(0, 160);
  }

  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone,
      body,
      statusCallback: `${process.env.API_BASE_URL}/webhooks/twilio/sms/status`
    });
    return true;
  } catch (error) {
    console.error('SMS send failed:', error);
    return false;
  }
}

// Handle SMS replies (ACK)
app.post('/webhooks/twilio/sms/inbound', async (req, res) => {
  const { From, Body } = req.body;

  // Parse incident ID from reply
  const match = Body.match(/\b(\d{4,})\b/);  // Find incident ID (4+ digits)
  if (!match) {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: From,
      body: 'Reply with incident number to acknowledge (e.g., "ACK 1234")'
    });
    return res.status(200).send();
  }

  const incidentId = match[1];
  const isAck = /\b(ack|acknowledge)\b/i.test(Body);

  if (isAck) {
    try {
      const user = await prisma.user.findUnique({ where: { phone: From } });
      await acknowledgeIncident(incidentId, user.id);

      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: From,
        body: `✓ Incident #${incidentId} acknowledged`
      });
    } catch (error) {
      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: From,
        body: `Failed to acknowledge incident #${incidentId}: ${error.message}`
      });
    }
  }

  res.status(200).send();
});
```

### Channel Failover Logic

```typescript
// Source: Architecture patterns + retry strategies - HIGH confidence

interface ChannelEscalationConfig {
  primary: string[];      // Try these in parallel
  secondary: string[];    // Try if primary all fail
  fallback: string[];     // Last resort
}

const CHANNEL_ESCALATION: ChannelEscalationConfig = {
  primary: ['email', 'slack', 'push'],     // Non-intrusive, parallel
  secondary: ['sms'],                      // Intrusive, try if primary fails
  fallback: ['voice']                      // Most intrusive, last resort
};

async function sendNotificationWithFailover(
  incident: Incident,
  user: User,
  attemptedChannels: Set<string> = new Set()
): Promise<{ success: boolean; channel?: string; allFailed: boolean }> {

  // Get user's enabled channels
  const userChannels = await getUserEnabledChannels(user.id);

  // Determine which channels to try based on escalation level
  let channelsToTry: string[] = [];

  if (attemptedChannels.size === 0) {
    // First attempt: try primary channels
    channelsToTry = CHANNEL_ESCALATION.primary.filter(c => userChannels.includes(c));
  } else if (CHANNEL_ESCALATION.primary.every(c => attemptedChannels.has(c))) {
    // Primary failed: try secondary
    channelsToTry = CHANNEL_ESCALATION.secondary.filter(c => userChannels.includes(c) && !attemptedChannels.has(c));
  } else if (CHANNEL_ESCALATION.secondary.every(c => attemptedChannels.has(c))) {
    // Secondary failed: try fallback
    channelsToTry = CHANNEL_ESCALATION.fallback.filter(c => userChannels.includes(c) && !attemptedChannels.has(c));
  }

  if (channelsToTry.length === 0) {
    return { success: false, allFailed: true };
  }

  // Try channels (parallel for primary, sequential for secondary/fallback)
  const isParallel = attemptedChannels.size === 0;

  if (isParallel) {
    // Try all primary channels in parallel
    const results = await Promise.allSettled(
      channelsToTry.map(channel =>
        sendToChannel(channel, incident, user)
      )
    );

    // Check if any succeeded
    const successful = results.findIndex(r => r.status === 'fulfilled' && r.value === true);
    if (successful !== -1) {
      return { success: true, channel: channelsToTry[successful], allFailed: false };
    }

    // All primary failed, mark as attempted
    channelsToTry.forEach(c => attemptedChannels.add(c));

    // Recursively try secondary
    return sendNotificationWithFailover(incident, user, attemptedChannels);
  } else {
    // Try secondary/fallback sequentially
    for (const channel of channelsToTry) {
      try {
        const success = await sendToChannel(channel, incident, user);
        if (success) {
          return { success: true, channel, allFailed: false };
        }
      } catch (error) {
        console.error(`Channel ${channel} failed:`, error);
      }

      attemptedChannels.add(channel);
    }

    // Try next tier
    return sendNotificationWithFailover(incident, user, attemptedChannels);
  }
}

async function sendToChannel(channel: string, incident: Incident, user: User): Promise<boolean> {
  const channelImpl = getChannelImplementation(channel);
  const result = await channelImpl.send({
    incidentId: incident.id,
    userId: user.id,
    title: incident.title,
    body: incident.description,
    priority: incident.priority
  });

  return result.success;
}

// Handle total failure
async function handleAllChannelsFailed(incident: Incident, user: User) {
  // Create escalation alert for ops team
  await createIncident({
    title: `NOTIFICATION DELIVERY FAILED: All channels failed for incident #${incident.id}`,
    description: `Failed to notify ${user.email} about ${incident.priority} incident via any channel. User: ${user.id}, Incident: ${incident.id}`,
    priority: 'CRITICAL',
    service: 'oncall-platform',
    teamId: 'ops-team-id'
  });

  // Log to monitoring
  console.error('All notification channels failed', {
    incidentId: incident.id,
    userId: user.id,
    priority: incident.priority
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| **Slack Legacy Tokens** | OAuth 2.0 with user/bot tokens | 2020 | Legacy tokens deprecated. Must use OAuth with proper scopes. Bot tokens for posting, user tokens for on-behalf-of actions. |
| **Twilio Legacy REST API** | Twilio REST API with StatusCallback | Ongoing | StatusCallback webhooks provide async delivery confirmation. Don't mark as delivered synchronously. |
| **AWS SNS SMS only** | AWS SNS SMS + Mobile Push unified | 2015+ | SNS now abstracts FCM/APNs. Use platform endpoints for push, not direct FCM/APNs integration unless you need advanced features. |
| **BullMQ v4 backoff** | BullMQ v5 with jitter support | 2023 | V5 adds jitter to exponential backoff (`backoff: { type: 'exponential', delay: ms, jitter: true }`). Prevents thundering herd on retry. |
| **Manual Slack message update** | Block Kit with dynamic updates | 2019+ | Use Block Kit `actions` block with `action_id`. Update messages via `chat.update` with same timestamp. More reliable than manual JSON. |
| **Email plain text** | HTML + plain text multipart | Ongoing | Always send both HTML and plain text. Some email clients strip HTML. AWS SES requires both for best deliverability. |

**Deprecated/outdated:**
- **Slack verification token**: Replaced by request signing (HMAC-SHA256). Tokens are in payload but should not be used for verification.
- **Twilio StatusCallback v1**: Use StatusCallback with `StatusCallbackEvent` array to get granular call/sms events.
- **iOS APNS certificate-based auth**: Token-based auth (JWT) is preferred. Certificates expire and require manual rotation.
- **Android FCM legacy HTTP API**: Use FCM HTTP v1 API. Legacy API deprecated in June 2024.

## Open Questions

Things that couldn't be fully resolved:

1. **iOS Critical Alert Entitlement Process**
   - What we know: Requires `com.apple.developer.usernotifications.critical-alerts` entitlement and special approval from Apple
   - What's unclear: Exact approval process, typical approval timeline, rejection criteria
   - Recommendation: Apply for entitlement early in development. Fallback: use high-priority notifications (interruption-level: active) without critical flag. Document in plan that critical alerts require Apple approval.

2. **Slack Rate Limits Under High Load**
   - What we know: Slack recommends 1 message/second per channel, higher for bot tokens with rate limit tiers
   - What's unclear: Exact rate limits for different Slack workspace tiers (free, pro, enterprise), how to detect rate limit tier programmatically
   - Recommendation: Implement exponential backoff on 429 responses. Queue messages during rate limits rather than dropping. Monitor `Retry-After` header.

3. **Microsoft Teams Message Update Limitations**
   - What we know: Teams supports updating messages via `UpdateActivityAsync`, similar to Slack's `chat.update`
   - What's unclear: Can adaptive cards be updated with new data after button click, or only replaced entirely? Are there limitations on update frequency?
   - Recommendation: Test optimistic UI pattern early. Fallback: send new message instead of updating if updates prove unreliable.

4. **SMS Delivery Rate for Twilio vs AWS SNS**
   - What we know: Twilio is primary, AWS SNS is failover. Both have different delivery speeds and global coverage
   - What's unclear: Which regions have better SNS vs Twilio delivery? What's the latency difference?
   - Recommendation: Use Twilio as primary for voice+SMS (already integrated), SNS as automatic failover only when Twilio fails. Monitor delivery rates per region.

## Sources

### Primary (HIGH confidence)
- BullMQ retry documentation: https://docs.bullmq.io/guide/retrying-failing-jobs (verified 2026-02-06)
- Slack Block Kit documentation: https://docs.slack.dev/messaging/creating-interactive-messages (verified 2026-02-06)
- Slack slash commands: https://docs.slack.dev/interactivity/implementing-slash-commands (verified 2026-02-06)
- Twilio TwiML documentation: https://www.twilio.com/docs/voice/twiml (verified 2026-02-06)
- Twilio Messaging Services: https://www.twilio.com/docs/messaging/services (verified 2026-02-06)
- AWS SNS mobile push: https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-application-as-subscriber.html (verified 2026-02-06)
- Microsoft Teams conversation basics: https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/conversation-basics (verified 2026-02-06)
- OWASP password reset security: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (verified 2026-02-06)

### Secondary (MEDIUM confidence)
- iOS critical alerts: Pattern inferred from APNs documentation structure (JavaScript-blocked page, couldn't fetch full content). Requires verification with actual Apple Developer docs.
- Android notification channels: FCM documentation returned 404, pattern inferred from Android developer documentation general knowledge
- Slack rate limits: Mentioned in Slack docs but specific tier limits not documented publicly
- AWS SNS critical notifications: SNS docs don't explicitly cover iOS critical alerts, pattern inferred from APNs + SNS integration

### Tertiary (LOW confidence - needs validation)
- PagerDuty email format: Could not access PagerDuty documentation directly. Email format based on user requirement specification and industry patterns. Recommend reviewing actual PagerDuty emails for exact format.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via package.json, official documentation, and version numbers current
- Architecture patterns: HIGH - Patterns verified with BullMQ docs, Slack docs, Twilio docs, official SDKs
- Slack/Teams integration: HIGH - Official SDK documentation verified, interaction patterns confirmed
- Voice/IVR: HIGH - Twilio TwiML documentation complete and authoritative
- Magic links: MEDIUM-HIGH - OWASP guidance authoritative, but implementation pattern is inferred
- Push notifications: MEDIUM - AWS SNS verified, but iOS critical alerts documentation incomplete (JS-blocked page)
- SMS character limits: HIGH - GSM-7 standard and Twilio documentation clear
- Pitfalls: HIGH - Based on established anti-patterns from architecture research and personal experience with notification systems

**Research date:** 2026-02-06
**Valid until:** 30 days (stable technologies), 7 days for fast-moving APIs (Slack, Teams)
