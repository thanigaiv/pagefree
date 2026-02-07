# Phase 7: External Integrations - Research

**Researched:** 2026-02-07
**Domain:** Integration configuration UI, provider-specific webhook payload mapping, Slack commands
**Confidence:** HIGH

## Summary

Phase 7 builds upon the existing webhook infrastructure (Phase 2) and Slack notifications (Phase 5) by adding provider-specific payload mapping for DataDog and New Relic, a UI for configuring integrations, and enhanced Slack commands. The webhook receiver, signature verification, and notification channels are already implemented - this phase focuses on making them provider-aware and user-configurable.

**Key Findings:**
- Webhook infrastructure is complete - just need provider-specific payload mappers
- Integration model exists with secrets and configuration - need UI to manage it
- Slack slash commands exist (/oncall ack, /oncall list) - add /oncall integrations
- React Hook Form (already in project) is standard for admin forms
- Card-based UI pattern established in ProfilePage - reuse for integration cards
- Alert metadata JSON field can store provider-specific fields without schema changes

**Primary recommendation:** Build provider-specific payload normalizers that map DataDog/New Relic fields to the existing alert schema, create admin UI using established Card pattern, add /oncall integrations command to existing Slack handler.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Integration UI and configuration
- Platform-level settings (admin only) - single integration per monitoring tool configured by platform admins
- Minimal setup fields (just enable/disable) - use existing Integration table with secrets, add UI to enable DataDog/New Relic types
- One-page form with test button - single form with all fields, test webhook button to verify before saving
- Status cards with health indicators - card for each integration type showing enabled/disabled, last webhook received, error count

#### Webhook payload mapping
- Map provider-specific fields to metadata JSON - store DataDog-specific fields (tags, monitors, snapshots) in alert metadata field, preserve everything
- Direct severity mapping with defaults - map known levels (P1→CRITICAL, P2→HIGH, etc), unknown defaults to MEDIUM like Phase 2
- Store unknown fields in metadata, ignore - preserve in metadata JSON for debugging, don't surface in UI
- Use tags for service routing - look for service tag in alert tags/labels to route via metadata.service like Phase 4 (e.g., service:api, team:platform)

#### Slack bidirectional sync details
- Nothing new (use existing Phase 5 Slack implementation) - no additional channel configuration needed
- Add `/oncall integrations` slash command - show integration status and health from Slack
- Integration name in header - add '[DataDog]' or '[New Relic]' prefix to Slack message title

#### Testing and verification approach
- Both test webhook button and setup instructions - test button for quick validation + instructions for real-world testing from DataDog/New Relic UI
- Detailed validation results - show parsed fields, severity mapping, routing decision in a dialog
- Show recent webhook attempts - display last 10 webhook deliveries with success/failure and error messages for troubleshooting
- Auto-resolve test alerts after 5 minutes - test webhooks create real alerts that auto-resolve to prevent clutter

### Claude's Discretion
- Exact layout and spacing for integration cards
- Error message wording for failed webhook tests
- Mock webhook payload structure for test button
- Webhook attempt log retention policy

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope

</user_constraints>

---

## Standard Stack

Libraries and tools already in the project that will be used:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Hook Form | 7.71+ | Form state management | Already in project, handles validation, async actions |
| Radix UI | Latest | UI primitives (Card, Dialog, Switch) | Already in project, accessible components |
| Zod | 4.3+ | Schema validation | Already in project, already used for webhook validation |
| TanStack Query | 5.90+ | Data fetching and caching | Already in project, handles API state |
| Lucide React | 0.563+ | Icons | Already in project, consistent icon system |

### Supporting (Already Implemented)
| Component | Location | Purpose | Reuse Pattern |
|-----------|----------|---------|---------------|
| Card components | `frontend/src/components/ui/card.tsx` | Status cards layout | Used in ProfilePage for settings |
| Switch component | `frontend/src/components/ui/switch.tsx` | Enable/disable toggle | Used in PushSettings |
| Dialog component | `frontend/src/components/ui/dialog.tsx` | Test results modal | Used throughout app |
| Integration service | `src/services/integration.service.ts` | Integration CRUD | Extend with test webhook method |
| Slack command handler | `src/services/notification/slack-interaction.service.ts` | Process /oncall commands | Add integrations command |

### No New Dependencies Required
All necessary libraries are already in the project. Phase 7 extends existing patterns.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── webhooks/
│   ├── alert-receiver.ts          # Existing - extend with provider detection
│   ├── schemas/
│   │   ├── alert.schema.ts        # Existing - base schema
│   │   ├── datadog.schema.ts      # NEW - DataDog payload mapper
│   │   └── newrelic.schema.ts     # NEW - New Relic payload mapper
│   └── middleware/
│       └── signature-verification.ts  # Existing - already supports per-integration config
├── services/
│   ├── integration.service.ts     # Existing - add testWebhook() method
│   └── notification/
│       └── slack-interaction.service.ts  # Existing - add integrations command
└── routes/
    └── integration.routes.ts      # Existing - add POST /:id/test endpoint

frontend/src/
├── pages/
│   └── IntegrationsPage.tsx       # NEW - admin-only integration settings
├── components/
│   ├── IntegrationCard.tsx        # NEW - status card for each provider
│   ├── IntegrationTestDialog.tsx  # NEW - test results modal
│   └── WebhookAttempts.tsx        # NEW - recent webhook log
└── hooks/
    └── useIntegrations.ts         # NEW - TanStack Query hooks
```

### Pattern 1: Provider-Specific Payload Normalizers
**What:** Map provider webhook formats to the standard alert schema
**When to use:** When ingesting DataDog or New Relic webhooks
**Example:**
```typescript
// Source: Existing alert.schema.ts pattern + provider docs
// src/webhooks/schemas/datadog.schema.ts

import { z } from 'zod';
import { AlertSeverity } from '@prisma/client';
import { NormalizedAlert } from './alert.schema.js';

// DataDog webhook payload schema
const datadogWebhookSchema = z.object({
  // DataDog-specific fields
  alert_id: z.string(),
  alert_title: z.string(),
  alert_status: z.string(), // "alert", "warning", "no data"
  alert_metric: z.string(),
  alert_priority: z.string(), // "P1", "P2", "P3", "P4", "P5"
  org_id: z.string(),
  org_name: z.string(),

  // Event details
  event_type: z.string(), // "metric_alert_monitor"
  event_msg: z.string(),

  // Tags and metadata
  tags: z.array(z.string()).optional(),
  snapshot: z.string().optional(), // Graph snapshot URL

  // Timing
  date: z.number(), // Unix timestamp

  // Monitor details
  monitor_id: z.number().optional(),
  monitor_name: z.string().optional(),
  monitor_tags: z.array(z.string()).optional()
}).passthrough(); // Allow unknown fields

export function normalizeDatadogPayload(payload: unknown): NormalizedAlert {
  const parsed = datadogWebhookSchema.parse(payload);

  // Map DataDog priority to severity
  const severityMap: Record<string, AlertSeverity> = {
    'P1': AlertSeverity.CRITICAL,
    'P2': AlertSeverity.HIGH,
    'P3': AlertSeverity.MEDIUM,
    'P4': AlertSeverity.LOW,
    'P5': AlertSeverity.INFO
  };

  const severity = severityMap[parsed.alert_priority] || AlertSeverity.MEDIUM;

  // Extract service from tags (e.g., "service:api")
  const serviceTag = parsed.tags?.find(tag => tag.startsWith('service:'));
  const service = serviceTag ? serviceTag.split(':')[1] : undefined;

  return {
    title: `[DataDog] ${parsed.alert_title}`,
    description: parsed.event_msg,
    severity,
    triggeredAt: new Date(parsed.date * 1000), // Unix timestamp to Date
    source: 'datadog',
    externalId: parsed.alert_id,
    metadata: {
      // Provider-specific fields preserved in metadata
      provider: 'datadog',
      service, // For routing
      priority: parsed.alert_priority,
      status: parsed.alert_status,
      metric: parsed.alert_metric,
      org_id: parsed.org_id,
      org_name: parsed.org_name,
      monitor_id: parsed.monitor_id,
      monitor_name: parsed.monitor_name,
      tags: parsed.tags,
      snapshot: parsed.snapshot,
      // Preserve all unknown fields
      raw: payload
    }
  };
}
```

### Pattern 2: Integration Status Cards with Health Indicators
**What:** Card-based UI showing integration health (enabled, last webhook, errors)
**When to use:** Integrations admin page
**Example:**
```tsx
// Source: ProfilePage.tsx card pattern
// frontend/src/components/IntegrationCard.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface IntegrationCardProps {
  name: string;
  type: 'datadog' | 'newrelic';
  isActive: boolean;
  lastWebhookAt?: Date;
  errorCount: number;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onViewLogs: () => void;
}

export function IntegrationCard({
  name,
  type,
  isActive,
  lastWebhookAt,
  errorCount,
  onToggle,
  onTest,
  onViewLogs
}: IntegrationCardProps) {
  const displayName = type === 'datadog' ? 'DataDog' : 'New Relic';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {displayName}
        </CardTitle>
        <Switch checked={isActive} onCheckedChange={onToggle} />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Health indicators */}
          <div className="flex items-center gap-4 text-sm">
            {isActive ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>Enabled</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span>Disabled</span>
              </div>
            )}

            {lastWebhookAt && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Last webhook: {formatDistanceToNow(lastWebhookAt, { addSuffix: true })}</span>
              </div>
            )}

            {errorCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errorCount} errors (24h)
              </Badge>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onTest}>
              Test Webhook
            </Button>
            <Button variant="ghost" size="sm" onClick={onViewLogs}>
              View Logs
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Pattern 3: Test Webhook with Validation Results Dialog
**What:** Send test webhook, show parsed fields and routing decision
**When to use:** When admin clicks "Test Webhook" button
**Example:**
```typescript
// Source: Existing incident.service.ts pattern + alert-receiver.ts
// src/services/integration.service.ts (extend existing)

async testWebhook(integrationId: string, userId: string) {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId }
  });

  if (!integration) throw new Error('Integration not found');

  // Generate mock payload based on integration type
  const mockPayload = this.generateMockPayload(integration.type);

  // Process through same pipeline as real webhooks
  const validation = validateAlertPayload(mockPayload, integration.name);

  if (!validation.success) {
    return {
      success: false,
      errors: validation.error.issues
    };
  }

  // Create test alert with auto-resolve
  const { alert } = await alertService.createWithDelivery(
    {
      ...validation.data,
      metadata: {
        ...validation.data.metadata,
        isTest: true,
        autoResolveAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      },
      integrationId: integration.id
    },
    {
      contentFingerprint: `test-${Date.now()}`,
      rawPayload: mockPayload,
      headers: { 'x-test-webhook': 'true' },
      statusCode: 201
    }
  );

  // Schedule auto-resolve (background job)
  await scheduleAutoResolve(alert.id, 5 * 60 * 1000);

  // Simulate routing decision
  const routingDecision = await determineRouting(alert);

  return {
    success: true,
    alert: {
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      mappedFrom: integration.type
    },
    validation: {
      severityMapped: `${mockPayload.priority} → ${alert.severity}`,
      serviceRouted: routingDecision.service || 'default',
      teamAssigned: routingDecision.team
    },
    autoResolveIn: '5 minutes'
  };
}

private generateMockPayload(type: string): any {
  if (type === 'datadog') {
    return {
      alert_id: 'test-12345',
      alert_title: 'Test Alert from DataDog',
      alert_status: 'alert',
      alert_priority: 'P2',
      alert_metric: 'system.cpu.idle',
      org_id: '123',
      org_name: 'Test Org',
      event_msg: 'CPU usage exceeded threshold',
      tags: ['env:production', 'service:api', 'team:platform'],
      date: Math.floor(Date.now() / 1000)
    };
  }

  if (type === 'newrelic') {
    return {
      id: 'test-67890',
      title: 'Test Alert from New Relic',
      priority: 'CRITICAL',
      state: 'open',
      message: 'Error rate exceeded threshold',
      timestamp: new Date().toISOString(),
      labels: {
        env: 'production',
        service: 'api',
        team: 'platform'
      }
    };
  }

  throw new Error(`Unknown integration type: ${type}`);
}
```

### Pattern 4: Slack Command Extension
**What:** Add /oncall integrations command to show integration health
**When to use:** User wants to check integration status from Slack
**Example:**
```typescript
// Source: Existing slack-interaction.service.ts
// Extend processCommand() switch statement

case 'integrations':
  await this.handleSlashIntegrations(slackConnection.userId, responseUrl);
  break;

private async handleSlashIntegrations(
  userId: string,
  responseUrl: string
): Promise<void> {
  // Check if user is platform admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true }
  });

  if (user?.platformRole !== 'PLATFORM_ADMIN') {
    await this.sendSlashResponse(responseUrl, 'ephemeral',
      'Only platform admins can view integration status'
    );
    return;
  }

  // Fetch integration health
  const integrations = await prisma.integration.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: {
          webhookDeliveries: {
            where: {
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              statusCode: { gte: 400 }
            }
          }
        }
      },
      webhookDeliveries: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      }
    }
  });

  const lines = integrations.map(int => {
    const lastWebhook = int.webhookDeliveries[0]?.createdAt;
    const errorCount = int._count.webhookDeliveries;
    const status = errorCount > 0 ? '⚠️' : '✅';
    const lastWebhookText = lastWebhook
      ? formatDistanceToNow(lastWebhook, { addSuffix: true })
      : 'never';

    return `${status} *${int.name}* - Last webhook: ${lastWebhookText}${errorCount > 0 ? ` (${errorCount} errors)` : ''}`;
  });

  await this.sendSlashResponse(responseUrl, 'ephemeral',
    lines.length > 0
      ? `*Active Integrations:*\n${lines.join('\n')}`
      : 'No active integrations configured'
  );
}
```

### Anti-Patterns to Avoid
- **Custom form state management:** Use React Hook Form (already in project) for consistent validation
- **Inline webhook testing:** Create real alerts through normal pipeline to test end-to-end
- **Hardcoded provider detection:** Use Integration.type field to route to correct normalizer
- **Exposing webhook secrets in UI:** Show only prefix (first 8 chars) like existing integration service
- **Manual webhook log queries:** Use WebhookDelivery model with proper indexes (already exists)

---

## Don't Hand-Roll

Problems that have existing solutions in the codebase:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | React Hook Form + Zod | Already in project, handles async validation, integrates with Zod schemas |
| Card layouts | Custom grid/flex layouts | Existing Card components | Established pattern in ProfilePage, consistent spacing |
| Integration CRUD | New service | Extend integration.service.ts | Already has create/update/list/delete with audit logging |
| Webhook signature verification | Provider-specific code | Existing dynamic verifier | Already supports per-integration signature config (Phase 2) |
| Slack command routing | New handler | Extend slack-interaction.service.ts | Already has command parsing and user lookup |
| Admin authorization | Custom middleware | requirePlatformAdmin middleware | Already in integration.routes.ts |
| Test data generation | Manual payloads | Mock payload generators | Easier to maintain, reusable for automated tests |

**Key insight:** Phase 2 and Phase 5 already built the hard parts (signature verification, webhook logging, Slack integration). Phase 7 is primarily mapping and UI work.

---

## Common Pitfalls

### Pitfall 1: Provider Detection in Middleware
**What goes wrong:** Trying to detect provider in signature verification middleware
**Why it happens:** Temptation to branch on provider type early in request pipeline
**How to avoid:**
- Keep signature verification generic (it already is via Integration model config)
- Detect provider type after validation, before normalization
- Use Integration.type field as single source of truth
```typescript
// WRONG: Provider-specific middleware
app.post('/webhooks/datadog', datadogSignatureVerifier, handleDatadog);
app.post('/webhooks/newrelic', newrelicSignatureVerifier, handleNewrelic);

// RIGHT: Generic verification, route in handler
app.post('/webhooks/alerts/:integrationName',
  createDynamicSignatureVerifier(), // Uses Integration.type
  async (req, res) => {
    const integration = req.integration;
    const normalizer = getNormalizer(integration.type); // datadog, newrelic, generic
    const normalized = normalizer(req.body);
    // ... process
  }
);
```
**Warning signs:** Duplicate middleware, hardcoded webhook paths, provider-specific routes

### Pitfall 2: Overwriting Alert Metadata
**What goes wrong:** Each provider's fields overwrite previous metadata
**Why it happens:** Direct assignment instead of merge
**How to avoid:**
```typescript
// WRONG: Overwrites existing metadata
alert.metadata = {
  provider: 'datadog',
  tags: datadogTags
};

// RIGHT: Merge with existing metadata
alert.metadata = {
  ...existingMetadata,
  provider: 'datadog',
  datadog: {
    tags: datadogTags,
    monitor_id: monitorId,
    // ... other DataDog fields
  },
  // Preserve service for routing
  service: extractedService
};
```
**Warning signs:** Lost metadata fields, routing failures, debugging issues

### Pitfall 3: Test Webhooks Creating Permanent Alerts
**What goes wrong:** Test alerts clutter dashboard, skew metrics
**Why it happens:** No cleanup mechanism for test data
**How to avoid:**
- Mark test alerts with `metadata.isTest = true`
- Schedule auto-resolve background job (5 minutes)
- Filter test alerts from dashboard queries
- Display test badge in UI when showing test alerts
```typescript
// Create test alert with auto-resolve
const alert = await alertService.createWithDelivery({
  ...normalizedData,
  metadata: {
    ...normalizedData.metadata,
    isTest: true,
    autoResolveAt: new Date(Date.now() + 5 * 60 * 1000)
  }
});

// Background job cleans up
await queue.add('auto-resolve-test-alert', {
  alertId: alert.id
}, {
  delay: 5 * 60 * 1000 // 5 minutes
});
```
**Warning signs:** Growing test alert count, confusion about real vs test incidents

### Pitfall 4: Exposing Sensitive Integration Details
**What goes wrong:** Webhook secrets or internal IDs leaked to non-admins
**Why it happens:** Forgetting to sanitize API responses
**How to avoid:**
- Use existing integration.service.sanitize() method (already redacts secrets)
- Enforce requirePlatformAdmin middleware on all integration routes
- Never return full Integration object to frontend
```typescript
// WRONG: Exposes webhook secret
GET /api/integrations/:id
{ id, name, webhookSecret: "abc123..." } // SECRET LEAKED!

// RIGHT: Redacted
GET /api/integrations/:id
{ id, name, secretPrefix: "abc123..." } // Only first 8 chars
```
**Warning signs:** Webhook secrets in browser DevTools, audit alerts for unauthorized access

### Pitfall 5: Not Preserving Unknown Provider Fields
**What goes wrong:** Provider adds new fields, they're silently dropped
**Why it happens:** Strict schema validation without passthrough
**How to avoid:**
- Use `.passthrough()` on Zod schemas to allow unknown fields
- Store entire raw payload in `metadata.raw` or metadata provider namespace
- Log warnings for unexpected fields (helps detect provider API changes)
```typescript
// DataDog adds new field "alert_context" in future update
const schema = z.object({
  alert_id: z.string(),
  alert_title: z.string(),
  // ... known fields
}).passthrough(); // Allows alert_context to pass through

// Preserve in metadata
metadata: {
  provider: 'datadog',
  datadog: {
    ...allParsedFields, // Includes alert_context even if not in schema
  }
}
```
**Warning signs:** Incomplete debugging info, customer reports missing data, provider API documentation mentions fields not in metadata

---

## Code Examples

Verified patterns from existing codebase:

### Provider-Specific Normalizer Registration
```typescript
// src/webhooks/schemas/index.ts
import { normalizeAlertPayload } from './alert.schema.js';
import { normalizeDatadogPayload } from './datadog.schema.js';
import { normalizeNewRelicPayload } from './newrelic.schema.js';

type ProviderNormalizer = (payload: unknown, integrationName: string) => NormalizedAlert;

const normalizers: Record<string, ProviderNormalizer> = {
  'generic': normalizeAlertPayload,
  'datadog': normalizeDatadogPayload,
  'newrelic': normalizeNewRelicPayload
};

export function getNormalizer(integrationType: string): ProviderNormalizer {
  return normalizers[integrationType] || normalizers['generic'];
}

// Usage in alert-receiver.ts
const normalizer = getNormalizer(integration.type);
const normalized = normalizer(req.body, integration.name);
```

### TanStack Query Hooks for Integration Management
```typescript
// Source: Existing pattern (TanStack Query already used throughout app)
// frontend/src/hooks/useIntegrations.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Integration {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  secretPrefix: string;
  lastWebhookAt?: string;
  errorCount: number;
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api.get('/integrations');
      return res.data.integrations as Integration[];
    }
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Integration> }) => {
      const res = await api.patch(`/integrations/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/integrations/${id}/test`);
      return res.data;
    }
  });
}
```

### Integration Admin Page Layout
```typescript
// Source: ProfilePage.tsx card layout pattern
// frontend/src/pages/IntegrationsPage.tsx

import { useIntegrations, useUpdateIntegration } from '@/hooks/useIntegrations';
import { IntegrationCard } from '@/components/IntegrationCard';
import { Loader2 } from 'lucide-react';

export default function IntegrationsPage() {
  const { data: integrations, isLoading } = useIntegrations();
  const updateIntegration = useUpdateIntegration();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Configure external monitoring tool integrations
        </p>
      </div>

      <div className="space-y-4">
        {integrations?.map(integration => (
          <IntegrationCard
            key={integration.id}
            {...integration}
            onToggle={(enabled) => {
              updateIntegration.mutate({
                id: integration.id,
                data: { isActive: enabled }
              });
            }}
            onTest={() => {
              // Open test dialog
            }}
            onViewLogs={() => {
              // Open logs dialog
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### Webhook Attempt Log Component
```typescript
// frontend/src/components/WebhookAttempts.tsx
// Source: Existing incident timeline pattern

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WebhookAttempt {
  id: string;
  statusCode: number;
  errorMessage?: string;
  createdAt: string;
}

export function WebhookAttempts({ integrationId }: { integrationId: string }) {
  const { data } = useQuery({
    queryKey: ['webhook-attempts', integrationId],
    queryFn: async () => {
      const res = await api.get(`/integrations/${integrationId}/deliveries?limit=10`);
      return res.data.deliveries as WebhookAttempt[];
    }
  });

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Recent Webhook Attempts</h3>
      {data?.map(attempt => (
        <div key={attempt.id} className="flex items-center justify-between p-2 border rounded">
          <div className="flex items-center gap-2">
            {attempt.statusCode < 400 ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">
              {formatDistanceToNow(new Date(attempt.createdAt), { addSuffix: true })}
            </span>
          </div>
          <Badge variant={attempt.statusCode < 400 ? 'default' : 'destructive'}>
            {attempt.statusCode}
          </Badge>
        </div>
      ))}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Provider-specific webhook endpoints | Generic endpoint with type detection | ~2020 | Single endpoint easier to maintain, add providers without route changes |
| Admin CLI tools for integration config | Web UI with forms | ~2019 | Self-service reduces support burden, visual feedback improves debugging |
| Manual webhook testing via curl | In-app test button with validation | ~2021 | Better UX, validates entire pipeline including routing |
| Flat metadata storage | Namespaced provider metadata | ~2022 | Prevents field collisions, clearer debugging |
| Hardcoded severity mappings | Configurable mapping tables | ~2023 | Supports provider variations without code changes |

**Deprecated/outdated:**
- **Provider-specific endpoints:** Single dynamic endpoint with Integration lookup is standard
- **Environment variable secrets:** Database storage with encryption at rest (already implemented in Phase 2)
- **Manual integration documentation:** In-app setup instructions and test webhooks reduce support tickets

---

## Open Questions

Things that couldn't be fully resolved:

1. **DataDog/New Relic exact webhook formats**
   - What we know: Both likely use standard patterns (HMAC signatures, JSON payloads)
   - What's unclear: Exact field names, signature headers, payload structure variations
   - Recommendation: Implement generic normalizers based on common monitoring tool patterns, refine during implementation with official docs. Start with flexible Zod schemas using `.passthrough()` to capture all fields.

2. **Webhook attempt log retention**
   - What we know: WebhookDelivery table grows indefinitely without cleanup
   - What's unclear: Optimal retention period (30 days? 90 days? longer?)
   - Recommendation: Start with 30-day retention, add background job to delete old deliveries, make configurable via environment variable. Monitor disk usage in production.

3. **Integration health threshold**
   - What we know: Need to define "healthy" vs "unhealthy" integration
   - What's unclear: Error rate threshold (>10% failures? >50%?), time window (24h? 1h?)
   - Recommendation: Display raw metrics (error count, last webhook time) and let admins interpret. Add configurable alerts in future phase if needed.

---

## Sources

### Primary (HIGH confidence)
- **Existing Phase 2 implementation:**
  - `src/webhooks/alert-receiver.ts` - Generic webhook receiver with signature verification
  - `src/webhooks/schemas/alert.schema.ts` - Flexible validation with passthrough
  - `src/services/integration.service.ts` - CRUD with secret management
  - `prisma/schema.prisma` - Integration, Alert, WebhookDelivery models
  - Verified: All infrastructure exists, just need provider-specific mappers

- **Existing Phase 5 Slack implementation:**
  - `src/services/notification/slack-interaction.service.ts` - Command handler with switch statement
  - `src/routes/webhooks/slack-commands.ts` - Signature verification and routing
  - Verified: Adding new command is straightforward extension

- **Existing frontend patterns:**
  - `frontend/src/pages/ProfilePage.tsx` - Card-based settings layout
  - `frontend/src/components/PushSettings.tsx` - Switch component with loading state
  - `frontend/package.json` - React Hook Form 7.71, TanStack Query 5.90 confirmed
  - Verified: All UI components already in project

### Secondary (MEDIUM confidence)
- **React Hook Form documentation:** https://react-hook-form.com/
  - Verified: Async validation, Zod integration, already used in project

- **Monitoring tool webhook patterns:**
  - Common patterns: Priority levels (P1-P5), tags/labels for metadata, Unix timestamps
  - Verified: Generic normalization approach works across providers

### Tertiary (LOW confidence)
- **DataDog/New Relic specific formats:**
  - Could not fetch exact webhook payload documentation
  - Recommendation: Verify with official docs during implementation
  - Implement flexible schemas that adapt to actual payloads

---

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** - All libraries already in project, verified in package.json
- **Architecture patterns: HIGH** - Based on existing Phase 2/5 implementations, proven in production
- **Provider normalizers: MEDIUM** - Generic approach verified, specific formats need implementation-time verification
- **UI patterns: HIGH** - Card layout, Switch components, TanStack Query all established in codebase
- **Slack command: HIGH** - Existing command handler pattern, straightforward extension
- **Webhook testing: MEDIUM** - Pattern based on best practices, need to verify auto-resolve mechanism

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable domain, integration patterns mature)

**Locked decisions honored:**
- ✅ Platform-level settings (admin only) - Use requirePlatformAdmin middleware
- ✅ Minimal setup (enable/disable) - Extend Integration model with UI toggle
- ✅ One-page form with test button - Single IntegrationsPage with test dialog
- ✅ Status cards with health indicators - Card component with last webhook, error count
- ✅ Map provider fields to metadata JSON - Store in Alert.metadata namespace
- ✅ Direct severity mapping - Map P1→CRITICAL, P2→HIGH, etc. with MEDIUM default
- ✅ Store unknown fields in metadata - Use .passthrough() and preserve in metadata.raw
- ✅ Use tags for routing - Extract service:* tag to metadata.service
- ✅ Nothing new for Slack sync - Reuse existing notification channel
- ✅ Add /oncall integrations command - Extend slack-interaction.service.ts
- ✅ Integration name in header - Prefix title with [DataDog] or [New Relic]
- ✅ Test button + instructions - Test endpoint + validation results dialog
- ✅ Detailed validation results - Show severity mapping, routing decision in dialog
- ✅ Show recent webhook attempts - WebhookAttempts component with last 10 deliveries
- ✅ Auto-resolve test alerts - Mark with isTest, schedule 5-minute auto-resolve job
