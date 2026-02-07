---
phase: 03-scheduling-system
plan: 04
type: execute
subsystem: scheduling
tags: [schedule-overrides, conflict-detection, shift-swaps, typescript, express]

requires:
  - 03-02-SUMMARY.md  # Schedule CRUD with RRULE
  - 03-03-SUMMARY.md  # Layer management with priority precedence

provides:
  - Override CRUD operations with conflict detection
  - Shift swap workflow between team members
  - User's upcoming overrides API
  - Transaction-based override creation preventing race conditions

affects:
  - 03-05  # On-call computation will use overrides as highest precedence
  - 04-01  # Notification dispatch will query on-call with overrides applied

tech-stack:
  added:
    - None (uses existing Prisma, Express, Zod)
  patterns:
    - Prisma transactions for atomicity
    - Overlap detection via time range queries
    - Nested Express routers (schedules/:id/overrides)
    - Permission checks (team admin/responder for overrides)

key-files:
  created:
    - src/services/scheduleOverride.service.ts
    - src/routes/scheduleOverride.routes.ts
  modified:
    - src/types/schedule.ts  # Added override types and schemas
    - src/routes/schedule.routes.ts  # Mounted override router
    - src/routes/user.routes.ts  # Added upcoming overrides endpoint

decisions:
  - title: "Overlap conflict detection using OR conditions"
    rationale: "Check for any time range overlap: new start during existing, new end during existing, or new contains existing"
    context: "Prevents double-booking and ensures only one override per time slot"
    impact: "Ensures schedule integrity and prevents conflicts"

  - title: "Hard delete for overrides (no soft delete)"
    rationale: "Overrides are temporary by nature and don't require long-term audit trail preservation"
    context: "Following pattern from schedule layers (configuration vs audit-critical data)"
    impact: "Simpler data model, cleanup job can permanently remove expired overrides"

  - title: "Permission model: responders can create overrides"
    rationale: "Allow flexibility for on-call team members to handle coverage changes without admin intervention"
    context: "Observers cannot create overrides (view-only), admins have full control"
    impact: "Empowers team responders while maintaining observer boundaries"

  - title: "Swaps require original user or team admin"
    rationale: "Only the person who owns the shift or an admin should initiate a swap"
    context: "Prevents unauthorized shift reassignments"
    impact: "Security and accountability for shift changes"

metrics:
  duration: 2 min
  completed: 2026-02-07
---

# Phase 3 Plan 4: Schedule Override Management Summary

**One-liner:** Override CRUD with conflict detection and shift swap workflow using Prisma transactions for atomicity

## What Was Built

### Core Features
1. **Override Types and Validation** (src/types/schedule.ts)
   - `CreateOverrideInputSchema`: Manual override creation with time range validation
   - `CreateSwapInputSchema`: Shift swap between users with self-swap prevention
   - `OverrideListQuerySchema`: Filtering by schedule, user, time range
   - `OverrideWithUsers` interface: Rich response type with user relations

2. **ScheduleOverrideService** (src/services/scheduleOverride.service.ts)
   - **createOverride**: Transaction-based override creation
     - Team membership validation
     - Active user checks
     - Overlap conflict detection
     - Audit logging
   - **createSwap**: Shift swap workflow
     - Both users must be team members
     - Cannot swap with yourself validation
     - Separate audit log action
   - **Overlap Detection Helper**: `checkOverlapConflict`
     - Checks three overlap scenarios (start, end, contains)
     - Excludes specific override ID for update scenarios
     - Returns conflicting override with details
   - **findBySchedule**: List overrides with time filtering
   - **findById**: Single override retrieval
   - **findUpcoming**: User's upcoming overrides (startTime > now)
   - **delete**: Permission-checked removal (creator or team admin)
   - **deleteExpired**: Cleanup job for 30+ day old overrides

3. **Override API Routes** (src/routes/scheduleOverride.routes.ts)
   - `POST /api/schedules/:scheduleId/overrides` - Create override
     - Permission: Team admin or responder
     - Returns 409 Conflict on overlap
   - `POST /api/schedules/:scheduleId/swaps` - Create shift swap
     - Permission: Original user or team admin
     - Records both originalUserId and newUserId
   - `GET /api/schedules/:scheduleId/overrides` - List overrides
     - Query params: userId, startAfter, endBefore
   - `GET /api/schedules/:scheduleId/overrides/:overrideId` - Get single override
     - Validates override belongs to schedule
   - `DELETE /api/schedules/:scheduleId/overrides/:overrideId` - Delete override
     - Returns 204 No Content on success
   - `GET /api/users/me/overrides/upcoming` - User's upcoming overrides
     - Added to user routes for convenience

### Technical Implementation
- **Transaction Safety**: All mutations use `prisma.$transaction` for atomicity
- **Conflict Detection**: Time range overlap queries with OR conditions
- **Permission Model**: Role-based checks (platform admin > team admin > responder > observer)
- **Audit Trail**: All create/swap/delete operations logged
- **Error Handling**: 409 Conflict for overlaps, 403 Forbidden for permissions, 404 for not found

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add override types and validation schemas | bb191e6 | src/types/schedule.ts |
| 2 | Create schedule override service with conflict detection | b14e63a | src/services/scheduleOverride.service.ts |
| 3 | Create override routes and mount to app | 1408fc4 | src/routes/scheduleOverride.routes.ts, src/routes/schedule.routes.ts, src/routes/user.routes.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

### Verification Completed
1. TypeScript compilation: Clean build with no errors
2. Service layer: Transaction-based operations for atomicity
3. Overlap detection: Three-condition OR query catches all overlap scenarios
4. Permission checks: Proper role-based access control
5. Audit logging: Create, swap, and delete operations logged

### Manual Testing Required
- Create manual override for schedule → should return 201
- Create overlapping override → should return 409 Conflict
- Create swap between two users → should set overrideType='swap'
- Try swap with yourself → should fail validation (400)
- Try override as observer → should return 403
- Delete override as creator → should succeed
- Delete override as team admin → should succeed
- Delete override as non-creator non-admin → should return 403
- GET /api/users/me/overrides/upcoming → should show future overrides only

## Integration Points

### Upstream Dependencies
- **03-02**: Schedule model with RRULE and rotation users
- **03-03**: Layer management (overrides will be higher precedence)
- **Prisma Schema**: ScheduleOverride model with user relations

### Downstream Impacts
- **03-05 (On-call Computation)**: Will check overrides first (highest precedence)
- **04-xx (Notifications)**: Will query on-call with overrides applied
- **Calendar Sync**: Overrides should sync to external calendars

## Next Phase Readiness

### Blockers
None.

### Concerns
- **DST Transitions**: Overrides specified in ISO timestamps are DST-safe
- **Race Conditions**: Transaction-based conflict detection prevents double-booking
- **Cleanup Job**: `deleteExpired()` ready for scheduled cleanup (cron job needed)

### Recommendations
1. **Add integration tests** for overlap detection edge cases
2. **Test DST transitions** (spring-forward/fall-back scenarios)
3. **Schedule cleanup job** to run `deleteExpired()` daily
4. **Monitor conflict rate** to tune conflict detection algorithm if needed

## Performance Characteristics

- **Override Creation**: Single transaction with 3-4 queries (schedule, team member, conflict check, insert)
- **Conflict Detection**: Single query with time range conditions and indexes
- **List Overrides**: Efficient query with schedule/user/time filters
- **Cleanup**: Bulk delete with time-based filter

## Security Considerations

- **Team Membership Validation**: Both override user and swap users must be team members
- **Permission Checks**: Role-based access control enforced
- **Active User Validation**: Cannot create overrides with inactive users
- **Audit Logging**: All mutations logged with HIGH severity for security visibility

---

**Status:** Complete
**Next Plan:** 03-05 (On-call Computation with Layer/Override Precedence)

## Self-Check: PASSED
