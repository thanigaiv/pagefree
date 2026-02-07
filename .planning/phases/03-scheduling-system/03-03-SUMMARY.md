---
phase: 03-scheduling-system
plan: 03
subsystem: scheduling
tags: [schedule-layers, priority-precedence, time-restrictions, rotation-management, rbac]

# Dependency graph
requires:
  - phase: 03-scheduling-system
    plan: 01
    provides: ScheduleLayer database model with priority and restrictions fields
  - phase: 03-scheduling-system
    plan: 02
    provides: Base schedule types, service with RRULE generation, and routes
provides:
  - Schedule layer types with day-of-week restrictions
  - ScheduleLayerService with layer CRUD and priority management
  - Layer API routes with RBAC enforcement
  - Priority-based precedence system (higher priority = higher precedence)
  - Reorder API for drag-and-drop priority management
affects: [03-04-on-call-computation, 03-05-override-management, 04-alert-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-layer schedule precedence via priority field (100, 90, 80...)"
    - "Time-based restrictions using daysOfWeek array (MO, TU, WE, etc.)"
    - "RRULE generation for layer rotation patterns"
    - "Team admin RBAC for layer management operations"
    - "Drag-and-drop reorder API with priority reassignment"

key-files:
  created:
    - "src/services/scheduleLayer.service.ts"
    - "src/routes/scheduleLayer.routes.ts"
  modified:
    - "src/types/schedule.ts"
    - "src/routes/schedule.routes.ts"

key-decisions:
  - "Layer priorities: 100 (highest) to 1 (lowest) with 10-point gaps"
  - "Restrictions stored as JSON: {daysOfWeek: ['MO', 'TU', ...]}"
  - "Layers ordered by priority DESC in findBySchedule query"
  - "Team admin required for all layer mutation operations"
  - "Hard delete for layers (no soft delete/archive)"
  - "RRULE regeneration on layer update when rotation settings change"

patterns-established:
  - "Pattern: Layer precedence enables primary/backup/weekend coverage models"
  - "Pattern: Reorder API updates priorities in transaction (atomic operation)"
  - "Pattern: Layer validation ensures users are team members before creation"
  - "Pattern: Priority conflict warning (non-blocking) when duplicate priority exists"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 03 Plan 03: Schedule Layer Management Summary

**Priority-based multi-layer schedules with day-of-week restrictions and drag-and-drop reordering**

## Performance

- **Duration:** 5 min (271 seconds)
- **Started:** 2026-02-07T02:01:00Z
- **Completed:** 2026-02-07T02:05:31Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Schedule layer types with DayOfWeek enum for time-based restrictions
- ScheduleLayerService with full CRUD operations and priority management
- Layer API routes with nested structure under `/api/schedules/:scheduleId/layers`
- Priority-based precedence system: higher priority layers override lower priority layers
- Reorder endpoint enables drag-and-drop priority management in UI
- RBAC enforcement: team admin required for all layer mutations
- Audit logging for all layer lifecycle events (create, update, delete, reorder)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add layer types and validation schemas** - `9bb7840` (feat)
   - DayOfWeek enum (MO, TU, WE, TH, FR, SA, SU)
   - LayerRestrictionsSchema for daysOfWeek filtering
   - CreateLayerInputSchema and UpdateLayerInputSchema
   - LayerWithSchedule interface for API responses

2. **Task 2: Create schedule layer service** - `0311d9f` (feat)
   - ScheduleLayerService class with RRULE generation helper
   - create() validates users are team members and warns on priority conflicts
   - findBySchedule() returns layers ordered by priority DESC
   - update() regenerates RRULE when rotation settings change
   - delete() performs hard delete with audit logging
   - reorderPriorities() enables drag-and-drop with atomic transaction

3. **Task 3: Create layer routes and mount to app** - `4f801cc` (feat)
   - POST /api/schedules/:scheduleId/layers - Create layer
   - GET /api/schedules/:scheduleId/layers - List layers (ordered by priority)
   - GET /api/schedules/:scheduleId/layers/:layerId - Get specific layer
   - PATCH /api/schedules/:scheduleId/layers/:layerId - Update layer
   - DELETE /api/schedules/:scheduleId/layers/:layerId - Delete layer
   - POST /api/schedules/:scheduleId/layers/reorder - Reorder priorities
   - RBAC helper: isTeamAdmin checks platform admin or team admin role
   - Mounted in schedule router at root path

## Files Created/Modified

**Created:**
- `src/services/scheduleLayer.service.ts` - Layer service with CRUD and priority management (418 lines)
- `src/routes/scheduleLayer.routes.ts` - Layer API routes with RBAC enforcement (320 lines)

**Modified:**
- `src/types/schedule.ts` - Added layer types, restrictions schema, and validation schemas
- `src/routes/schedule.routes.ts` - Mounted layer router as nested routes

## Decisions Made

**1. Layer priority scale: 100 to 1 with 10-point gaps**
- Rationale: Enables easy insertion of new layers between existing ones without reordering
- Implementation: Reorder API assigns priorities starting at 100, decreasing by 10 (100, 90, 80, ...)
- Pattern: Higher priority = higher precedence (Layer 100 overrides Layer 90)

**2. Restrictions stored as JSON in database**
- Rationale: Flexible schema for future restriction types (time-of-day, date ranges)
- Current implementation: `{daysOfWeek: ['MO', 'TU', 'WE', 'TH', 'FR']}`
- Type safety: Zod validates restrictions at API boundary before storage

**3. Team admin required for all layer mutations**
- Rationale: Layers affect schedule behavior; require elevated permissions
- Implementation: isTeamAdmin helper checks platform admin OR team admin role
- Pattern: Read operations (GET) open to all authenticated users

**4. Hard delete for layers (no soft delete)**
- Rationale: Layers are configuration, not audit-critical data like alerts/incidents
- Implementation: Cascade delete handled by database schema (onDelete: Cascade)
- Audit trail: Delete operation logged with layer metadata before deletion

**5. Priority conflict warning (non-blocking)**
- Rationale: Duplicate priorities are allowed but typically indicate user error
- Implementation: Console warning logged when creating layer with existing priority
- User experience: API doesn't fail; allows intentional same-priority layers

**6. RRULE regeneration on layer update**
- Rationale: Layer rotation settings can change independently from parent schedule
- Implementation: Update method regenerates RRULE if rotationType, startDate, or handoffTime provided
- Constraint: rotationType must be provided if updating any rotation setting

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript field reference errors in layer service**
- **Found during:** Task 2, initial compilation
- **Issue:** Attempted to access `rotationType` and `rotationIntervalDays` fields on ScheduleLayer model, but schema only stores `recurrenceRule`
- **Fix:** Updated layer update method to require these fields in input when regenerating RRULE, rather than reading from existing layer
- **Files modified:** src/services/scheduleLayer.service.ts
- **Commit:** 0311d9f (amended)

**2. [Rule 1 - Bug] Fixed Zod error property name**
- **Found during:** Task 3, compilation
- **Issue:** Accessing `error.errors` on ZodError instead of correct `error.issues` property
- **Fix:** Updated all error handlers to use `error.issues`
- **Files modified:** src/routes/scheduleLayer.routes.ts
- **Commit:** 4f801cc

**3. [Rule 3 - Blocking] Base schedule types file didn't exist**
- **Found during:** Task 1, attempting to extend schedule.ts
- **Issue:** Plan assumed schedule.ts existed from parallel plan 03-02
- **Fix:** Discovered file already existed from earlier commit; proceeded with extension
- **Impact:** No blocking issue; file was present from 03-02 completion
- **Deviation type:** False alarm - dependency already satisfied

## Issues Encountered

None beyond auto-fixed bugs.

## Next Phase Readiness

**Ready for Phase 3 Plan 4:** On-call computation with layer precedence

**Foundation established:**
- Layer types and service complete with priority-based precedence
- API routes enforce RBAC for layer management
- Restrictions framework ready for day-of-week filtering
- Reorder API enables priority management for UI

**Implementation notes for next plan:**
- On-call computation must evaluate layers by priority DESC (already ordered in findBySchedule)
- Layer restrictions (daysOfWeek) should filter shifts during computation
- Override precedence: ScheduleOverride > ScheduleLayer > Schedule base rotation

**Future enhancements (not blocking):**
- Time-of-day restrictions (startHour/endHour) in LayerRestrictionsSchema
- Date range restrictions for seasonal coverage patterns
- Layer templates for common patterns (weekday/weekend split)

---
*Phase: 03-scheduling-system*
*Completed: 2026-02-07*

## Self-Check: PASSED

All files and commits verified.
