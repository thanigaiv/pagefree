---
phase: 02-alert-ingestion-webhooks
plan: 06
subsystem: webhooks
tags: [alert-processing, webhook-receiver, express-router, transaction, idempotency]

# Dependency graph
requires:
  - phase: 02-02
    provides: Signature verification middleware and raw body capture
  - phase: 02-03
    provides: Idempotency service with fingerprinting and duplicate detection
  - phase: 02-04
    provides: Alert schema validation with RFC 7807 error formatting
provides:
  - Alert service with atomic alert+delivery creation
  - Generic webhook receiver at /webhooks/alerts/:integrationName
  - Complete webhook pipeline: signature, idempotency, validation, creation, logging
affects: [02-07-integration-handlers, alert-acknowledgment, escalation-policies]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Transaction-based atomic operations (alert + delivery together)
    - Middleware ordering for raw body capture
    - Comprehensive webhook attempt logging (all outcomes)
    - Header sanitization utility pattern

key-files:
  created:
    - src/services/alert.service.ts
    - src/webhooks/alert-receiver.ts
  modified:
    - src/index.ts

key-decisions:
  - "Transaction-based createWithDelivery ensures alert and webhook delivery created together"
  - "recordDeliveryOnly for duplicate/failure attempts (no alert created)"
  - "Alert router mounted BEFORE express.json() for raw body capture"
  - "All webhook attempts logged (success, duplicate, validation failure, processing error)"
  - "Sensitive headers sanitized before storage ([REDACTED] pattern)"
  - "GET /test endpoint for reachability verification (no auth)"

patterns-established:
  - "Atomic service operations: transaction wraps related writes"
  - "Delivery logging for all outcomes: success, duplicate, validation, error"
  - "Header sanitization: redact auth/signature/token headers before storage"
  - "Middleware ordering: custom body parsers before generic express.json()"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 2 Plan 6: Alert Webhook Receiver Summary

**Complete webhook pipeline with signature verification, idempotency, validation, and atomic alert creation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T00:31:01Z
- **Completed:** 2026-02-07T00:35:07Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Alert service with transaction-based createWithDelivery ensuring alert and delivery are created atomically
- recordDeliveryOnly method for tracking duplicate and failed webhook attempts without creating alerts
- Alert lifecycle methods (acknowledge, resolve) with audit logging
- Generic webhook receiver router handling POST /webhooks/alerts/:integrationName
- Complete pipeline: signature verification → idempotency check → validation → alert creation → delivery logging
- All webhook attempts logged to audit trail (success, duplicate, validation failure, processing error)
- GET /test endpoint for webhook reachability verification
- Router mounted before express.json() to enable raw body capture for signature verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create alert service** - `7b036e7` (feat)
2. **Task 2: Create alert webhook receiver router** - `5195831` (feat)
3. **Task 3: Mount webhook router in app** - `6ebcfe8` (feat)

## Files Created/Modified

- `src/services/alert.service.ts` - Alert service with atomic createWithDelivery, recordDeliveryOnly, CRUD operations, lifecycle methods (acknowledge/resolve), and header sanitization utility
- `src/webhooks/alert-receiver.ts` - Alert webhook receiver router with complete pipeline (signature → idempotency → validation → creation → logging)
- `src/index.ts` - Alert webhook router mounted at /webhooks/alerts before express.json() middleware

## Decisions Made

**1. Transaction-based createWithDelivery**
- Ensures alert and webhook delivery are created together atomically
- Prevents orphaned deliveries or alerts in database
- Single transaction rollback on any failure

**2. recordDeliveryOnly for duplicates/failures**
- Tracks all webhook attempts even when no alert is created
- Essential for audit trail and debugging webhook issues
- Nullable alertId field in WebhookDelivery supports this pattern

**3. Alert router mounted BEFORE express.json()**
- Alert webhooks use rawBodyCapture middleware to preserve original body
- Required for HMAC signature verification
- express.json() would consume body and prevent raw capture
- Okta webhooks remain after express.json() (different auth mechanism)

**4. All webhook attempts logged to audit trail**
- Success: alert.created with alert details
- Duplicate: webhook.duplicate with existing alert ID
- Validation failure: webhook.validation_failed with error count
- Processing error: webhook.processing_failed with error message

**5. Sensitive header sanitization**
- Patterns match authorization, x-webhook-secret, x-api-key, cookie, tokens, signatures
- Replaced with [REDACTED] before storage
- Prevents accidental credential exposure in database

**6. GET /test endpoint**
- No authentication required (useful for monitoring tool setup)
- Returns 200 OK with timestamp
- Allows integrators to verify webhook URL is reachable before configuring secrets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused delivery variable**
- **Found during:** Task 2 (Alert webhook receiver creation)
- **Issue:** TypeScript error TS6133: 'delivery' is declared but its value is never read
- **Fix:** Changed `const { alert, delivery } = await ...` to `const { alert } = await ...`
- **Files modified:** src/webhooks/alert-receiver.ts
- **Verification:** `npm run build` succeeds
- **Committed in:** 5195831 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeScript compilation fix. No scope creep.

## Issues Encountered

None - all tasks completed successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 02-07 (Integration-Specific Handlers):**
- Generic webhook receiver complete and mounted
- Integration-specific parsers can extend base alert schema
- Signature verification and idempotency work for all integrations

**Ready for Alert Acknowledgment (future):**
- Alert service has acknowledge() and resolve() methods
- Audit logging in place for lifecycle events
- Status transitions (OPEN → ACKNOWLEDGED → RESOLVED) implemented

**Ready for Testing:**
- All webhook outcomes logged (success, duplicate, validation, error)
- GET /test endpoint for connectivity verification
- Delivery records capture all attempts for debugging

**No blockers:** Webhook infrastructure complete. Ready for integration-specific handlers and alert routing logic.

---
*Phase: 02-alert-ingestion-webhooks*
*Completed: 2026-02-07*

## Self-Check: PASSED

All created files exist:
- src/services/alert.service.ts ✓
- src/webhooks/alert-receiver.ts ✓

All commits exist:
- 7b036e7 ✓
- 5195831 ✓
- 6ebcfe8 ✓
