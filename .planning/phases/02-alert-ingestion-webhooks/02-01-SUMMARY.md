---
phase: 02-alert-ingestion-webhooks
plan: 01
subsystem: database
tags: [prisma, postgresql, alert-ingestion, webhooks, idempotency]

# Dependency graph
requires:
  - phase: 01-foundation-user-management
    provides: Prisma schema foundation with User, Team, Session models
provides:
  - Alert, Integration, and WebhookDelivery models with enums
  - Per-integration webhook secret storage
  - Idempotency tracking (external key + content fingerprint)
  - Raw + normalized payload storage pattern
affects: [02-02, 02-03, alert-routing, webhook-processing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual storage pattern: raw JSON + normalized schema"
    - "Hybrid idempotency: external key fallback to content fingerprint"
    - "Per-integration webhook configuration (secret, signature format, dedup window)"

key-files:
  created:
    - prisma/migrations/20260207001834_init/migration.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "AlertSeverity enum: CRITICAL, HIGH, MEDIUM, LOW, INFO"
  - "AlertStatus enum: OPEN, ACKNOWLEDGED, RESOLVED, CLOSED"
  - "Integration.webhookSecret stores per-integration HMAC secrets"
  - "Integration.deduplicationWindowMinutes configurable per integration (default 15 min)"
  - "WebhookDelivery.idempotencyKey + contentFingerprint for hybrid duplicate detection"
  - "WebhookDelivery.alertId nullable to track failed/duplicate deliveries"
  - "Alert.metadata JSON field for integration-specific data"

patterns-established:
  - "Raw payload preservation: WebhookDelivery.rawPayload stores original JSON"
  - "Normalized extraction: Alert model extracts standard fields"
  - "Audit trail: Every webhook delivery logged with status and error"
  - "UTC timestamps: All DateTime fields use @db.Timestamptz"

# Metrics
duration: 2min
completed: 2026-02-06
---

# Phase 2 Plan 1: Database Models for Alert Ingestion

**Alert ingestion foundation with Integration, Alert, and WebhookDelivery models supporting per-integration secrets and hybrid idempotency**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-02-07T00:18:34Z
- **Completed:** 2026-02-07T00:21:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended Prisma schema with alert ingestion models (Integration, Alert, WebhookDelivery)
- Added AlertSeverity and AlertStatus enums for normalized alert handling
- Established per-integration webhook configuration pattern (secret, signature format, dedup window)
- Implemented hybrid idempotency tracking (external key + content fingerprint)
- Created database migration capturing Phase 1 + Phase 2 schema

## Task Commits

Each task was committed atomically:

1. **Task 1: Add alert ingestion enums and models to Prisma schema** - `8772ca4` (feat)
   - Files: prisma/schema.prisma
   - Added AlertSeverity, AlertStatus enums
   - Added Integration, Alert, WebhookDelivery models

2. **Task 2: Apply database migration** - `3aca65c` (feat)
   - Files: prisma/migrations/20260207001834_init/migration.sql
   - Created initial migration with Phase 1 + Phase 2 schema
   - Applied to database successfully

## Files Created/Modified
- `prisma/schema.prisma` - Added alert ingestion models with proper indexes and relations
- `prisma/migrations/20260207001834_init/migration.sql` - Initial migration capturing complete schema

## Decisions Made

**1. AlertSeverity enum levels**
- Rationale: CRITICAL, HIGH, MEDIUM, LOW, INFO covers standard monitoring tool severity mappings

**2. Per-integration webhook configuration**
- Rationale: Different monitoring tools use different signature headers, algorithms, and formats (DataDog vs New Relic vs generic)

**3. Hybrid idempotency with configurable window**
- Rationale: External idempotency keys from monitoring tools preferred, content fingerprinting as fallback. Window configurable per integration (DataDog: 15min, others may differ).

**4. Nullable alertId in WebhookDelivery**
- Rationale: Enables tracking of failed validation and duplicate deliveries in audit log without creating alerts

**5. Integration baseline migration**
- Rationale: Database had Phase 1 tables from `prisma db push`. Created single migration capturing complete current state for proper migration history going forward.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Migration initialization challenge**
- **Problem:** Database existed with Phase 1 tables but no migration history
- **Resolution:** Created baseline migration from actual database state using `prisma migrate diff --from-empty --to-schema-datasource`, then marked as applied with `prisma migrate resolve`
- **Verification:** `npx prisma migrate status` confirms "Database schema is up to date", `npm run build` succeeds

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 2 Plan 2 (webhook receiver implementation):**
- Integration model stores per-integration webhook secrets
- Alert model ready for normalized data storage
- WebhookDelivery model ready for idempotency checks
- All indexes in place for efficient lookups (integrationId + idempotencyKey, integrationId + contentFingerprint)

**Database migration infrastructure established:**
- Migration tracking enabled for production deployments
- Schema validation passing
- Prisma client regenerated with new models

**No blockers or concerns.**

## Self-Check: PASSED

All files and commits verified:
- ✓ prisma/migrations/20260207001834_init/migration.sql exists
- ✓ prisma/schema.prisma exists
- ✓ Commit 8772ca4 exists
- ✓ Commit 3aca65c exists

---
*Phase: 02-alert-ingestion-webhooks*
*Completed: 2026-02-06*
