---
phase: 02-alert-ingestion-webhooks
plan: 04
subsystem: webhooks
tags: [zod, rfc7807, validation, schema, webhook]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Alert and Integration database models"
provides:
  - "RFC 7807 Problem Details error formatting utility"
  - "Zod schema for alert webhook validation with flexible field mapping"
  - "Timestamp coercion from ISO-8601 and Unix formats"
  - "Severity normalization with common alias mapping"
  - "Alert payload normalization for database insertion"
affects: [02-05-webhook-processing, 02-06-deduplication, 02-07-integration-handlers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RFC 7807 Problem Details for structured webhook errors"
    - "Zod passthrough schema for flexible webhook payloads"
    - "Field name variation handling (snake_case/camelCase)"
    - "Severity alias mapping (P1/SEV1/CRITICAL all map to CRITICAL)"
    - "Timestamp coercion (handles ISO-8601 and Unix seconds/milliseconds)"

key-files:
  created:
    - src/utils/problem-details.ts
    - src/webhooks/schemas/alert.schema.ts
  modified: []

key-decisions:
  - "RFC 7807 Problem Details for webhook errors"
  - "Zod passthrough mode allows unknown fields"
  - "Lenient severity parsing defaults to MEDIUM for unknown values"
  - "Field name variations supported (description/message/body, external_id/externalId/alert_id/id)"
  - "Timestamp fallback chain prioritizes explicit timestamp field"

patterns-established:
  - "Problem Details factory pattern (createProblemDetails + specialized factories)"
  - "Validation result with success/error discriminated union"
  - "Normalization function separate from validation (normalizeAlertPayload)"
  - "Transform schemas for type coercion (timestamp, severity)"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 02 Plan 04: Webhook Schema Validation Summary

**Flexible Zod schemas with RFC 7807 error formatting - validates required fields (title/severity/timestamp) while allowing unknown fields via passthrough mode**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T00:24:22Z
- **Completed:** 2026-02-07T00:26:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- RFC 7807 Problem Details utility with validation error formatting
- Alert webhook schema validating required fields with lenient extras handling
- Timestamp coercion supporting ISO-8601 (with/without timezone) and Unix (seconds/milliseconds)
- Severity normalization with alias mapping (P1/SEV1/EMERGENCY → CRITICAL, WARNING/WARN → MEDIUM, etc.)
- Field name variation support for different monitoring tool formats

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RFC 7807 Problem Details utility** - `ce91478` (feat)
2. **Task 2: Create alert webhook Zod schema** - `32e362a` (feat)

## Files Created/Modified
- `src/utils/problem-details.ts` - RFC 7807 Problem Details formatter with validation error support and common webhook error factories
- `src/webhooks/schemas/alert.schema.ts` - Zod schema for alert webhook validation with timestamp coercion, severity normalization, field name mapping, and passthrough mode

## Decisions Made

**1. RFC 7807 Problem Details for webhook errors**
- Provides standard machine-readable error format
- Includes field-level validation details in `validation_errors` extension
- Helps integrators debug webhook issues

**2. Zod passthrough mode for unknown fields**
- Different monitoring tools send different metadata
- Strict validation on required fields (title, severity, timestamp)
- Unknown fields preserved in raw payload and metadata

**3. Lenient severity parsing with default fallback**
- Maps common aliases (P1, SEV1, EMERGENCY → CRITICAL)
- Unknown severity values default to MEDIUM (vs. rejecting webhook)
- Ensures webhook processing doesn't fail on unfamiliar severity strings

**4. Field name variation support**
- Handles snake_case and camelCase (external_id / externalId)
- Maps common aliases (message/body → description, alert_id/id → external_id)
- Reduces need for per-integration custom schemas

**5. Timestamp fallback chain**
- Prioritizes explicit `timestamp` field
- Falls back to triggered_at/triggeredAt/event_time/eventTime variants
- Last resort: current time (ensures alert always has timestamp)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed z.record() TypeScript error**
- **Found during:** Task 2 (Alert schema creation)
- **Issue:** `z.record(z.any())` expects 2 arguments (key type + value type)
- **Fix:** Changed to `z.record(z.string(), z.any())` to specify string keys
- **Files modified:** src/webhooks/schemas/alert.schema.ts
- **Verification:** `npm run build` succeeds, TypeScript compiles
- **Committed in:** 32e362a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeScript compilation fix. No scope creep.

## Issues Encountered

None - plan executed smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 02-05 (Webhook Processing):**
- Validation schema ready for payload parsing
- Error formatting ready for failed validations
- Normalization function ready for database insertion

**Ready for integration handlers (02-07):**
- Base schema can be extended per monitoring tool
- Common field variations already handled
- Passthrough mode preserves tool-specific metadata

**Ready for deduplication (02-06):**
- Normalized alert payload includes externalId for fingerprinting
- Metadata preserved for content-based fingerprinting

## Self-Check: PASSED

All created files and commits verified to exist.

---
*Phase: 02-alert-ingestion-webhooks*
*Completed: 2026-02-07*
