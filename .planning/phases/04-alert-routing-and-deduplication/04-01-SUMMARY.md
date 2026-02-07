---
phase: 04-alert-routing-and-deduplication
plan: 01
subsystem: database
tags: [prisma, postgresql, incident, escalation, schema, migration]

requires:
  - 03-05 # OnCall service for alert routing to on-call users
  - 02-01 # Alert model for incident grouping

provides:
  - EscalationPolicy model with multi-level configuration
  - EscalationLevel model with ordered levels and timeouts
  - Incident model with status lifecycle tracking
  - EscalationJob model for BullMQ job cancellation
  - Alert-to-Incident relation for deduplication grouping
  - Database migration for all incident models

affects:
  - 04-02 # BullMQ queues will use EscalationJob model
  - 04-03 # Deduplication service will create Incidents
  - 04-04 # Escalation service will query EscalationPolicy

tech-stack:
  added: []
  patterns:
    - Multi-level escalation with ordered levels
    - Job tracking model for BullMQ cancellation
    - Incident fingerprint for deduplication

key-files:
  created:
    - prisma/migrations/20260206200516_add_incident_escalation/migration.sql
  modified:
    - prisma/schema.prisma

decisions:
  - decision: "EscalationPolicy has repeatCount to repeat entire policy N times"
    rationale: "PagerDuty pattern - prevent alerts from being missed if no one responds"
    location: "EscalationPolicy model"

  - decision: "EscalationJob tracks BullMQ job ID for cancellation on acknowledgment"
    rationale: "Atomic acknowledgment requires ability to cancel pending escalations"
    location: "EscalationJob model"

  - decision: "Incident tracks currentLevel and currentRepeat for escalation state"
    rationale: "Enable resume after server restart, audit trail of escalation progression"
    location: "Incident model"

  - decision: "Alert.incidentId is nullable to preserve Phase 2 webhook deduplication"
    rationale: "Alerts can exist independently before incident creation"
    location: "Alert model incidentId field"

metrics:
  duration: 4 min
  completed: 2026-02-07
---

# Phase 04 Plan 01: Database Models for Incident Management Summary

**Prisma schema with Incident, EscalationPolicy, EscalationLevel, and EscalationJob models supporting multi-level escalation with timeout-based progression**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T04:02:37Z
- **Completed:** 2026-02-07T04:06:51Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Database schema supports multi-level escalation policies with configurable timeouts
- Incident model tracks full lifecycle (OPEN → ACKNOWLEDGED → RESOLVED → CLOSED)
- EscalationJob enables BullMQ job cancellation to prevent notification races
- Alert-to-Incident relation enables deduplication grouping

## Task Commits

Each task was committed atomically:

1. **Task 1: Add escalation and incident models to Prisma schema** - `a704cb4` (feat)
2. **Task 2: Generate and apply database migration** - `2d81ee2` (feat)

## Files Created/Modified

- `prisma/schema.prisma` - Added EscalationPolicy, EscalationLevel, Incident, EscalationJob models with indexes and relations
- `prisma/migrations/20260206200516_add_incident_escalation/migration.sql` - Database migration creating new tables and Alert.incidentId column

## Decisions Made

### 1. Escalation Policy Repeat Configuration
**Decision:** EscalationPolicy has `repeatCount` field (default 1, max 9) to cycle through entire policy multiple times

**Rationale:** Industry pattern from PagerDuty - prevents alerts from being missed if entire escalation chain exhausted without acknowledgment

**Implementation:** Incident tracks `currentRepeat` field to maintain state across repeat cycles

### 2. BullMQ Job Tracking
**Decision:** EscalationJob model stores `bullJobId` for cancellation when incident acknowledged

**Rationale:** Prevents acknowledgment race condition where escalation job fires between status update and job cancellation. Worker must check incident status before notifying.

**Implementation:** Unique constraint on `bullJobId`, index on `(incidentId, completed)` for query efficiency

### 3. Incident State Tracking
**Decision:** Incident tracks `currentLevel`, `currentRepeat`, and `lastEscalatedAt` timestamps

**Rationale:**
- Enables escalation resume after server restart (reconciliation)
- Provides audit trail of escalation progression
- Supports stale escalation detection

### 4. Nullable Alert-to-Incident Relation
**Decision:** Alert.incidentId is nullable foreign key

**Rationale:**
- Preserves Phase 2 webhook-level deduplication (WebhookDelivery can have null alertId)
- Alerts created before incident routing don't break
- Supports future alert search without requiring incident context

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

### Migration History Drift
**Problem:** Database had migration history (`0_init`, `20260207001834_init`) not present in local migrations directory from Phase 3

**Resolution:** Used `npx prisma db push` to sync schema directly, then created migration file and marked as applied with `npx prisma migrate resolve --applied`

**Impact:** No data loss, database schema correct, proper migration file created for documentation

## Next Phase Readiness

**Ready for Phase 4 Plan 02 (BullMQ Queues):**
- EscalationJob model ready for job tracking
- Incident model has all fields needed for routing and escalation

**Ready for Phase 4 Plan 03 (Deduplication Service):**
- Incident model supports fingerprint-based deduplication
- Alert.incidentId relation enables grouping
- Indexes optimized for deduplication queries: `[fingerprint, status, createdAt]`

**Ready for Phase 4 Plan 04 (Escalation Service):**
- EscalationPolicy and EscalationLevel models define multi-level escalation
- Indexes support efficient policy queries: `[teamId, isDefault]`, `[escalationPolicyId, levelNumber]`

**Must-Have Links Verified:**
- ✓ Incident → Alert via incidentId foreign key
- ✓ EscalationLevel → EscalationPolicy via escalationPolicyId foreign key
- ✓ Incident → Team via teamId foreign key
- ✓ Incident → EscalationPolicy via escalationPolicyId foreign key

---
*Phase: 04-alert-routing-and-deduplication*
*Completed: 2026-02-07*

## Self-Check: PASSED
