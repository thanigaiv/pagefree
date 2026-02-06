# Architecture Research: Incident Management Platform

**Domain:** Digital Operations Reliability / On-Call Management Platform
**Researched:** 2026-02-06
**Confidence:** MEDIUM-HIGH

## Standard Architecture

Incident management platforms like PagerDuty, Opsgenie, GoAlert, and Grafana OnCall share a common architectural pattern built around event-driven, highly reliable message processing with clear component boundaries.

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INGESTION LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Webhook  │  │  Email   │  │   API    │  │Integration│               │
│  │ Receiver │  │ Receiver │  │ Gateway  │  │ Webhooks  │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────┘               │
│       │             │             │             │                       │
│       └─────────────┴─────────────┴─────────────┘                       │
│                              ↓                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                         PROCESSING LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐            │
│  │              Alert Processing Engine                     │            │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────┐     │            │
│  │  │De-duplicate│  │ Enrichment  │  │  Validation  │     │            │
│  │  └──────┬─────┘  └──────┬──────┘  └──────┬───────┘     │            │
│  │         └────────────────┴────────────────┘             │            │
│  └──────────────────────────┬──────────────────────────────┘            │
│                              ↓                                           │
│  ┌─────────────────────────────────────────────────────────┐            │
│  │              Routing & Escalation Engine                 │            │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────┐     │            │
│  │  │ Schedule   │  │ Escalation  │  │   Policy     │     │            │
│  │  │ Resolver   │  │  Manager    │  │   Matcher    │     │            │
│  │  └──────┬─────┘  └──────┬──────┘  └──────┬───────┘     │            │
│  │         └────────────────┴────────────────┘             │            │
│  └──────────────────────────┬──────────────────────────────┘            │
│                              ↓                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                        NOTIFICATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐            │
│  │           Notification Dispatcher (Job Queue)            │            │
│  └──────────────────────────┬──────────────────────────────┘            │
│       │          │          │          │          │                     │
│  ┌────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌───┴────┐ ┌──┴──────┐              │
│  │  Push  │ │  SMS   │ │ Email  │ │ Voice  │ │ Webhook │              │
│  │Provider│ │Provider│ │Provider│ │Provider│ │ Delivery│              │
│  └────┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └──┬──────┘              │
│       └─────────┴──────────┴──────────┴──────────┘                     │
│                              ↓                                           │
│           External Services (FCM, SNS, Twilio, SMTP)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                         PERSISTENCE LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  PostgreSQL  │  │  Redis/Cache │  │ Object Store │                  │
│  │  (Primary)   │  │  (Sessions)  │  │  (Logs/Audit)│                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
├─────────────────────────────────────────────────────────────────────────┤
│                         BACKGROUND SERVICES                              │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Scheduler│  │ Heartbeat│  │ Rotation │  │ Cleanup  │               │
│  │ (Cron)   │  │ Monitor  │  │ Manager  │  │ Worker   │               │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘               │
├─────────────────────────────────────────────────────────────────────────┤
│                          REAL-TIME LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐         ┌────────────────────┐                 │
│  │  WebSocket Server  │         │  Event Bus         │                 │
│  │  (Socket.IO/WS)    │ ←─────→ │  (Redis Pub/Sub)   │                 │
│  └────────────────────┘         └────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Webhook Receiver** | Accept external alerts via HTTP POST, validate signatures, enqueue for processing | Express/Fastify endpoints with signature verification |
| **API Gateway** | RESTful/GraphQL API for alert creation, acknowledgment, manual operations | Express + GraphQL or REST controllers |
| **Alert Processing Engine** | De-duplicate alerts by alias/fingerprint, enrich with metadata, validate structure | Background workers with idempotent receivers |
| **Routing Engine** | Determine who should be notified based on schedules, on-call rotations, service ownership | Schedule resolver + policy matcher |
| **Escalation Manager** | Track escalation state, trigger timeouts, advance through escalation levels | State machine with timeout tracking |
| **Notification Dispatcher** | Fan out notifications across multiple channels, manage retry policies | Job queue (BullMQ/AWS SQS) with exponential backoff |
| **Channel Providers** | Interface with external services (Twilio, AWS SNS, FCM, SMTP) | Adapter pattern with provider-specific clients |
| **Schedule Resolver** | Determine current on-call engineer(s) based on rotation schedules | Calendar logic with timezone handling |
| **Heartbeat Monitor** | Detect missed heartbeats, auto-trigger alerts | Scheduled job checking last heartbeat timestamps |
| **Rotation Manager** | Execute scheduled on-call rotations, notify participants | Cron-based scheduler |
| **Real-time Event Bus** | Push status updates to connected web/mobile clients | Redis Pub/Sub + WebSocket/Socket.IO |
| **Persistence Layer** | Store alerts, incidents, schedules, user data | PostgreSQL (primary) + Redis (cache/sessions) |

## Recommended Project Structure

```
src/
├── api/                    # API layer (REST/GraphQL)
│   ├── routes/            # HTTP route handlers
│   ├── resolvers/         # GraphQL resolvers
│   ├── middleware/        # Auth, validation, rate limiting
│   └── validators/        # Request validation schemas
├── ingestion/             # Alert ingestion components
│   ├── webhooks/          # Webhook receivers
│   ├── email/             # Email-to-alert parser
│   └── integrations/      # External integration handlers
├── engine/                # Core processing logic
│   ├── alert-processor/   # De-duplication, enrichment, validation
│   ├── routing/           # Schedule resolution, policy matching
│   ├── escalation/        # Escalation state machine
│   └── notification/      # Notification dispatch logic
├── workers/               # Background job processors
│   ├── notification-worker.ts  # Process notification jobs
│   ├── escalation-worker.ts    # Handle escalation timeouts
│   ├── heartbeat-worker.ts     # Monitor heartbeats
│   └── rotation-worker.ts      # Execute rotations
├── services/              # External service integrations
│   ├── push/              # Mobile push (FCM/APNs via SNS)
│   ├── sms/               # SMS provider (Twilio/SNS)
│   ├── email/             # Email provider (SES/SMTP)
│   ├── voice/             # Voice call provider (Twilio)
│   └── webhook/           # Outbound webhook delivery
├── realtime/              # Real-time communication
│   ├── websocket/         # WebSocket server (Socket.IO)
│   └── event-bus/         # Event publishing/subscription
├── models/                # Database models (TypeORM/Prisma)
│   ├── alert.model.ts
│   ├── incident.model.ts
│   ├── schedule.model.ts
│   ├── escalation-policy.model.ts
│   └── user.model.ts
├── lib/                   # Shared utilities
│   ├── queue/             # Job queue abstraction (BullMQ)
│   ├── cache/             # Cache abstraction (Redis)
│   ├── logger/            # Structured logging
│   └── metrics/           # Prometheus metrics
├── config/                # Configuration management
│   ├── database.ts
│   ├── queue.ts
│   └── providers.ts
└── scripts/               # Migrations, seed data, ops tools
    ├── migrations/
    └── seeds/
```

### Structure Rationale

- **api/**: Clean separation between HTTP/GraphQL interface and business logic
- **ingestion/**: Isolated entry points for alerts make it easy to add new sources
- **engine/**: Core business logic independent of transport (testable without HTTP)
- **workers/**: Background processing separated from API request path for reliability
- **services/**: Adapter pattern for external providers enables easy swapping/testing
- **realtime/**: Real-time concerns isolated from request/response patterns
- **models/**: Database entities centralized for ORM/query optimization
- **lib/**: Cross-cutting concerns abstracted for reusability

## Data Flow Patterns

### Critical Path: Alert Ingestion to Notification

```
1. INGESTION (< 100ms target)
   External Source → Webhook/API → Signature Validation
                                    ↓
                             Quick ACK (202 Accepted)
                                    ↓
                          Enqueue to Alert Queue

2. PROCESSING (< 1s target)
   Alert Queue → Alert Processor
                      ↓
            ┌─────────┴──────────┐
            │                    │
      De-duplicate          Enrich/Validate
      (by alias)           (required fields)
            │                    │
            └─────────┬──────────┘
                      ↓
              Create/Update Alert
                      ↓
              Store in Database
                      ↓
          Publish to Routing Engine

3. ROUTING (< 500ms target)
   Routing Engine → Schedule Resolver → Current On-Call User(s)
                         ↓
                  Escalation Policy Matcher
                         ↓
            Determine Notification Targets
                         ↓
              Enqueue Notification Jobs
                  (one per channel)

4. NOTIFICATION (< 5s target)
   Notification Queue → Notification Worker
                              ↓
                    Select Channel Provider
                              ↓
                     Call External Service
                          (with retry)
                              ↓
                    Update Delivery Status
                              ↓
                 Publish Real-time Event
                              ↓
              WebSocket → Mobile/Web Client
```

### Escalation Flow

```
Alert Created → Start Escalation Timer (e.g., 5 minutes)
                         ↓
               Notify Level 1 Responders
                         ↓
           ┌─────────────┴─────────────┐
           │                           │
    Alert Acknowledged           Timer Expires
           │                           │
           ↓                           ↓
    Stop Escalation           Escalate to Level 2
                                      ↓
                           Notify Level 2 Responders
                                      ↓
                              (repeat until resolved
                               or max level reached)
```

### Schedule Resolution Flow

```
Alert Received → Extract Service → Get Escalation Policy
                                           ↓
                                  Get Schedule References
                                           ↓
                                  Current Time + Timezone
                                           ↓
                          Query: Who is on-call NOW?
                                           ↓
                          Calculate Rotation Position
                                           ↓
                             Return User(s) to Notify
```

### Real-time Update Flow

```
Alert State Change → Emit to Event Bus (Redis Pub/Sub)
                              ↓
                   Event Bus Subscribers:
                   ├─→ WebSocket Server → Connected Clients
                   ├─→ Audit Logger → Database
                   └─→ Metrics Collector → Prometheus
```

## Architectural Patterns

### Pattern 1: Fire-and-Forget Ingestion with Async Processing

**What:** Accept incoming alerts with minimal processing, return 202 Accepted immediately, then process asynchronously in background workers.

**When to use:** Alert ingestion endpoints where external systems expect quick responses.

**Trade-offs:**
- ✅ **Pro:** Prevents source timeout, high throughput, decouples ingestion from processing
- ✅ **Pro:** Source gets immediate confirmation, reducing retry storms
- ❌ **Con:** Validation errors aren't immediately returned to caller
- ❌ **Con:** Requires job queue infrastructure

**Example:**
```typescript
// Ingestion endpoint
app.post('/api/v1/alerts', async (req, res) => {
  // 1. Quick validation (signature, structure)
  if (!validateWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Enqueue for processing
  const jobId = await alertQueue.add('process-alert', {
    source: 'webhook',
    payload: req.body,
    receivedAt: Date.now()
  });

  // 3. Return immediately
  res.status(202).json({
    message: 'Alert accepted',
    jobId,
    requestId: req.id
  });
});

// Background worker
alertQueue.process('process-alert', async (job) => {
  const { payload } = job.data;

  // Heavy processing: de-dupe, enrich, route, notify
  await alertProcessor.process(payload);
});
```

### Pattern 2: Idempotent Alert Processing

**What:** Use alert aliases/fingerprints to detect duplicates and ensure processing is idempotent. Process the same alert multiple times without creating duplicate incidents.

**When to use:** Any alert processing system where sources may retry or send duplicates.

**Trade-offs:**
- ✅ **Pro:** Prevents duplicate incidents from retry storms
- ✅ **Pro:** Enables safe retries throughout the pipeline
- ❌ **Con:** Requires stable fingerprinting logic (what makes alerts "the same"?)

**Example:**
```typescript
interface Alert {
  alias: string;  // Stable identifier from source
  fingerprint?: string;  // Generated from content hash
  dedup_key?: string;  // Explicit deduplication key
}

async function processAlert(alert: Alert) {
  // 1. Determine dedup key (in order of preference)
  const dedupKey = alert.dedup_key
    || alert.alias
    || generateFingerprint(alert);

  // 2. Atomic upsert: create if new, update if exists
  const incident = await db.incidents.upsert({
    where: { dedup_key: dedupKey },
    create: {
      dedup_key: dedupKey,
      title: alert.title,
      status: 'triggered',
      triggered_at: new Date(),
      // ... other fields
    },
    update: {
      last_occurrence_at: new Date(),
      occurrence_count: { increment: 1 },
      // Don't overwrite resolution state
    }
  });

  // 3. Only route if newly created or re-triggered
  if (incident.created_at === incident.updated_at
      || incident.status === 'resolved') {
    await routingEngine.route(incident);
  }
}
```

### Pattern 3: Job Queue for Notification Delivery

**What:** Use a persistent job queue (BullMQ, AWS SQS) for all notification delivery with exponential backoff retry policies.

**When to use:** Any notification delivery to external services (push, SMS, email, voice, webhooks).

**Trade-offs:**
- ✅ **Pro:** Automatic retries with backoff, survives service restarts
- ✅ **Pro:** Rate limiting per provider, concurrency control
- ✅ **Pro:** Dead letter queue for failed deliveries
- ❌ **Con:** Adds latency (minimal, ~50-200ms overhead)
- ❌ **Con:** Requires Redis or similar job queue infrastructure

**Example:**
```typescript
// Enqueue notification
await notificationQueue.add('send-push', {
  userId: 'user-123',
  channel: 'push',
  message: {
    title: 'Critical Alert',
    body: 'Database CPU at 95%',
    data: { incidentId: 'inc-456' }
  }
}, {
  attempts: 5,  // Retry up to 5 times
  backoff: {
    type: 'exponential',
    delay: 1000  // 1s, 2s, 4s, 8s, 16s
  },
  removeOnComplete: true,
  removeOnFail: false  // Keep failed jobs for inspection
});

// Worker with provider abstraction
notificationQueue.process('send-push', async (job) => {
  const { userId, message } = job.data;

  // Get user's device tokens
  const devices = await db.devices.findMany({
    where: { userId, channel: 'push' }
  });

  // Send via SNS (abstracts FCM/APNs)
  for (const device of devices) {
    await sns.publish({
      TargetArn: device.endpoint_arn,
      Message: JSON.stringify(message)
    });
  }

  // Update delivery status
  await db.notifications.update({
    where: { id: job.id },
    data: {
      status: 'delivered',
      delivered_at: new Date()
    }
  });
});
```

### Pattern 4: Schedule Resolver with Caching

**What:** Cache current on-call assignments with TTL, invalidate on schedule changes. Avoid recalculating rotations on every alert.

**When to use:** High-frequency alert routing where schedules change infrequently.

**Trade-offs:**
- ✅ **Pro:** Dramatically faster routing (cache hit: <5ms vs 50-200ms calculation)
- ✅ **Pro:** Reduces database load during incident storms
- ❌ **Con:** Must invalidate cache on schedule/rotation changes
- ❌ **Con:** Short TTL (1-5 min) needed to catch rotation boundaries

**Example:**
```typescript
class ScheduleResolver {
  async getCurrentOnCall(scheduleId: string): Promise<User[]> {
    const cacheKey = `oncall:${scheduleId}:${getCurrentMinute()}`;

    // Try cache first (1 minute TTL)
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Calculate from rotation rules
    const users = await this.calculateOnCall(scheduleId);

    // Cache until next minute boundary
    const ttl = 60 - (Date.now() % 60000) / 1000;
    await redis.setex(cacheKey, Math.ceil(ttl), JSON.stringify(users));

    return users;
  }

  async invalidateSchedule(scheduleId: string) {
    // Delete all cached entries for this schedule
    const pattern = `oncall:${scheduleId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

### Pattern 5: Event Bus for Real-time Updates

**What:** Use Redis Pub/Sub for broadcasting state changes to WebSocket servers and other subscribers. Enables real-time UI updates without polling.

**When to use:** Any state change that web/mobile clients need to see immediately (alert status, acknowledgments, escalations).

**Trade-offs:**
- ✅ **Pro:** True real-time updates, no polling overhead
- ✅ **Pro:** Decouples event producers from WebSocket server
- ❌ **Con:** No delivery guarantees (use Redis Streams if persistence needed)
- ❌ **Con:** Subscribers must be connected to receive events

**Example:**
```typescript
// Producer: Publish state changes
async function acknowledgeAlert(alertId: string, userId: string) {
  await db.alerts.update({
    where: { id: alertId },
    data: {
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date()
    }
  });

  // Publish to event bus
  await redis.publish('alerts:state-change', JSON.stringify({
    event: 'alert.acknowledged',
    alertId,
    userId,
    timestamp: Date.now()
  }));
}

// Consumer: WebSocket server subscribes
const subscriber = redis.duplicate();
await subscriber.subscribe('alerts:state-change');

subscriber.on('message', (channel, message) => {
  const event = JSON.parse(message);

  // Broadcast to relevant WebSocket clients
  io.to(`alert:${event.alertId}`).emit('alert:updated', event);
});

// Client subscribes to specific alerts
socket.on('subscribe:alert', (alertId) => {
  socket.join(`alert:${alertId}`);
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous Notification Delivery in Request Path

**What people do:** Send push notifications, SMS, emails directly in the HTTP request handler before returning response.

**Why it's wrong:**
- HTTP timeouts (30-60s) when external services are slow
- Failed notifications block API responses
- No automatic retry logic
- Difficult to implement rate limiting per provider
- Service restarts lose in-flight notifications

**Do this instead:** Always use a job queue for notification delivery. Return 202 Accepted immediately, let workers handle delivery with retries.

```typescript
// ❌ BAD: Synchronous delivery
app.post('/api/v1/alerts', async (req, res) => {
  const alert = await createAlert(req.body);

  // Blocks response until SMS is sent!
  await twilio.sendSMS({
    to: oncallUser.phone,
    body: alert.message
  });

  res.json({ success: true });
});

// ✅ GOOD: Async via queue
app.post('/api/v1/alerts', async (req, res) => {
  const alert = await createAlert(req.body);

  await notificationQueue.add('send-sms', {
    userId: oncallUser.id,
    message: alert.message
  });

  res.status(202).json({
    alert_id: alert.id,
    status: 'processing'
  });
});
```

### Anti-Pattern 2: Polling for Schedule Resolution

**What people do:** Calculate current on-call engineer from scratch on every alert by querying schedules, rotations, time zones, overrides.

**Why it's wrong:**
- Expensive calculation (50-200ms) repeated thousands of times during incidents
- Database load spikes during alert storms
- Doesn't scale beyond ~100 alerts/second

**Do this instead:** Cache current on-call assignments with short TTL (1-5 minutes). Invalidate cache when schedules change.

```typescript
// ❌ BAD: Recalculate every time
async function routeAlert(alert: Alert) {
  const schedule = await db.schedules.findOne(alert.scheduleId);
  const rotations = await db.rotations.findMany({ scheduleId: schedule.id });
  const overrides = await db.overrides.findMany({
    scheduleId: schedule.id,
    active: true
  });

  // Complex calculation on every alert
  const oncallUser = calculateCurrentOnCall(schedule, rotations, overrides);
  await notify(oncallUser, alert);
}

// ✅ GOOD: Cache with invalidation
async function routeAlert(alert: Alert) {
  const oncallUser = await scheduleResolver.getCurrentOnCall(alert.scheduleId);
  await notify(oncallUser, alert);
}
```

### Anti-Pattern 3: Storing Notification State in Memory

**What people do:** Track escalation timers, retry attempts, delivery status in Node.js process memory.

**Why it's wrong:**
- Lost on service restart/crash (common during deploys)
- Doesn't work with multiple instances (can't scale horizontally)
- No visibility into "stuck" notifications

**Do this instead:** Store all state in database or job queue. Use job queue's built-in retry and timeout mechanisms.

```typescript
// ❌ BAD: In-memory timers
const escalationTimers = new Map<string, NodeJS.Timeout>();

function startEscalation(alertId: string) {
  const timer = setTimeout(async () => {
    await escalateToLevel2(alertId);
  }, 5 * 60 * 1000);  // Lost if process restarts!

  escalationTimers.set(alertId, timer);
}

// ✅ GOOD: Database-backed with scheduled job
async function startEscalation(alertId: string) {
  await db.escalations.create({
    alertId,
    level: 1,
    escalate_at: new Date(Date.now() + 5 * 60 * 1000),
    status: 'pending'
  });

  // Scheduled worker checks for expired escalations
  await escalationQueue.add('check-escalations', {}, {
    repeat: { every: 10000 }  // Check every 10s
  });
}
```

### Anti-Pattern 4: Using WebSockets for Critical Notification Delivery

**What people do:** Rely solely on WebSocket/Socket.IO connections to deliver critical alerts to mobile apps.

**Why it's wrong:**
- Mobile apps in background can't maintain persistent connections (iOS/Android restrictions)
- Connection breaks = missed alerts (no retry mechanism)
- No delivery confirmation
- Doesn't work when app is closed

**Do this instead:** Use platform push notifications (FCM/APNs) as primary channel, WebSockets for real-time updates to active sessions only.

```typescript
// ❌ BAD: WebSocket only
async function notifyUser(userId: string, alert: Alert) {
  const socket = connectedUsers.get(userId);
  if (socket) {
    socket.emit('alert', alert);  // What if connection dropped?
  }
}

// ✅ GOOD: Push + WebSocket
async function notifyUser(userId: string, alert: Alert) {
  // Primary: Always send push (reaches background apps)
  await sendPushNotification(userId, alert);

  // Secondary: Also send via WebSocket if connected (instant)
  const socket = connectedUsers.get(userId);
  if (socket?.connected) {
    socket.emit('alert', alert);
  }
}
```

### Anti-Pattern 5: No Alert Deduplication

**What people do:** Create a new incident for every incoming alert, even if it's the same issue reported multiple times.

**Why it's wrong:**
- Alert storms create thousands of duplicate incidents
- Responders get overwhelmed with notifications
- Database fills with redundant data
- No way to see "this happened 50 times in 5 minutes"

**Do this instead:** Always use deduplication keys (alias, fingerprint, or explicit dedup_key). Increment occurrence count instead of creating duplicates.

```typescript
// ❌ BAD: No deduplication
async function processAlert(alert: Alert) {
  const incident = await db.incidents.create({
    title: alert.title,
    // Always creates new incident!
  });
  await notify(incident);
}

// ✅ GOOD: Deduplication with upsert
async function processAlert(alert: Alert) {
  const dedupKey = alert.dedup_key || generateFingerprint(alert);

  const incident = await db.incidents.upsert({
    where: { dedup_key: dedupKey },
    create: {
      dedup_key: dedupKey,
      title: alert.title,
      occurrence_count: 1,
      // ...
    },
    update: {
      occurrence_count: { increment: 1 },
      last_occurrence_at: new Date()
    }
  });

  // Only notify if newly created
  if (incident.occurrence_count === 1) {
    await notify(incident);
  }
}
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-50 users, <100 alerts/day** | Monolith is fine. Single Node.js server, PostgreSQL, Redis. Host on single EC2/ECS instance. Total infra: ~$100-200/month. |
| **50-500 users, <1K alerts/day** | Add horizontal scaling: 2-3 API servers behind ALB, separate worker processes. Still single DB. Add read replica if needed. Infra: ~$500-1000/month. |
| **500-5K users, <10K alerts/day** | Separate services: API tier (3+ instances), Worker tier (5+ instances), Redis cluster (3 nodes), PostgreSQL with connection pooling. Add CDN for static assets. Infra: ~$2K-5K/month. |
| **5K+ users, >10K alerts/day** | Regional isolation, queue partitioning, caching layer (ElastiCache), separate notification workers by channel, database sharding by tenant/organization. Monitor & optimize hot paths. Infra: $10K+/month. |

### Scaling Priorities

1. **First bottleneck: Database connections during alert storms**
   - **Symptom:** Connection pool exhaustion, alerts taking >5s to process
   - **Fix:** Add read replicas, implement connection pooling (PgBouncer), cache schedule resolutions
   - **When:** >500 alerts/minute

2. **Second bottleneck: Notification delivery rate limits**
   - **Symptom:** Twilio/SNS rate limit errors, notifications delayed >30s
   - **Fix:** Implement per-provider rate limiting in job queue, use AWS SNS instead of direct Twilio for fan-out
   - **When:** >1000 notifications/minute

3. **Third bottleneck: Job queue latency**
   - **Symptom:** Redis memory pressure, jobs sitting in queue >10s
   - **Fix:** Redis cluster (separate queues: high-priority alerts, low-priority notifications), more worker processes
   - **When:** >5000 jobs/minute

4. **Fourth bottleneck: Real-time WebSocket fan-out**
   - **Symptom:** WebSocket server CPU at 100%, delayed UI updates
   - **Fix:** Redis adapter for Socket.IO (horizontal scaling), separate WebSocket cluster from API servers
   - **When:** >1000 concurrent connections

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **AWS SNS** | Push notifications (mobile) | Abstracts FCM/APNs, handles device token management. Use platform applications per iOS/Android. Retry policy: 50 attempts over 6 hours (customizable for HTTP). |
| **Twilio** | SMS + Voice calls | Configure retry policy (rc, rp params). Use separate messaging services for different priorities. Rate limits: check account tier. |
| **AWS SES / SMTP** | Email notifications | SES: 14 messages/sec sandbox, higher in production. Implement sending queue to respect limits. Handle bounces/complaints via SNS. |
| **Firebase Cloud Messaging** | Android push (via SNS) | SNS platform application handles FCM API v1. No direct FCM integration needed if using SNS. |
| **APNs** | iOS push (via SNS) | Token-based auth (preferred) or certificate-based. SNS manages connection pool and retries. |
| **Webhooks (outbound)** | Alert notifications to external systems | Implement retry policy (exponential backoff, 5-10 attempts). Sign payloads (HMAC SHA-256). Store delivery history. |
| **Monitoring Sources** | Webhook ingestion | Validate webhook signatures (Datadog, Prometheus Alertmanager, Grafana, CloudWatch). Each source has different payload format. |
| **Slack/Teams** | Rich notifications | Use incoming webhooks or bot APIs. Rate limits: 1 message/second per webhook. Implement queuing. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **API ↔ Workers** | Job Queue (BullMQ/SQS) | Async, durable. API enqueues jobs, workers process. No direct coupling. |
| **Workers ↔ Database** | Connection Pool | Workers use read-heavy queries. Consider read replicas for schedule resolution. |
| **API ↔ Real-time Server** | Redis Pub/Sub | Event bus pattern. API publishes state changes, WebSocket server subscribes and broadcasts. |
| **Workers ↔ External Services** | Direct HTTP (with retry) | Wrapped in job queue for retry logic. Circuit breaker pattern for failing providers. |
| **Web/Mobile ↔ API** | REST + GraphQL | REST for simple operations, GraphQL for complex queries. GraphQL subscriptions for real-time (WebSocket). |
| **Background Services ↔ Engine** | Database + Job Queue | Scheduler creates jobs, workers process. Heartbeat monitor queries DB, enqueues alerts. |

## Critical Reliability Patterns

### 1. Idempotent Alert Processing
- **Why:** Sources may retry, webhooks may duplicate, network issues cause replays
- **How:** Use stable deduplication keys (alias, fingerprint). Upsert instead of insert.
- **Impact:** Prevents duplicate incidents, enables safe retries throughout system

### 2. Async Processing with Job Queues
- **Why:** External services are slow/unreliable, must not block ingestion
- **How:** Fire-and-forget ingestion (202 Accepted), persistent job queue (BullMQ/SQS) with exponential backoff
- **Impact:** High throughput ingestion, automatic retries, survives service restarts

### 3. Multi-Channel Notification Redundancy
- **Why:** Any single channel can fail (push service down, SMS delayed, email filtered)
- **How:** Configure escalation policies with multiple channels. If push doesn't acknowledge in 2 min, try SMS, then voice.
- **Impact:** Ensures critical alerts reach responders even if primary channel fails

### 4. Database-Backed State Management
- **Why:** In-memory state lost on restart/crash, doesn't work with multiple instances
- **How:** Store escalation timers, retry counts, delivery status in PostgreSQL. Use job queue for scheduled actions.
- **Impact:** Survives deploys/crashes, enables horizontal scaling, provides audit trail

### 5. Schedule Resolution Caching with Invalidation
- **Why:** Recalculating on-call schedules is expensive, happens on every alert
- **How:** Cache current on-call assignments in Redis (1-5 min TTL). Invalidate on schedule changes.
- **Impact:** Sub-5ms routing decisions, handles alert storms without database overload

### 6. Real-time Updates via Event Bus
- **Why:** Users expect instant UI updates on alert status changes
- **How:** Redis Pub/Sub for state changes, WebSocket server subscribes and broadcasts to clients
- **Impact:** Real-time UX without polling, decouples API from WebSocket server

### 7. Circuit Breaker for External Services
- **Why:** Failing external service (Twilio down) shouldn't block all notifications
- **How:** Track failure rate per provider. If >50% fail in 1 min, open circuit (fail fast), retry after cooldown.
- **Impact:** Prevents cascading failures, surfaces issues quickly, falls back to alternate channels

## Build Order Recommendations

Based on dependency analysis, recommended implementation order:

### Phase 1: Foundation (Weeks 1-2)
**Core infrastructure that everything else depends on**
1. Database models (alerts, incidents, users, schedules)
2. Job queue setup (BullMQ + Redis)
3. Basic API structure (auth, middleware)
4. Alert ingestion endpoint (webhook receiver)
5. Simple notification worker (single channel: email or push)

**Why first:** Can't build anything else without data models and basic job processing. Early validation of infrastructure choices.

### Phase 2: Core Alert Flow (Weeks 3-4)
**Minimum viable alert processing**
1. Alert deduplication logic
2. Schedule resolver (current on-call calculation)
3. Routing engine (schedule → user mapping)
4. Notification dispatcher (enqueue notifications)
5. Basic escalation (single level)

**Why second:** Delivers end-to-end value (alert in → notification out). Validates core architecture before adding complexity.

### Phase 3: Multi-Channel Notifications (Week 5)
**Expand notification reliability**
1. SMS provider integration (Twilio/SNS)
2. Voice call integration
3. Push notification setup (FCM/APNs via SNS)
4. Webhook delivery (outbound)
5. Channel fallback logic

**Why third:** Improves reliability of existing flow. Independent workers can be built in parallel.

### Phase 4: Advanced Escalation (Week 6)
**Full escalation policy support**
1. Multi-level escalation policies
2. Timeout tracking and escalation worker
3. Acknowledgment flow (stops escalation)
4. Manual escalation controls

**Why fourth:** Requires core flow to be working. Adds sophistication to routing logic.

### Phase 5: Scheduling & Rotations (Weeks 7-8)
**On-call schedule management**
1. Schedule CRUD API
2. Rotation configuration (daily, weekly, custom)
3. Timezone handling
4. Schedule overrides (vacations, swaps)
5. Rotation worker (executes scheduled rotations)

**Why fifth:** Needed for real-world usage but can start with manual assignments. Complex logic best tackled after core reliability proven.

### Phase 6: Real-time & UX (Weeks 9-10)
**Real-time updates and web interface**
1. WebSocket server (Socket.IO)
2. Event bus integration (Redis Pub/Sub)
3. Web frontend (React dashboard)
4. Real-time incident updates
5. Mobile PWA (React + service worker)

**Why sixth:** UX polish after core functionality works. Can demo without real-time initially.

### Phase 7: Monitoring & Reliability (Weeks 11-12)
**Production hardening**
1. Heartbeat monitoring
2. Metrics collection (Prometheus)
3. Logging infrastructure (structured logs)
4. Circuit breakers for external services
5. Dead letter queue handling
6. Retry and backoff tuning

**Why seventh:** Essential for production but can launch without perfect observability. Tune based on real usage patterns.

## Sources

### High Confidence (Official Documentation & Verified Implementations)
- PagerDuty Events API documentation (2024)
- Opsgenie Alert API documentation (2024)
- GoAlert open-source repository structure analysis (Go/TypeScript/PostgreSQL architecture)
- Grafana OnCall repository architecture (Python/TypeScript, modular microservices)
- AWS SNS message delivery patterns and retry policies (official AWS docs)
- Redis Pub/Sub documentation (official Redis docs)
- PostgreSQL LISTEN/NOTIFY documentation (official PostgreSQL docs)
- BullMQ job queue architecture (official docs, Redis-backed)
- Socket.IO real-time communication patterns (official docs)
- Twilio webhook reliability patterns (official Twilio docs)

### Medium Confidence (Industry Patterns)
- Martin Fowler's distributed systems patterns (Leader/Followers, HeartBeat, Idempotent Receiver, Replicated Log)
- AWS EventBridge architecture patterns
- GitHub webhook best practices
- GraphQL subscriptions patterns (Apollo documentation)

### Architectural Decisions Based on Project Requirements
- Node.js/TypeScript stack (specified in project context)
- AWS infrastructure (specified in project context)
- PostgreSQL for primary data store (common in GoAlert, Grafana OnCall)
- Redis for caching and job queues (universal in this domain)
- React for web interface (specified in project context)

---
*Architecture research for: OnCall Platform - Digital Operations Reliability Platform*
*Researched: 2026-02-06*
*Confidence: MEDIUM-HIGH (verified against multiple production systems, official documentation for all external services)*
