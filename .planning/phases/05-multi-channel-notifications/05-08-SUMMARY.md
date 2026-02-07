---
phase: 05-multi-channel-notifications
plan: 08
subsystem: notifications
tags: [twilio, sms, voice, magic-links, email, webhooks, interactive-notifications]

# Dependency graph
requires:
  - phase: 05-02
    provides: Email notification channel with magic link token generation
  - phase: 05-05
    provides: SMS and voice notification channels via Twilio
  - phase: 04-05
    provides: Incident acknowledge/resolve methods
provides:
  - Magic link verification routes for email interactions
  - SMS reply parsing with ACK/RESOLVE keyword detection
  - Voice IVR keypress handling (1=ack, 2=details, 9=escalate)
  - Twilio webhook handlers for delivery tracking
affects: [06-incident-ui, 05-notification-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Magic link token verification with SHA-256 hashing"
    - "SMS keyword parsing with fallback to recent incident"
    - "Voice IVR with TwiML dynamic generation"
    - "Twilio signature validation on webhooks"
    - "System user ID for unauthenticated actions (magic-link)"

key-files:
  created:
    - src/routes/magic-links.ts
    - src/services/notification/sms-reply.service.ts
    - src/routes/webhooks/twilio-webhooks.ts
  modified:
    - src/index.ts

key-decisions:
  - "System user ID 'magic-link' for unauthenticated magic link actions"
  - "SMS keyword detection with ACK/RESOLVE parsing"
  - "Fallback to most recent open incident if no ID in SMS"
  - "Voice IVR keypress 1/2/9 menu per user decision"
  - "Twilio signature validation required on all webhooks"
  - "Redirect to dashboard on magic link success/failure"

patterns-established:
  - "Magic link one-time use: mark token.used=true on first use"
  - "SMS reply parsing: extract 4+ digit short ID from message body"
  - "Voice IVR: machine detection for voicemail handling"
  - "Delivery status tracking via provider webhooks"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 5 Plan 8: Interactive Notification Handlers Summary

**Magic link verification, SMS reply parsing, and voice IVR keypress handling for bidirectional incident management across email/SMS/voice channels**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T21:38:39Z
- **Completed:** 2026-02-06T21:43:29Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Magic link routes handle acknowledge/resolve with 15-minute token expiry and one-time use
- SMS reply service parses ACK/RESOLVE keywords and extracts incident short IDs
- Voice IVR webhook generates dynamic TwiML with keypress menu (1=ack, 2=details, 9=escalate)
- Twilio signature validation on all SMS/voice webhooks for security
- Delivery status tracking via Twilio webhooks updates NotificationLog

## Task Commits

Each task was committed atomically:

1. **Task 1: Create magic link verification routes** - `8e946da` (feat)
2. **Task 2: Create SMS reply service and Twilio webhooks** - `e2a5b3b` (feat)
3. **Task 3: Mount magic links and Twilio webhooks in Express app** - `c91ff16` (feat)

**Plan metadata:** (deferred to final commit)

## Files Created/Modified
- `src/routes/magic-links.ts` - Magic link verification with token validation, expiry checks, and incident actions
- `src/services/notification/sms-reply.service.ts` - SMS reply processing with keyword detection and incident lookup
- `src/routes/webhooks/twilio-webhooks.ts` - Twilio SMS/voice webhooks with signature validation and delivery tracking
- `src/index.ts` - Mount magic links and Twilio webhook routes

## Decisions Made

**System user ID for magic link actions:**
- Magic links use system user ID `'magic-link'` instead of requiring authentication
- Token itself is proof of authorization (sent to verified email)
- Enables one-click incident acknowledgment from email

**SMS keyword parsing strategy:**
- Detect ACK/ACKNOWLEDGE or RESOLVE keywords case-insensitively
- Extract 4+ digit incident short ID from message body
- Fallback to most recent open incident if no ID provided
- Supports flexible reply formats: "ACK 123456" or "Reply ACK"

**Voice IVR keypress menu:**
- Press 1 to acknowledge (most common action)
- Press 2 to hear alert details and repeat menu
- Press 9 to escalate to next level (manual escalation)
- Machine detection for voicemail: leave simple message instead of menu

**Twilio signature validation:**
- Required on all SMS and voice webhooks per security best practice
- Uses Twilio's validateRequest with API_BASE_URL and AUTH_TOKEN
- Returns 403 Forbidden if signature invalid

## Deviations from Plan

None - plan executed exactly as written. The delivery-tracker service already existed from a prior plan (05-01), so no additional work was needed.

## Issues Encountered

**TypeScript async route handler return types:**
- Express async route handlers require explicit `return` statements for all response sends
- Fixed by adding `return res.status(...).send(...)` instead of just `res.status(...).send(...)`
- Pattern followed existing route handlers in project (calendarSync.routes.ts)

**Optional environment variables:**
- Added guards for optional TWILIO_AUTH_TOKEN and API_BASE_URL before signature validation
- Prevents TypeScript errors while maintaining development flexibility

## User Setup Required

None - no external service configuration required beyond existing Twilio setup.

## Next Phase Readiness

**Interactive notification loop complete:**
- Email: Magic links for acknowledge/resolve (✓)
- SMS: Reply parsing for ACK/RESOLVE (✓)
- Voice: IVR keypress for acknowledge/details/escalate (✓)
- Delivery tracking: Twilio webhooks update NotificationLog (✓)

**Remaining Phase 5 work:**
- Slack interactive buttons (already implemented in 05-03)
- Teams Adaptive Card actions (already implemented in 05-04)
- Notification orchestration service to coordinate multi-channel delivery
- Retry logic and failover between channels

**No blockers.** All interactive notification handlers operational.

---
*Phase: 05-multi-channel-notifications*
*Completed: 2026-02-06*

## Self-Check: PASSED

All created files verified:
- src/routes/magic-links.ts ✓
- src/services/notification/sms-reply.service.ts ✓
- src/routes/webhooks/twilio-webhooks.ts ✓

All commits verified:
- 8e946da ✓
- e2a5b3b ✓
- c91ff16 ✓
