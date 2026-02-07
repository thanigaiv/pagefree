---
phase: "04"
plan: "05"
title: "Incident Lifecycle Management (Acknowledge, Resolve, Reassign)"
subsystem: "incident-management"
tags: ["incident", "lifecycle", "escalation", "api", "rbac"]

dependencies:
  requires:
    - "04-01: Database models (Incident, EscalationJob tables)"
    - "04-02: BullMQ queue infrastructure (cancelEscalation)"
    - "01-02: Audit service for action logging"
    - "01-03: Permission service for RBAC checks"
  provides:
    - "Incident lifecycle service (acknowledge, resolve, close, reassign)"
    - "Incident API routes at /api/incidents"
    - "Escalation job cancellation on acknowledgment"
    - "Timeline/notes functionality"
  affects:
    - "04-06: Alert creation and incident triggering"
    - "05-*: Notification delivery will use incident status"
    - "Phase 6: Incident timeline and UI will consume these APIs"

tech-stack:
  added: []
  patterns:
    - "Service layer for incident business logic"
    - "Permission checks via permissionService"
    - "Audit logging for all incident actions"
    - "BullMQ job cancellation on acknowledge/resolve"

key-files:
  created:
    - "src/services/incident.service.ts"
    - "src/routes/incident.routes.ts"
  modified:
    - "src/index.ts (routes mounted by 04-03)"

decisions:
  - decision: "Acknowledge assigns incident to acknowledger automatically"
    rationale: "Common on-call pattern - whoever acks takes ownership"
    location: "incidentService.acknowledge"
  - decision: "Resolve and acknowledge both cancel pending escalations"
    rationale: "Both states mean no more escalation needed"
    location: "incidentService.acknowledge, incidentService.resolve"
  - decision: "Timeline built from audit events (no separate table)"
    rationale: "Audit events are the source of truth for incident history"
    location: "incidentService.getTimeline"
  - decision: "Notes stored as audit events (incident.note.added action)"
    rationale: "Consistent with timeline approach, no separate notes table"
    location: "incidentService.addNote"
  - decision: "Reassign validates team membership and active status"
    rationale: "Can't assign to observers or inactive users"
    location: "incidentService.reassign"
  - decision: "Close only works on RESOLVED incidents"
    rationale: "Enforce state machine: OPEN → ACKNOWLEDGED → RESOLVED → CLOSED"
    location: "incidentService.close"
  - decision: "Any team responder can acknowledge/resolve"
    rationale: "On-call rotation means any responder should be able to act"
    location: "incident.routes.ts permission checks"

metrics:
  duration: "5 min"
  completed: "2026-02-07"
  tasks: 2
  commits: 2
---

# Phase 04 Plan 05: Incident Lifecycle Management (Acknowledge, Resolve, Reassign) Summary

**One-liner:** Incident lifecycle API (acknowledge stops escalation, resolve tracks duration, reassign with team validation, timeline from audit events)

## Overview

Created incident lifecycle management service and REST API for on-call engineers to manage incidents. Implemented acknowledge (stops escalation, assigns to acknowledger), resolve (tracks duration), close (final state), and reassign (validates team membership). All actions are audit-logged and build incident timeline.

## What Was Built

### Service Layer (incident.service.ts)

**Core lifecycle methods:**
- `acknowledge()` - Stops escalation, assigns to acknowledger, cancels all pending BullMQ jobs
- `resolve()` - Marks complete with duration tracking, cancels remaining escalations
- `close()` - Final state transition (only from RESOLVED)
- `reassign()` - Validates new assignee is active team responder

**Query methods:**
- `getById()` - Fetch incident with team, policy, assignee, alerts, active escalation jobs
- `list()` - Filter by team, status, assignee, priority, date range with cursor pagination
- `getTimeline()` - Build incident history from audit events

**Timeline/Notes:**
- `addNote()` - Store note as audit event (incident.note.added action)
- Timeline automatically includes all incident actions from audit service

**Escalation integration:**
- Imports `cancelEscalation` from escalation.queue.ts
- Marks EscalationJob records as completed with cancelledAt timestamp
- Logs number of cancelled escalations in audit metadata

### REST API (incident.routes.ts)

**GET endpoints:**
- `GET /api/incidents` - List with filters (teamId, status, assignedUserId, priority, dates)
- `GET /api/incidents/my` - Current user's assigned incidents (defaults to OPEN/ACKNOWLEDGED)
- `GET /api/incidents/:id` - Get incident details with related data
- `GET /api/incidents/:id/timeline` - View incident history

**POST endpoints:**
- `POST /api/incidents/:id/acknowledge` - Stop escalation and take ownership
- `POST /api/incidents/:id/resolve` - Mark complete with optional resolution note
- `POST /api/incidents/:id/close` - Final state (only from RESOLVED)
- `POST /api/incidents/:id/reassign` - Hand off to another responder (requires userId, optional reason)
- `POST /api/incidents/:id/notes` - Add note to timeline

**Permission checks:**
- View actions: `permissionService.canViewTeam()` (any authenticated user per full visibility model)
- Respond actions: `permissionService.canRespondToIncident()` (RESPONDER or TEAM_ADMIN role)
- All endpoints validate team membership before allowing actions

**Error handling:**
- 404 for incident not found
- 403 for insufficient permissions
- 400 for invalid state transitions (e.g., acknowledge already-resolved incident)
- 400 for validation errors (e.g., missing userId on reassign)

### Integration Points

**Escalation queue cancellation:**
```typescript
// Cancel all pending escalation jobs
for (const job of incident.escalationJobs) {
  await cancelEscalation(job.bullJobId);
  await prisma.escalationJob.update({
    where: { id: job.id },
    data: { completed: true, cancelledAt: new Date() }
  });
}
```

**Audit logging:**
```typescript
await auditService.log({
  action: 'incident.acknowledged',
  userId,
  teamId: incident.teamId,
  resourceType: 'incident',
  resourceId: incidentId,
  severity: 'INFO',
  metadata: {
    previousStatus: incident.status,
    escalationsCancelled: incident.escalationJobs.length,
    note
  }
});
```

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1. Create incident service | 457e92e | Lifecycle methods (acknowledge, resolve, close, reassign), query methods (getById, list), timeline/notes, escalation job cancellation |
| 2. Create incident routes | 0959697 | REST API with 9 endpoints, permission checks via permissionService, error handling, mounted at /api/incidents |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed permission service import and method calls**

- **Found during:** Task 2 - routes compilation
- **Issue:** Plan referenced `rbacService.checkTeamPermission()` but actual service is `permissionService` with methods `canViewTeam()` and `canRespondToIncident()`
- **Fix:**
  - Changed import from `rbac.service.js` to `permission.service.js`
  - Updated all permission checks to use correct method signatures
  - `canViewTeam(user, teamId)` for view operations
  - `canRespondToIncident(user, teamId)` for respond operations
- **Files modified:** src/routes/incident.routes.ts
- **Commit:** 0959697

**2. [Rule 1 - Bug] Fixed TypeScript noImplicitReturns errors**

- **Found during:** Task 2 - build verification
- **Issue:** TypeScript strict mode requires all code paths to return a value, but route handlers had statements without `return`
- **Fix:** Added `return` statements to all `res.json()`, `res.status().json()`, and `next(error)` calls
- **Rationale:** Project tsconfig.json has `"noImplicitReturns": true`, code wouldn't compile without returns
- **Files modified:** src/routes/incident.routes.ts
- **Commit:** 0959697

## Verification

- ✅ `npm run build` succeeds with no TypeScript errors
- ✅ src/services/incident.service.ts exports incidentService
- ✅ src/routes/incident.routes.ts exports incidentRoutes
- ✅ Acknowledge endpoint cancels escalation jobs via cancelEscalation()
- ✅ Routes mounted at /api/incidents in index.ts (done by 04-03)

## Success Criteria Met

✅ **Incident lifecycle management complete:**
- Acknowledge stops escalation and assigns to acknowledger
- Resolve marks incident complete with duration tracking
- Reassign allows manual hand-off with audit trail
- Timeline built from audit events
- All actions require team membership

## Next Phase Readiness

**Ready for 04-06 (Alert Creation and Incident Triggering):**
- Incident service available for alert creation to call
- Lifecycle methods ready for incident state management
- Timeline/notes foundation in place

**Ready for Phase 5 (Notification Delivery):**
- Incident status available for notification routing
- Acknowledge/resolve actions will trigger notification updates
- Timeline will show notification delivery events

**Ready for Phase 6 (Incident UI):**
- All incident APIs available for frontend consumption
- Timeline endpoint ready for incident history view
- Notes/comments foundation in place

**No blockers identified.**

## Self-Check: PASSED

All commits verified:
- 457e92e: incident.service.ts exists
- 0959697: incident.routes.ts exists

All key files verified:
- ✅ src/services/incident.service.ts
- ✅ src/routes/incident.routes.ts
