---
phase: 10-postmortems
plan: 04
subsystem: api
tags: [routes, rest-api, postmortems, action-items, validation]
dependency-graph:
  requires: [10-02, 10-03]
  provides: [postmortem-api-endpoints, action-item-api-endpoints]
  affects: [frontend-postmortem-ui]
tech-stack:
  added: []
  patterns: [express-router, zod-validation, permission-checks]
key-files:
  created:
    - src/routes/postmortem.routes.ts
  modified:
    - src/index.ts
    - src/types/postmortem.ts
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-08
---

# Phase 10 Plan 04: Postmortem API Endpoints Summary

REST API endpoints for postmortem and action item management with Zod validation and RBAC enforcement.

## What Was Built

### Postmortem Routes (`src/routes/postmortem.routes.ts`)

**Postmortem CRUD:**
- `GET /api/postmortems` - List postmortems with optional `?teamId` filter
- `GET /api/postmortems/:id` - Get postmortem by ID with action items
- `GET /api/postmortems/:id/timeline` - Get audit event timeline from linked incidents
- `POST /api/postmortems` - Create postmortem (Responder+ permission)
- `PUT /api/postmortems/:id` - Update postmortem (Responder+ permission)
- `DELETE /api/postmortems/:id` - Delete postmortem (Team Admin only)

**Action Item Routes (nested):**
- `GET /api/postmortems/me/action-items` - Get current user's assigned items
- `POST /api/postmortems/:id/action-items` - Create action item (Responder+)
- `PUT /api/postmortems/:postmortemId/action-items/:itemId` - Update item (Responder+ or assignee)
- `DELETE /api/postmortems/:postmortemId/action-items/:itemId` - Delete item (Responder+)

### Validation Schemas

All inputs validated with Zod:

| Schema | Fields |
|--------|--------|
| createPostmortemSchema | title (1-200), content (opt), incidentIds (min 1), teamId |
| updatePostmortemSchema | title (opt), content (opt), incidentIds (opt), status (opt) |
| createActionItemSchema | title (1-200), description (opt), priority (opt), assigneeId, dueDate (opt) |
| updateActionItemSchema | title (opt), description (nullable opt), status (opt), priority (opt), assigneeId (opt), dueDate (nullable opt) |

### Permission Model

| Operation | Required Role |
|-----------|---------------|
| List/Read postmortems | Any authenticated user |
| Create/Update postmortem | Responder+ on team |
| Delete postmortem | Team Admin |
| Create action item | Responder+ on team |
| Update action item | Responder+ OR assignee |
| Delete action item | Responder+ on team |

### Error Handling

- 400: Zod validation errors (with field details), invalid status transitions
- 403: Insufficient permissions
- 404: Postmortem or action item not found

## Commits

| Hash | Description |
|------|-------------|
| c7c7a28 | feat(10-04): create postmortem REST API routes |
| c5a8cdc | feat(10-04): mount postmortem router in main app |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UpdateActionItemInput type**
- **Found during:** Task 1
- **Issue:** Type definition had `description?: string` but Zod schema allowed `null` for clearing description
- **Fix:** Changed type to `description?: string | null` to match Prisma/Zod behavior
- **Files modified:** src/types/postmortem.ts
- **Commit:** c7c7a28

## Verification

```bash
npx tsc --noEmit  # Compiles without errors (test file warnings are pre-existing)
```

## Self-Check: PASSED

- [x] src/routes/postmortem.routes.ts exists
- [x] src/index.ts imports and mounts postmortemRouter
- [x] Commit c7c7a28 exists
- [x] Commit c5a8cdc exists
