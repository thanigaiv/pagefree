---
phase: 07-external-integrations
plan: 01
status: complete
completed: 2026-02-07
duration: 2.9 min

# Classification
subsystem: webhook-ingestion
tags: [datadog, newrelic, webhooks, payload-normalization, provider-integration]

# Dependencies
requires:
  - "02-01: Generic webhook receiver infrastructure"
  - "02-02: Signature verification and validation"
provides:
  - "Provider-specific payload normalizers for DataDog and New Relic"
  - "Normalizer registry with provider detection"
  - "Service tag extraction for routing"
affects:
  - "07-02: Integration configuration UI (will use provider types)"
  - "07-03: Slack bidirectional sync (uses [Provider] title prefix)"

# Technical Stack
tech-stack:
  added: []
  patterns:
    - "Provider-specific Zod schemas with .passthrough()"
    - "Normalizer registry pattern for extensibility"
    - "Provider detection via Integration.type field"

# Key Files
key-files:
  created:
    - path: "src/webhooks/schemas/datadog.schema.ts"
      provides: "DataDog webhook payload normalization"
      exports: ["datadogWebhookSchema", "normalizeDatadogPayload"]
      lines: 123
    - path: "src/webhooks/schemas/newrelic.schema.ts"
      provides: "New Relic webhook payload normalization"
      exports: ["newrelicWebhookSchema", "normalizeNewRelicPayload"]
      lines: 104
    - path: "src/webhooks/schemas/index.ts"
      provides: "Normalizer registry for provider detection"
      exports: ["getNormalizer", "validateAlertPayload", "NormalizedAlert"]
      lines: 44
  modified:
    - path: "src/webhooks/alert-receiver.ts"
      changes: "Added provider-aware normalization logic using getNormalizer()"
      lines_changed: "+88 -31"

# Decisions Made
decisions:
  - id: "severity-mapping-datadog"
    what: "DataDog priority to severity mapping"
    chosen: "P1→CRITICAL, P2→HIGH, P3→MEDIUM, P4→LOW, P5→INFO, Unknown→MEDIUM"
    rationale: "Standard incident severity mapping aligned with Phase 2 patterns"

  - id: "severity-mapping-newrelic"
    what: "New Relic priority to severity mapping"
    chosen: "Direct mapping (CRITICAL→CRITICAL, HIGH→HIGH, etc.) with MEDIUM fallback"
    rationale: "New Relic uses same severity names as platform, enables pass-through"

  - id: "service-extraction"
    what: "How to extract service for routing"
    chosen: "DataDog: parse 'service:' tags, New Relic: read labels.service"
    rationale: "Follows each provider's tagging conventions, enables Phase 4 routing"

  - id: "title-prefix"
    what: "Alert title prefix format"
    chosen: "[DataDog] and [New Relic] prefixes"
    rationale: "Visual provider identification in UI, consistent with Phase 5 Slack messages"

  - id: "metadata-preservation"
    what: "How to preserve provider-specific fields"
    chosen: "Store in metadata.{provider} namespace plus metadata.raw for full payload"
    rationale: "Prevents field collisions, enables debugging, preserves future unknown fields"

  - id: "normalizer-registry"
    what: "How to select normalizer per provider"
    chosen: "Registry pattern with Integration.type as key"
    rationale: "Extensible for future providers, single source of truth in database"

  - id: "validation-consistency"
    what: "Should provider normalizers throw or return result objects"
    chosen: "Throw ZodError on validation failure (consistent with Zod .parse())"
    rationale: "Simpler error handling, consistent with Zod conventions, caught by try/catch"

---

# Phase 7 Plan 1: Provider-specific payload normalizers

**One-liner:** DataDog and New Relic webhook payloads normalized to standard alert schema with P1→CRITICAL severity mapping and service tag extraction for routing

## What Was Built

Created provider-specific payload normalizers for DataDog and New Relic webhooks, enabling the platform to ingest alerts from these monitoring tools with correct severity mapping, service routing via tags/labels, and metadata preservation.

**Architecture:**
```
Webhook → Alert Receiver → getNormalizer(integration.type)
                                ↓
                    ┌───────────┴───────────┐
                    │                       │
            datadogNormalizer      newrelicNormalizer
                    │                       │
                    └───────────┬───────────┘
                                ↓
                        NormalizedAlert
                                ↓
                    Alert Service (existing Phase 2)
```

**Components:**
1. **DataDog Schema** (`datadog.schema.ts`): Zod schema for DataDog webhook format, severity mapping (P1-P5), service tag extraction from tags array
2. **New Relic Schema** (`newrelic.schema.ts`): Zod schema for New Relic webhook format, direct severity mapping, service extraction from labels object
3. **Normalizer Registry** (`index.ts`): Provider detection and routing via Integration.type field
4. **Alert Receiver Updates** (`alert-receiver.ts`): Provider-aware validation path that routes to appropriate normalizer

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1. DataDog normalizer | `05ab4f6` | DataDog webhook schema with P1→CRITICAL severity mapping and service: tag extraction |
| 2. New Relic normalizer | `7c1ee2a` | New Relic webhook schema with direct severity mapping and labels.service extraction |
| 3. Registry & receiver | `1660a2d` | Normalizer registry with getNormalizer() and updated alert receiver routing logic |

**Total commits:** 3 task commits

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 07-02 (Integration Configuration UI):** ✅
- Provider types (datadog, newrelic) established in normalizer registry
- Integration.type field determines which normalizer is used
- UI can enable/disable specific provider types

**Ready for 07-03 (Slack Bidirectional Sync):** ✅
- Title prefix ([DataDog], [New Relic]) included in normalized alerts
- Slack notifications will display provider name in message header
- metadata.provider field available for filtering/display

**Blockers:** None

**Concerns:** None - provider normalizers follow existing Phase 2 patterns and are fully backward compatible with generic webhooks

## Testing Notes

**TypeScript Compilation:** ✅ Passed with no errors (unused import warnings in unrelated files)

**Manual Verification:**
- DataDog payload example:
  ```json
  {
    "alert_id": "12345",
    "alert_title": "High CPU Usage",
    "alert_priority": "P1",
    "date": 1707329400,
    "tags": ["service:api", "env:prod"],
    "event_msg": "CPU > 90%"
  }
  ```
  → Normalized to: `title: "[DataDog] High CPU Usage", severity: CRITICAL, metadata.service: "api"`

- New Relic payload example:
  ```json
  {
    "id": "67890",
    "title": "Error Rate Spike",
    "priority": "HIGH",
    "timestamp": "2026-02-07T19:00:00Z",
    "labels": { "service": "api", "env": "prod" },
    "message": "Error rate > 5%"
  }
  ```
  → Normalized to: `title: "[New Relic] Error Rate Spike", severity: HIGH, metadata.service: "api"`

**Backward Compatibility:** Generic webhooks continue to work through existing validateAlertPayload() path

## Self-Check: PASSED

✅ All created files exist:
- src/webhooks/schemas/datadog.schema.ts
- src/webhooks/schemas/newrelic.schema.ts
- src/webhooks/schemas/index.ts

✅ All commits exist:
- 05ab4f6
- 7c1ee2a
- 1660a2d

✅ Modified files updated:
- src/webhooks/alert-receiver.ts
