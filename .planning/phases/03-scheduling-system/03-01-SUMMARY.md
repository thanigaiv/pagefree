---
phase: 03-scheduling-system
plan: 01
subsystem: database
tags: [prisma, postgresql, scheduling, rrule, timezone, calendar-sync]

# Dependency graph
requires:
  - phase: 01-foundation-user-management
    provides: Prisma schema foundation with User, Team, UTC timestamp pattern
  - phase: 02-alert-ingestion
    provides: Database models pattern, @db.Timestamptz usage
provides:
  - Schedule model with RRULE-based recurrence storage
  - ScheduleLayer model for multi-layer priority precedence
  - ScheduleOverride model for temporary coverage changes
  - CalendarSync model for OAuth tokens and external calendar sync state
  - Timezone-aware database schema following IANA timezone standard
affects: [03-02-schedule-creation, 03-03-rotation-logic, 03-04-calendar-sync, 04-alert-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RRULE-based recurrence storage for infinite schedules"
    - "Multi-layer schedule precedence (ScheduleLayer with priority field)"
    - "IANA timezone storage (String field) for DST-safe operations"
    - "CalendarSync with OAuth token storage for external integrations"

key-files:
  created: []
  modified: ["prisma/schema.prisma"]

key-decisions:
  - "Store schedules as RRULE strings, compute instances on-demand"
  - "IANA timezone names (America/New_York) not abbreviations (EST)"
  - "Multi-layer schedule support with priority-based precedence"
  - "OAuth token storage for calendar sync (Google, Microsoft)"
  - "ScheduleOverride for temporary coverage with conflict tracking"

patterns-established:
  - "Pattern: Store recurrence rules, not shift instances (calendar standard)"
  - "Pattern: IANA timezone fields for DST-aware date arithmetic"
  - "Pattern: Layer-based schedule precedence for complex rotations"
  - "Pattern: Override precedence: ScheduleOverride > ScheduleLayer > Schedule"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 03 Plan 01: Scheduling Database Models Summary

**RRULE-based schedule models with IANA timezones, multi-layer precedence, and calendar sync OAuth storage**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T01:56:51Z
- **Completed:** 2026-02-07T01:58:40Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Four new database models for on-call scheduling system
- RRULE-based recurrence storage enables infinite schedules without pre-computing shifts
- Multi-layer schedule support with priority-based precedence for complex coverage patterns
- IANA timezone storage (not offsets or abbreviations) ensures DST-safe operations
- CalendarSync model ready for Google Calendar and Microsoft Graph OAuth integrations

## Task Commits

Each task was committed atomically:

1. **Tasks 1-2: Add scheduling database models** - `f019ed5` (feat)
   - Schedule, ScheduleLayer, ScheduleOverride, CalendarSync models
   - Relations to Team and User models
   - All timestamps use @db.Timestamptz

## Files Created/Modified
- `prisma/schema.prisma` - Added Schedule, ScheduleLayer, ScheduleOverride, CalendarSync models with proper relations, indexes, and UTC timestamp storage

## Decisions Made

**1. Store recurrence rules (RRULE), not shift instances**
- Rationale: Calendar standard approach. Enables infinite schedules, easier pattern editing, less storage
- Per research: Google Calendar, Microsoft Graph both use RRULE format

**2. IANA timezone names (String field), not offsets or abbreviations**
- Rationale: Offsets break during DST transitions, abbreviations (EST/EDT) are ambiguous
- Storage: "America/New_York" not "EST" or "-05:00"
- Per research: PostgreSQL IANA database handles DST transitions automatically

**3. Multi-layer schedule precedence via priority field**
- Rationale: Support complex patterns (weekday primary + weekend backup + holiday coverage)
- Pattern: Higher priority number = higher precedence (Layer 3 > Layer 2 > Layer 1)
- Per research: PagerDuty established pattern for layered schedules

**4. CalendarSync stores OAuth tokens, not calendar events**
- Rationale: Platform is source of truth, calendars are sync targets (one-way sync)
- Storage: accessToken, refreshToken, tokenExpiresAt for auto-refresh capability
- Per research: Bidirectional sync causes conflicts when users modify calendar events

**5. ScheduleOverride for temporary coverage (vacation, shift swap)**
- Rationale: Highest precedence - overrides all layers for specific time range
- Fields: originalUserId for shift swap tracking, reason for audit trail
- Conflict detection: Time range index enables overlap queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 3 Plan 2:** Schedule creation API with RRULE generation

**Foundation established:**
- Database schema complete with proper relations and indexes
- UTC timestamp storage via @db.Timestamptz consistent with Phase 1 pattern
- IANA timezone fields ready for Luxon integration
- CalendarSync OAuth token storage ready for Google/Microsoft integration

**Blockers/Concerns:**
- None - research documented DST handling patterns for implementation phases
- Next plan should install `luxon` and `rrule` libraries per research recommendations
- DST transition test cases critical for spring-forward/fall-back scenarios (per research warnings)

---
*Phase: 03-scheduling-system*
*Completed: 2026-02-07*

## Self-Check: PASSED

All files and commits verified.
