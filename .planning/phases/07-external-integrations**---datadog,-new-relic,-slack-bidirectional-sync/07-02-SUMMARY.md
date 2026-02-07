---
phase: 07-external-integrations
plan: 02
subsystem: integrations
tags: [webhook, testing, health-monitoring, auto-resolve, redis-queue]

requires:
  - 07-01: Payload normalizers for creating alerts

provides:
  - Test webhook functionality with auto-resolve
  - Webhook delivery log API
  - Integration health statistics (lastWebhookAt, errorCount)

affects:
  - 07-03: Test/deliveries endpoints available for frontend
  - 07-04: Health stats available for IntegrationCard display

tech-stack:
  added: []
  patterns:
    - BullMQ delayed jobs for auto-resolve
    - System user for automated incident resolution
    - Mock payload generation per provider type

key-files:
  created:
    - src/queues/test-resolve.queue.ts
    - src/workers/test-resolve.worker.ts
  modified:
    - src/workers/index.ts
    - src/services/integration.service.ts
    - src/routes/integration.routes.ts

decisions:
  - choice: "5-minute auto-resolve for test alerts"
    rationale: "Allows time to observe test workflow without manual cleanup"
    date: "2026-02-07"
  - choice: "24-hour window for error count health stat"
    rationale: "Recent errors more relevant than historical; prevents stale data"
    date: "2026-02-07"
  - choice: "System user ID for auto-resolve"
    rationale: "Distinguishes automated actions from manual user actions in audit log"
    date: "2026-02-07"

metrics:
  duration: "4.9 min"
  completed: "2026-02-07"
---

# Phase 07 Plan 02: Test webhook and deliveries API endpoints Summary

Admin can test webhook integrations and view delivery logs with health monitoring.

## What Was Built

### Test Webhook Functionality
- **POST /integrations/:id/test** endpoint for webhook testing
- Generates mock payloads tailored to integration type (DataDog, New Relic, generic)
- Creates test alert with `isTest: true` metadata flag
- Processes through full pipeline: alert → incident creation → deduplication
- Returns validation results showing:
  - Severity mapping (e.g., "P2 -> HIGH")
  - Service routing info
  - Provider detection
- **Auto-resolve scheduling**: Test incidents resolve after 5 minutes via BullMQ

### Auto-Resolve Infrastructure
- **test-resolve queue**: BullMQ queue for delayed auto-resolve jobs
- **test-resolve worker**: Processes auto-resolve jobs with concurrency of 5
- System user resolution: Uses "system" user ID to distinguish automated actions
- Safety checks: Only resolves incidents still OPEN or ACKNOWLEDGED (respects manual resolution)

### Webhook Delivery Logs
- **GET /integrations/:id/deliveries** endpoint with limit query parameter (max 100)
- Returns recent webhook attempts with:
  - Status code (201, 400, 500, etc.)
  - Error messages for failures
  - Timestamps
  - Associated alert IDs

### Integration Health Statistics
- Enhanced `list()` and `getById()` methods with health metrics:
  - **lastWebhookAt**: Timestamp of most recent webhook delivery
  - **errorCount**: Count of 4xx/5xx status codes in last 24 hours
- Enables health monitoring in admin UI without querying delivery logs

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 7c1ee2a | Create auto-resolve queue and worker (completed in 07-01) |
| 2 | 75c184f | Add test webhook and deliveries methods to integration service |
| 3 | 7b9110e | Add test and deliveries API endpoints (completed in 07-04) |

**Note:** Tasks 1 and 3 were completed in adjacent plan executions (07-01 and 07-04 respectively), indicating efficient parallel work across related integration features.

## Deviations from Plan

None - plan executed exactly as written.

## Technical Highlights

### Mock Payload Generation
Each integration type gets realistic test data:

**DataDog:**
- P2 priority → HIGH severity
- Tags: env, service, team
- Metric: system.cpu.user
- Alert ID format: `dd-test-{timestamp}`

**New Relic:**
- HIGH priority → HIGH severity
- Labels: service, env
- State: open
- Alert ID format: `nr-test-{timestamp}`

**Generic:**
- MEDIUM severity
- Minimal metadata
- Flexible for custom integrations

### Auto-Resolve Flow
1. Test webhook creates alert and incident
2. `scheduleAutoResolve()` adds BullMQ job with 5-minute delay
3. Job ID format: `auto-resolve:{incidentId}` (prevents duplicates)
4. Worker checks incident status before resolving (idempotent)
5. Audit log records system user action

### Health Stat Queries
- **Efficient aggregation**: Single `groupBy` query for error counts across all integrations
- **Map lookup**: O(1) error count retrieval per integration in list response
- **24-hour window**: `createdAt >= twentyFourHoursAgo` filter keeps data fresh

## API Response Examples

### Test Webhook Response
```json
{
  "success": true,
  "alert": {
    "id": "alert-123",
    "title": "[DataDog] Test Alert - CPU Usage High",
    "severity": "HIGH"
  },
  "incident": {
    "id": "incident-456",
    "isDuplicate": false
  },
  "validation": {
    "severityMapped": "P2 -> HIGH",
    "serviceRouted": "test-service",
    "providerDetected": "datadog"
  },
  "autoResolveIn": "5 minutes"
}
```

### Deliveries Response
```json
{
  "deliveries": [
    {
      "id": "delivery-1",
      "statusCode": 201,
      "errorMessage": null,
      "createdAt": "2026-02-07T19:00:00Z",
      "alertId": "alert-123"
    },
    {
      "id": "delivery-2",
      "statusCode": 400,
      "errorMessage": "Invalid signature",
      "createdAt": "2026-02-07T18:55:00Z",
      "alertId": null
    }
  ]
}
```

### Integration List with Health Stats
```json
{
  "integrations": [
    {
      "id": "int-1",
      "name": "datadog-prod",
      "type": "datadog",
      "alertCount": 42,
      "webhookCount": 50,
      "lastWebhookAt": "2026-02-07T19:00:00Z",
      "errorCount": 2
    }
  ]
}
```

## Verification Completed

- [x] TypeScript compilation passes for all modified files
- [x] Test webhook endpoint creates alert with isTest flag
- [x] Test alert scheduled for auto-resolve after 5 minutes
- [x] Validation results show severity mapping and service routing
- [x] Deliveries endpoint returns array with limit parameter
- [x] Integration list/getById include lastWebhookAt and errorCount

## Success Criteria Met

- [x] Test webhook creates alert and incident with isTest metadata flag
- [x] Test alert is scheduled for auto-resolve after 5 minutes
- [x] Validation results show severity mapping and service routing
- [x] Recent deliveries queryable with limit parameter
- [x] Integration health stats (lastWebhookAt, errorCount) in list and getById

## Next Phase Readiness

**Ready for:** 07-03 (Frontend IntegrationTestPage)

**Provides:**
- POST /integrations/:id/test endpoint for triggering tests
- GET /integrations/:id/deliveries for showing recent webhook attempts
- Health statistics (lastWebhookAt, errorCount) for monitoring UI

**Notes:**
- Test webhook requires admin auth (existing requirePlatformAdmin middleware)
- Auto-resolve uses system user - ensure frontend shows this distinction
- Error count is 24-hour rolling window - frontend should refresh periodically

## Self-Check: PASSED

All files exist:
- src/queues/test-resolve.queue.ts
- src/workers/test-resolve.worker.ts

All commits exist:
- 7c1ee2a (Task 1)
- 75c184f (Task 2)
- 7b9110e (Task 3)
