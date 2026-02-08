# Phase 9: Status Pages - Research

**Researched:** 2026-02-07
**Domain:** Internal Status Pages with Incident-Driven Auto-Updates + Subscriber Notifications
**Confidence:** HIGH

## Summary

Phase 9 implements internal (private) status pages that automatically reflect incident state and allow manual maintenance window updates. This builds on the existing incident infrastructure from Phase 6 to derive component statuses from active incidents.

The status page domain is well-established with clear patterns from tools like Atlassian Statuspage, Cachet, and Upptime. The core concept is a **component-based model** where services/components have status levels (Operational, Degraded Performance, Partial Outage, Major Outage, Under Maintenance) that automatically update based on incident state and can be manually overridden for maintenance windows.

Key requirements from PROJECT.md:
- **STATUS-01**: User can create private status pages for internal services
- **STATUS-02**: System automatically updates status based on active incidents
- **STATUS-03**: User can manually update status for maintenance windows
- **STATUS-04**: User can notify subscribers of status changes

**Primary recommendation:** Implement a component-centric data model where each status page has components (services), incidents affect component status automatically via a status computation service, maintenance windows are scheduled events that override normal status, and subscribers receive notifications via the existing notification infrastructure.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Prisma** | 6.x | Database ORM | Already used throughout codebase - extend schema for status page models |
| **Express** | 4.18.x | REST API | Existing API framework - add status page routes |
| **BullMQ** | 5.x | Job queues | Already used for notifications - use for scheduled maintenance and subscriber notifications |
| **Socket.io** | 4.x | Real-time updates | Already configured - broadcast status changes to connected clients |
| **date-fns / luxon** | 4.x / 3.x | Date handling | Already in project - for maintenance window scheduling and timezone handling |
| **Zod** | 4.x | Schema validation | Already used for API validation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **rrule** | 2.8.x | Recurring schedules | Already in project for scheduling - use for recurring maintenance windows |
| **ioredis** | 5.x | Redis client | Already configured - use for caching computed statuses |
| **Handlebars** | 4.7.x | Templates | Already in project - for status update email templates |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom status computation | Event sourcing | Event sourcing is overkill - simple incident-based computation is clearer and sufficient |
| Polling for auto-updates | Event-driven triggers | Event-driven (on incident state change) is already implemented in incident service - leverage it |
| Separate subscriber notification system | Reuse notification dispatcher | Existing notification infrastructure handles email/Slack/SMS - extend templates instead of rebuilding |

**Installation:**
```bash
# No new dependencies required - all libraries already in project
# Just need to extend existing infrastructure
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── services/
│   ├── statusPage.service.ts        # Status page CRUD
│   ├── statusComponent.service.ts   # Component management
│   ├── statusSubscriber.service.ts  # Subscriber management
│   ├── statusComputation.service.ts # Auto-compute from incidents
│   ├── maintenance.service.ts       # Maintenance window scheduling
│   └── statusNotification.service.ts # Subscriber notification dispatch
├── routes/
│   ├── statusPage.routes.ts         # Status page API endpoints
│   └── statusPublic.routes.ts       # Public status page viewer (no auth)
├── queues/
│   └── statusNotification.queue.ts  # Queued subscriber notifications
├── workers/
│   └── statusNotification.worker.ts # Process subscriber notifications
└── types/
    └── statusPage.ts                # TypeScript types
```

### Pattern 1: Component Status Hierarchy

**What:** Define a clear status hierarchy where higher severity always wins when multiple incidents affect a component.

**When to use:** For automatic status computation based on active incidents.

**Status Levels (ordered by severity):**
1. **MAJOR_OUTAGE** - Component completely unavailable (incident priority CRITICAL)
2. **PARTIAL_OUTAGE** - Component broken for subset of users (incident priority HIGH)
3. **DEGRADED_PERFORMANCE** - Component slow but functional (incident priority MEDIUM)
4. **UNDER_MAINTENANCE** - Planned maintenance in progress (manual override)
5. **OPERATIONAL** - Everything working normally (no active incidents)

**Example:**
```typescript
// src/services/statusComputation.service.ts

export const STATUS_SEVERITY_ORDER = [
  'MAJOR_OUTAGE',
  'PARTIAL_OUTAGE',
  'DEGRADED_PERFORMANCE',
  'UNDER_MAINTENANCE',
  'OPERATIONAL'
] as const;

export type ComponentStatus = typeof STATUS_SEVERITY_ORDER[number];

// Map incident priority to component status
const INCIDENT_PRIORITY_TO_STATUS: Record<string, ComponentStatus> = {
  'CRITICAL': 'MAJOR_OUTAGE',
  'HIGH': 'PARTIAL_OUTAGE',
  'MEDIUM': 'DEGRADED_PERFORMANCE',
  'LOW': 'OPERATIONAL',  // Low priority doesn't affect status
  'INFO': 'OPERATIONAL'
};

interface ActiveIncident {
  id: string;
  priority: string;
  status: string;
}

// Compute status for a component based on its active incidents
export function computeComponentStatus(
  activeIncidents: ActiveIncident[],
  hasActiveMaintenance: boolean
): ComponentStatus {
  // If under active maintenance, that takes precedence over low-priority incidents
  // but MAJOR_OUTAGE still wins
  let worstIncidentStatus: ComponentStatus = 'OPERATIONAL';

  for (const incident of activeIncidents) {
    if (!['OPEN', 'ACKNOWLEDGED'].includes(incident.status)) continue;

    const incidentStatus = INCIDENT_PRIORITY_TO_STATUS[incident.priority] || 'OPERATIONAL';

    if (STATUS_SEVERITY_ORDER.indexOf(incidentStatus) < STATUS_SEVERITY_ORDER.indexOf(worstIncidentStatus)) {
      worstIncidentStatus = incidentStatus;
    }
  }

  // Maintenance shows if no worse incident status
  if (hasActiveMaintenance && worstIncidentStatus === 'OPERATIONAL') {
    return 'UNDER_MAINTENANCE';
  }

  return worstIncidentStatus;
}
```

### Pattern 2: Component-to-Service Mapping

**What:** Link status page components to the platform's monitoring/service concepts for automatic incident correlation.

**When to use:** For STATUS-02 automatic updates from incidents.

**Example:**
```typescript
// Component can map to team + service identifier
// When incident comes in with matching team + service, component status updates

interface ComponentServiceMapping {
  componentId: string;
  teamId: string;           // Required - which team's incidents affect this
  serviceIdentifier?: string;  // Optional - filter by alert source/service field
}

// When incident state changes, find affected components
async function findAffectedComponents(incident: Incident): Promise<string[]> {
  const components = await prisma.statusPageComponent.findMany({
    where: {
      OR: [
        // Match by team only (all incidents for team affect component)
        { teamId: incident.teamId, serviceIdentifier: null },
        // Match by team + service identifier
        {
          teamId: incident.teamId,
          serviceIdentifier: {
            // Match against alert source or metadata.service
            in: [incident.alerts[0]?.source].filter(Boolean)
          }
        }
      ]
    }
  });

  return components.map(c => c.id);
}
```

### Pattern 3: Maintenance Window Scheduling

**What:** Allow scheduling future maintenance windows with optional recurrence.

**When to use:** For STATUS-03 manual maintenance updates.

**Example:**
```typescript
// src/services/maintenance.service.ts

import { RRule } from 'rrule';

interface CreateMaintenanceWindow {
  componentIds: string[];     // Which components are affected
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  autoUpdateStatus: boolean;  // Auto-set UNDER_MAINTENANCE during window
  notifySubscribers: boolean; // Send notification when window starts/ends
  recurrenceRule?: string;    // RRULE for recurring maintenance (optional)
}

async function createMaintenanceWindow(
  statusPageId: string,
  data: CreateMaintenanceWindow
): Promise<MaintenanceWindow> {
  // Validate times
  if (data.endTime <= data.startTime) {
    throw new Error('End time must be after start time');
  }

  const maintenance = await prisma.maintenanceWindow.create({
    data: {
      statusPageId,
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      autoUpdateStatus: data.autoUpdateStatus,
      notifySubscribers: data.notifySubscribers,
      recurrenceRule: data.recurrenceRule,
      status: 'SCHEDULED', // SCHEDULED, IN_PROGRESS, COMPLETED
      components: {
        connect: data.componentIds.map(id => ({ id }))
      }
    }
  });

  // Schedule jobs for start/end if auto-update or notify
  if (data.autoUpdateStatus || data.notifySubscribers) {
    await scheduleMaintenanceJobs(maintenance);
  }

  return maintenance;
}

// Check if recurring window is currently active
function isMaintenanceActive(window: MaintenanceWindow, now: Date): boolean {
  if (!window.recurrenceRule) {
    // Simple case: just check time range
    return now >= window.startTime && now <= window.endTime;
  }

  // Recurring: use rrule to find occurrences
  const rule = RRule.fromString(window.recurrenceRule);
  const duration = window.endTime.getTime() - window.startTime.getTime();

  // Find occurrence that contains 'now'
  const occurrences = rule.between(
    new Date(now.getTime() - duration),
    now,
    true
  );

  for (const start of occurrences) {
    const end = new Date(start.getTime() + duration);
    if (now >= start && now <= end) {
      return true;
    }
  }

  return false;
}
```

### Pattern 4: Subscriber Notification via Existing Infrastructure

**What:** Reuse the notification dispatcher for status update notifications.

**When to use:** For STATUS-04 subscriber notifications.

**Example:**
```typescript
// src/services/statusNotification.service.ts

import { notificationQueue } from '../queues/notification.queue.js';

type SubscriberChannel = 'EMAIL' | 'SLACK' | 'WEBHOOK';

interface StatusSubscriber {
  id: string;
  statusPageId: string;
  channel: SubscriberChannel;
  // For EMAIL: email address
  // For SLACK: webhook URL or channel ID
  // For WEBHOOK: URL to POST to
  destination: string;
  componentIds?: string[];  // Subscribe to specific components (null = all)
  notifyOn: string[];       // ['degraded', 'outage', 'maintenance', 'resolved']
}

interface StatusChangeNotification {
  statusPageId: string;
  componentId: string;
  componentName: string;
  previousStatus: ComponentStatus;
  newStatus: ComponentStatus;
  incidentId?: string;      // If change was triggered by incident
  maintenanceId?: string;   // If change was triggered by maintenance
  message?: string;         // Optional custom message
}

async function notifySubscribers(
  notification: StatusChangeNotification
): Promise<void> {
  // Determine notification type from status change
  const notifyTypes = getNotifyTypesForChange(
    notification.previousStatus,
    notification.newStatus
  );

  // Find subscribers who want this type of notification
  const subscribers = await prisma.statusSubscriber.findMany({
    where: {
      statusPageId: notification.statusPageId,
      isActive: true,
      OR: [
        { componentIds: { has: notification.componentId } },
        { componentIds: { isEmpty: true } }  // Subscribed to all
      ],
      notifyOn: { hasSome: notifyTypes }
    }
  });

  // Queue notification for each subscriber
  for (const subscriber of subscribers) {
    await statusNotificationQueue.add('status-update', {
      subscriberId: subscriber.id,
      channel: subscriber.channel,
      destination: subscriber.destination,
      notification
    });
  }
}

function getNotifyTypesForChange(
  previous: ComponentStatus,
  current: ComponentStatus
): string[] {
  const types: string[] = [];

  if (current === 'OPERATIONAL' && previous !== 'OPERATIONAL') {
    types.push('resolved');
  }
  if (current === 'DEGRADED_PERFORMANCE') {
    types.push('degraded');
  }
  if (['PARTIAL_OUTAGE', 'MAJOR_OUTAGE'].includes(current)) {
    types.push('outage');
  }
  if (current === 'UNDER_MAINTENANCE') {
    types.push('maintenance');
  }

  return types;
}
```

### Pattern 5: Public Status Page API (No Auth)

**What:** Expose status page data via unauthenticated endpoint for internal consumers.

**When to use:** For STATUS-01 private status pages (internal services can query without user auth).

**Example:**
```typescript
// src/routes/statusPublic.routes.ts
// Note: "private" here means internal-only (not public internet),
// but still needs to be queryable without user session for dashboards

import { Router } from 'express';

const router = Router();

// GET /status/:pageId - Get status page with current component statuses
// No authentication required - uses page's access token or is network-restricted
router.get('/:pageId', async (req, res) => {
  const { pageId } = req.params;
  const { token } = req.query;

  const page = await prisma.statusPage.findUnique({
    where: { id: pageId },
    include: {
      components: {
        include: {
          _count: { select: { activeIncidents: true } }
        },
        orderBy: { displayOrder: 'asc' }
      }
    }
  });

  if (!page) {
    return res.status(404).json({ error: 'Status page not found' });
  }

  // If page has access token, verify it
  if (page.accessToken && page.accessToken !== token) {
    return res.status(401).json({ error: 'Invalid access token' });
  }

  // Compute current status for each component
  const componentsWithStatus = await Promise.all(
    page.components.map(async (component) => {
      const status = await statusComputationService.computeStatus(component.id);
      return {
        id: component.id,
        name: component.name,
        description: component.description,
        status,
        displayOrder: component.displayOrder
      };
    })
  );

  // Compute overall page status (worst component status)
  const overallStatus = computeOverallStatus(componentsWithStatus);

  return res.json({
    id: page.id,
    name: page.name,
    description: page.description,
    overallStatus,
    components: componentsWithStatus,
    updatedAt: new Date().toISOString()
  });
});

// GET /status/:pageId/history - Recent incidents affecting this page
router.get('/:pageId/history', async (req, res) => {
  const { pageId } = req.params;
  const { days = 7 } = req.query;

  // Get incidents that affected any component on this page
  // Limited to resolved incidents for history
  const history = await prisma.statusIncident.findMany({
    where: {
      statusPageId: pageId,
      status: { in: ['RESOLVED', 'CLOSED'] },
      createdAt: {
        gte: new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return res.json({ history });
});

export const statusPublicRoutes = router;
```

### Pattern 6: Integration with Incident State Changes

**What:** Hook into existing incident lifecycle to trigger status updates.

**When to use:** For STATUS-02 automatic updates.

**Example:**
```typescript
// In src/services/incident.service.ts, extend the existing onIncidentStateChanged hook

// After incident acknowledge/resolve, trigger status recomputation
async function onIncidentStateChanged(
  incident: Incident,
  previousStatus: string,
  newStatus: string
): Promise<void> {
  // Existing workflow trigger code...

  // NEW: Trigger status page update
  await statusComputationService.recomputeForIncident(incident.id);
}

// src/services/statusComputation.service.ts
class StatusComputationService {
  async recomputeForIncident(incidentId: string): Promise<void> {
    // Find all components affected by this incident
    const affectedComponents = await this.findAffectedComponents(incidentId);

    for (const componentId of affectedComponents) {
      const oldStatus = await this.getCachedStatus(componentId);
      const newStatus = await this.computeStatus(componentId);

      if (oldStatus !== newStatus) {
        // Update cache
        await this.setCachedStatus(componentId, newStatus);

        // Get incident for context
        const incident = await prisma.incident.findUnique({
          where: { id: incidentId }
        });

        // Notify subscribers
        const component = await prisma.statusPageComponent.findUnique({
          where: { id: componentId },
          include: { statusPage: true }
        });

        if (component) {
          await statusNotificationService.notifySubscribers({
            statusPageId: component.statusPageId,
            componentId,
            componentName: component.name,
            previousStatus: oldStatus,
            newStatus,
            incidentId
          });

          // Broadcast via WebSocket for real-time UI updates
          socketService.broadcastStatusChange({
            statusPageId: component.statusPageId,
            componentId,
            componentName: component.name,
            status: newStatus,
            incidentId
          });
        }
      }
    }
  }
}
```

### Anti-Patterns to Avoid

- **Computing status on every request:** Cache computed statuses in Redis, update only on incident/maintenance changes
- **Storing status as a field:** Compute from source of truth (incidents, maintenance) - stored status gets stale
- **Exposing internal incident details on public status:** Show only component status + generic messages, not incident fingerprints
- **Polling for status changes:** Use event-driven updates - incident service already has hooks
- **Building custom email sending for subscribers:** Reuse existing notification infrastructure (SES, templates)
- **Per-request database queries for status:** Use Redis cache with invalidation on incident changes

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurring maintenance schedules | Custom date iteration | rrule library (already in project) | Handles edge cases (DST, timezones, complex patterns) |
| Subscriber email delivery | Custom SMTP client | Existing SES + email channel | Already configured, handles bounces, delivery tracking |
| Real-time status broadcasts | Custom polling system | Existing Socket.io + socketService | Already configured for incident updates |
| Webhook delivery to subscribers | Raw fetch with retries | BullMQ job queue | Already has retry logic, failure handling, dead letter queue |
| Status page access tokens | Custom token generation | crypto.randomBytes (existing pattern) | Already used for API keys, magic links |
| Caching computed statuses | In-memory Map | ioredis (already in project) | Already configured, survives restarts, cluster-ready |

**Key insight:** Status pages are essentially a read model derived from incidents and maintenance windows. The complexity is in the computation rules and subscriber notification, not in building new infrastructure. Leverage existing incident, notification, and scheduling systems rather than building parallel infrastructure.

## Common Pitfalls

### Pitfall 1: Status Race Conditions During Incident Flapping

**What goes wrong:** Incident repeatedly changes status (open/resolved/open), causing status page to flap between OPERATIONAL and OUTAGE, spamming subscribers.

**Why it happens:** Auto-resolve from monitoring tool, then new alert triggers, repeated.

**How to avoid:**
- Implement debounce/cooldown: Don't notify subscribers if status changed back within 5 minutes
- Track "pending" status changes that only commit after stability window
- Consider minimum incident duration before status degradation

**Warning signs:**
- Subscribers complaining about notification spam
- Status page showing rapid status changes
- Same component going operational/outage multiple times per hour

### Pitfall 2: Stale Cached Status After System Restart

**What goes wrong:** Redis cache is empty after restart, status page shows all components as OPERATIONAL even though incidents are active.

**Why it happens:** Cache is warm-populated on demand, but first request after restart doesn't trigger recomputation.

**How to avoid:**
- On application startup, warm cache by computing status for all components
- Use cache-aside pattern: always compute from source if cache miss
- Set reasonable TTL on cache (5 minutes) so even if not invalidated, it self-corrects

**Warning signs:**
- Status shows operational immediately after deploy
- Status corrects itself after a few minutes
- Active incidents not reflected in status page

### Pitfall 3: Maintenance Window Overlap with Incidents

**What goes wrong:** Component has both active maintenance and active incident, unclear which status to show.

**Why it happens:** Maintenance was scheduled, but unexpected incident also occurred.

**How to avoid:**
- Clear priority rules: MAJOR_OUTAGE > PARTIAL_OUTAGE > MAINTENANCE > DEGRADED > OPERATIONAL
- Show both indicators if possible (in maintenance + incident affecting)
- Log when overlap occurs for postmortem

**Warning signs:**
- Confusing status during planned maintenance
- Operators unsure if issue is maintenance or real incident
- Subscribers not notified of real incidents during maintenance

### Pitfall 4: Subscriber Notification Failures Block Status Updates

**What goes wrong:** Webhook subscriber endpoint is down, notification queue backs up, status page updates are delayed.

**Why it happens:** Synchronous notification in status update path.

**How to avoid:**
- Always queue notifications asynchronously (BullMQ)
- Set reasonable timeouts for webhook delivery (5s)
- Dead letter queue for failed notifications, don't retry indefinitely
- Status update should succeed even if all notifications fail

**Warning signs:**
- Status updates take seconds instead of milliseconds
- Queue depth growing during subscriber endpoint outage
- Status appears delayed compared to incidents

### Pitfall 5: Component-to-Incident Mapping Too Broad

**What goes wrong:** Single incident affects multiple components that shouldn't be related, or incident doesn't affect the component it should.

**Why it happens:** Mapping rules too loose (entire team) or too strict (exact service match that doesn't align with alert source).

**How to avoid:**
- Allow both team-level and service-level mapping
- Provide clear UI for configuring mappings
- Test mappings with example incidents before going live
- Audit log showing which incidents affected which components

**Warning signs:**
- Components showing wrong status
- Operators manually correcting component status
- Confusion about why component status changed

### Pitfall 6: Public Status Page Exposes Internal Information

**What goes wrong:** Status page accessible without auth shows incident details, team names, or internal service names that shouldn't be public.

**Why it happens:** Requirements say "private" status pages, but implementation doesn't restrict access properly.

**How to avoid:**
- Private = requires auth token (API key or user session)
- Public = no auth, but only shows component names + status (no incident details)
- Never expose incident fingerprints, alert payloads, or internal team names on public pages
- Review data exposed on public endpoint carefully

**Warning signs:**
- Internal information visible to anyone with URL
- No access token required for "private" pages
- Alert source names visible on status page

## Code Examples

### Prisma Schema Extension

```prisma
// Add to prisma/schema.prisma

// ============================================================================
// STATUS PAGE MODELS (Phase 9)
// ============================================================================

model StatusPage {
  id           String   @id @default(cuid())
  name         String   // "Internal Services Status"
  description  String?
  slug         String   @unique // URL-friendly identifier

  // Access control
  isPublic     Boolean  @default(false) // If false, requires accessToken
  accessToken  String?  @unique // For private page access

  // Ownership
  teamId       String   // Which team owns this status page
  team         Team     @relation(fields: [teamId], references: [id])
  createdById  String

  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  // Relations
  components          StatusPageComponent[]
  subscribers         StatusSubscriber[]
  maintenanceWindows  MaintenanceWindow[]
  statusIncidents     StatusIncident[]

  @@index([teamId])
  @@index([slug])
}

model StatusPageComponent {
  id              String     @id @default(cuid())
  statusPageId    String
  statusPage      StatusPage @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  name            String     // "API Gateway", "Database Cluster"
  description     String?
  displayOrder    Int        @default(0)

  // Incident mapping
  teamId             String?   // If set, incidents from this team affect this component
  serviceIdentifier  String?   // If set, only incidents with matching source/service

  // Current status (cached, computed from incidents + maintenance)
  // Recomputed on incident state change or maintenance start/end
  currentStatus   String     @default("OPERATIONAL") // Cache field for quick reads
  statusUpdatedAt DateTime   @default(now()) @db.Timestamptz

  createdAt       DateTime   @default(now()) @db.Timestamptz
  updatedAt       DateTime   @updatedAt @db.Timestamptz

  // Relations
  maintenanceWindows MaintenanceWindow[] @relation("ComponentMaintenance")

  @@unique([statusPageId, name])
  @@index([statusPageId, displayOrder])
}

model StatusSubscriber {
  id           String     @id @default(cuid())
  statusPageId String
  statusPage   StatusPage @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  // Subscriber contact
  channel      String     // EMAIL, SLACK, WEBHOOK
  destination  String     // Email address, webhook URL, Slack channel

  // Subscription preferences
  componentIds String[]   // Empty = all components
  notifyOn     String[]   // ['degraded', 'outage', 'maintenance', 'resolved']

  // Verification
  isVerified   Boolean    @default(false) // Email requires verification
  verifyToken  String?    @unique

  isActive     Boolean    @default(true)

  createdAt    DateTime   @default(now()) @db.Timestamptz

  @@unique([statusPageId, channel, destination])
  @@index([statusPageId, isActive])
}

model MaintenanceWindow {
  id            String     @id @default(cuid())
  statusPageId  String
  statusPage    StatusPage @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  title         String
  description   String?

  startTime     DateTime   @db.Timestamptz
  endTime       DateTime   @db.Timestamptz
  recurrenceRule String?   // RRULE for recurring maintenance

  // Behavior
  autoUpdateStatus  Boolean  @default(true) // Set components to UNDER_MAINTENANCE
  notifySubscribers Boolean  @default(true)

  status        String     @default("SCHEDULED") // SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED

  // Affected components
  components    StatusPageComponent[] @relation("ComponentMaintenance")

  createdById   String
  createdAt     DateTime   @default(now()) @db.Timestamptz
  updatedAt     DateTime   @updatedAt @db.Timestamptz

  @@index([statusPageId, startTime])
  @@index([status, startTime])
}

// Link incidents to status page updates (for history)
model StatusIncident {
  id              String     @id @default(cuid())
  statusPageId    String
  statusPage      StatusPage @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  // Link to platform incident
  incidentId      String?
  incident        Incident?  @relation(fields: [incidentId], references: [id])

  // Status page-specific fields
  title           String     // User-facing title (may differ from internal incident)
  message         String?    // Public message about the issue
  severity        String     // MINOR, MAJOR, CRITICAL (for display)
  status          String     // INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED

  affectedComponentIds String[]

  createdAt       DateTime   @default(now()) @db.Timestamptz
  updatedAt       DateTime   @updatedAt @db.Timestamptz
  resolvedAt      DateTime?  @db.Timestamptz

  // Updates history (stored as JSON for simplicity)
  updates         Json       @default("[]") // Array of { timestamp, status, message }

  @@index([statusPageId, status])
  @@index([incidentId])
}

// Add relation to existing Incident model
// In model Incident:
// statusIncidents StatusIncident[]

// Add relation to existing Team model
// In model Team:
// statusPages StatusPage[]
```

### Status Computation Service

```typescript
// src/services/statusComputation.service.ts

import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

export const STATUS_SEVERITY_ORDER = [
  'MAJOR_OUTAGE',
  'PARTIAL_OUTAGE',
  'DEGRADED_PERFORMANCE',
  'UNDER_MAINTENANCE',
  'OPERATIONAL'
] as const;

export type ComponentStatus = typeof STATUS_SEVERITY_ORDER[number];

const INCIDENT_PRIORITY_TO_STATUS: Record<string, ComponentStatus> = {
  'CRITICAL': 'MAJOR_OUTAGE',
  'HIGH': 'PARTIAL_OUTAGE',
  'MEDIUM': 'DEGRADED_PERFORMANCE',
  'LOW': 'OPERATIONAL',
  'INFO': 'OPERATIONAL'
};

const STATUS_CACHE_PREFIX = 'status:component:';
const STATUS_CACHE_TTL = 300; // 5 minutes

class StatusComputationService {
  // Get cached status or compute fresh
  async getStatus(componentId: string): Promise<ComponentStatus> {
    // Check cache first
    const cached = await redis.get(`${STATUS_CACHE_PREFIX}${componentId}`);
    if (cached) {
      return cached as ComponentStatus;
    }

    // Compute and cache
    const status = await this.computeStatus(componentId);
    await this.setCachedStatus(componentId, status);
    return status;
  }

  // Compute status from source of truth
  async computeStatus(componentId: string): Promise<ComponentStatus> {
    const component = await prisma.statusPageComponent.findUnique({
      where: { id: componentId },
      include: {
        maintenanceWindows: {
          where: { status: 'IN_PROGRESS' }
        }
      }
    });

    if (!component) {
      return 'OPERATIONAL';
    }

    // Check for active maintenance
    const hasActiveMaintenance = component.maintenanceWindows.length > 0;

    // Find active incidents affecting this component
    const whereClause: any = {
      status: { in: ['OPEN', 'ACKNOWLEDGED'] }
    };

    if (component.teamId) {
      whereClause.teamId = component.teamId;
    }

    const activeIncidents = await prisma.incident.findMany({
      where: whereClause,
      include: {
        alerts: {
          take: 1,
          select: { source: true }
        }
      }
    });

    // Filter by service identifier if specified
    let matchingIncidents = activeIncidents;
    if (component.serviceIdentifier) {
      matchingIncidents = activeIncidents.filter(inc =>
        inc.alerts[0]?.source === component.serviceIdentifier
      );
    }

    // Compute worst status
    let worstStatus: ComponentStatus = 'OPERATIONAL';

    for (const incident of matchingIncidents) {
      const incidentStatus = INCIDENT_PRIORITY_TO_STATUS[incident.priority] || 'OPERATIONAL';

      if (STATUS_SEVERITY_ORDER.indexOf(incidentStatus) < STATUS_SEVERITY_ORDER.indexOf(worstStatus)) {
        worstStatus = incidentStatus;
      }
    }

    // Maintenance shows if no worse status
    if (hasActiveMaintenance && worstStatus === 'OPERATIONAL') {
      return 'UNDER_MAINTENANCE';
    }

    return worstStatus;
  }

  // Update cache and database
  async setCachedStatus(componentId: string, status: ComponentStatus): Promise<void> {
    await Promise.all([
      redis.setex(`${STATUS_CACHE_PREFIX}${componentId}`, STATUS_CACHE_TTL, status),
      prisma.statusPageComponent.update({
        where: { id: componentId },
        data: {
          currentStatus: status,
          statusUpdatedAt: new Date()
        }
      })
    ]);
  }

  // Invalidate cache for component
  async invalidateStatus(componentId: string): Promise<void> {
    await redis.del(`${STATUS_CACHE_PREFIX}${componentId}`);
  }

  // Called when incident state changes
  async recomputeForIncident(incidentId: string): Promise<void> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        alerts: { take: 1, select: { source: true } }
      }
    });

    if (!incident) return;

    // Find all components that might be affected
    const components = await prisma.statusPageComponent.findMany({
      where: {
        OR: [
          { teamId: incident.teamId, serviceIdentifier: null },
          { teamId: incident.teamId, serviceIdentifier: incident.alerts[0]?.source }
        ]
      },
      include: { statusPage: true }
    });

    for (const component of components) {
      const oldStatus = component.currentStatus as ComponentStatus;
      const newStatus = await this.computeStatus(component.id);

      if (oldStatus !== newStatus) {
        await this.setCachedStatus(component.id, newStatus);

        logger.info(
          { componentId: component.id, oldStatus, newStatus, incidentId },
          'Component status changed'
        );

        // Notify subscribers (will be implemented in statusNotification.service.ts)
        // await statusNotificationService.notifyStatusChange(...)
      }
    }
  }

  // Warm cache on startup
  async warmCache(): Promise<void> {
    const components = await prisma.statusPageComponent.findMany({
      include: { statusPage: { select: { id: true } } }
    });

    logger.info({ count: components.length }, 'Warming status cache');

    for (const component of components) {
      const status = await this.computeStatus(component.id);
      await this.setCachedStatus(component.id, status);
    }

    logger.info('Status cache warmed');
  }
}

export const statusComputationService = new StatusComputationService();
```

### Subscriber Verification

```typescript
// src/services/statusSubscriber.service.ts

import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { notificationQueue } from '../queues/notification.queue.js';

class StatusSubscriberService {
  async subscribe(
    statusPageId: string,
    channel: string,
    destination: string,
    options: {
      componentIds?: string[];
      notifyOn?: string[];
    } = {}
  ): Promise<{ subscriber: any; requiresVerification: boolean }> {
    // Check for existing subscription
    const existing = await prisma.statusSubscriber.findFirst({
      where: { statusPageId, channel, destination }
    });

    if (existing) {
      throw new Error('Already subscribed');
    }

    // Generate verification token for email subscribers
    const requiresVerification = channel === 'EMAIL';
    const verifyToken = requiresVerification
      ? crypto.randomBytes(32).toString('hex')
      : null;

    const subscriber = await prisma.statusSubscriber.create({
      data: {
        statusPageId,
        channel,
        destination,
        componentIds: options.componentIds || [],
        notifyOn: options.notifyOn || ['degraded', 'outage', 'maintenance', 'resolved'],
        isVerified: !requiresVerification,
        verifyToken
      }
    });

    // Send verification email
    if (requiresVerification) {
      await this.sendVerificationEmail(subscriber, verifyToken!);
    }

    return { subscriber, requiresVerification };
  }

  async verify(token: string): Promise<boolean> {
    const subscriber = await prisma.statusSubscriber.findFirst({
      where: { verifyToken: token }
    });

    if (!subscriber) {
      return false;
    }

    await prisma.statusSubscriber.update({
      where: { id: subscriber.id },
      data: {
        isVerified: true,
        verifyToken: null
      }
    });

    return true;
  }

  async unsubscribe(subscriberId: string): Promise<void> {
    await prisma.statusSubscriber.update({
      where: { id: subscriberId },
      data: { isActive: false }
    });
  }

  private async sendVerificationEmail(
    subscriber: any,
    token: string
  ): Promise<void> {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/status/subscribe/verify?token=${token}`;

    // Queue verification email through existing notification system
    await notificationQueue.add('status-verify', {
      type: 'status_subscribe_verify',
      channel: 'email',
      destination: subscriber.destination,
      data: { verifyUrl }
    });
  }
}

export const statusSubscriberService = new StatusSubscriberService();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static status pages updated manually | Incident-driven automatic updates | 2018-2020 | Reduced manual overhead, faster status reflection |
| Single "system status" indicator | Component-based status | 2015-2018 | More granular, users see only relevant services |
| Email-only notifications | Multi-channel (email, Slack, webhook, RSS) | 2019-2021 | Subscribers choose preferred channel |
| Polling status endpoint | WebSocket/SSE for real-time | 2020-present | Instant updates without polling overhead |
| Manual maintenance scheduling | Calendar integration + recurring | 2018-2020 | Reduced scheduling overhead for regular maintenance |

**Current best practices:**
- Component-based status with clear severity levels
- Automatic status computation from incidents
- Subscriber self-service (subscribe, preferences)
- Webhook notifications for integrations (Slack bots, dashboards)
- Historical uptime metrics and incident timeline

## Open Questions

1. **Service Mapping Strategy**
   - What we know: Components need to map to incidents for auto-update
   - What's unclear: Should mapping be based on team only, team + alert source, or allow custom rules?
   - Recommendation: Start with team + optional service identifier. Allow admins to test mappings before enabling auto-update. Plan for rule-based mapping in future if needed.

2. **Private Status Page Access Model**
   - What we know: Requirements say "private status pages for internal services"
   - What's unclear: Does "private" mean requires auth token, network-restricted, or just not indexed?
   - Recommendation: Use access token model - each status page gets a unique token that must be passed as query param or header. Internal dashboards can embed token. No user session required.

3. **Subscriber Notification Volume**
   - What we know: Status changes should notify subscribers
   - What's unclear: How to handle high-frequency status changes (incident flapping)?
   - Recommendation: Implement 5-minute debounce - don't notify if status changes back within window. Log all changes but batch notifications.

4. **Frontend for Status Page Management**
   - What we know: Phase 6 built incident dashboard with React/Vite
   - What's unclear: Does Phase 9 include frontend for status page admin, or just API?
   - Recommendation: Requirements focus on creation and notification - implement backend API first. Frontend can be added in Phase 6 extension or separate phase.

5. **Integration with Existing Incident Model**
   - What we know: Incidents have team, priority, status, alerts with source
   - What's unclear: Should status page incidents (StatusIncident) duplicate platform incidents or link to them?
   - Recommendation: Link to platform incidents (incidentId FK). StatusIncident adds user-facing title/message that may differ from internal incident details.

## Sources

### Primary (HIGH confidence)

- **Atlassian Statuspage** (https://www.atlassian.com/software/statuspage) - Component statuses, feature overview
- **Atlassian Statuspage Docs** (https://support.atlassian.com/statuspage/docs/what-is-a-component/) - Component status levels, relationships
- **Existing codebase** - Incident service, notification dispatcher, socket service, prisma schema patterns

### Secondary (MEDIUM confidence)

- **Upptime** (https://github.com/upptime/upptime) - Git-native status page patterns
- **General status page patterns** - Component-based model, subscriber notifications

### Tertiary (LOW confidence)

- None - patterns are well-established in industry

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, just extending
- Architecture patterns: HIGH - Well-established patterns from industry leaders
- Schema design: HIGH - Follows existing codebase conventions
- Pitfalls: MEDIUM - Based on industry experience, may have project-specific variations
- Open questions: MEDIUM - Require user decisions for some implementation details

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days) - Status page domain is stable, patterns well-established
