---
phase: 10-postmortems
plan: 05
subsystem: frontend
tags: [react-query, hooks, typescript, postmortems, action-items]
dependency-graph:
  requires: [10-04]
  provides: [postmortem-frontend-hooks, postmortem-frontend-types]
  affects: [10-06, 10-07]
tech-stack:
  added: []
  patterns: [react-query-hooks, type-safe-api-fetching]
key-files:
  created:
    - frontend/src/types/postmortem.ts
    - frontend/src/hooks/usePostmortems.ts
  modified: []
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-08
---

# Phase 10 Plan 05: Frontend React Query Hooks Summary

Type-safe React Query hooks and TypeScript types for postmortem and action item operations.

## What Was Built

### TypeScript Types (`frontend/src/types/postmortem.ts`)

**Status/Priority Types:**
- `PostmortemStatus` = 'DRAFT' | 'PUBLISHED'
- `ActionItemStatus` = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'
- `ActionItemPriority` = 'HIGH' | 'MEDIUM' | 'LOW'

**Core Interfaces:**
- `Postmortem` - full postmortem with optional team, createdBy, actionItems
- `ActionItem` - action item with optional assignee, postmortem (for /me/action-items)
- `PostmortemTimelineEvent` - audit event from linked incidents

**Input Types:**
- `CreatePostmortemInput`, `UpdatePostmortemInput`
- `CreateActionItemInput`, `UpdateActionItemInput`

**Response Types:**
- `PostmortemListResponse`, `PostmortemResponse`
- `ActionItemListResponse`, `ActionItemResponse`
- `PostmortemTimelineResponse`

### React Query Hooks (`frontend/src/hooks/usePostmortems.ts`)

**Query Hooks:**

| Hook | Endpoint | Features |
|------|----------|----------|
| `usePostmortems(teamId?)` | GET /postmortems | Optional team filter |
| `usePostmortem(id)` | GET /postmortems/:id | enabled: !!id |
| `usePostmortemTimeline(id, enabled)` | GET /postmortems/:id/timeline | 5 min staleTime |
| `useMyActionItems(status?)` | GET /postmortems/me/action-items | Optional status filter |

**Mutation Hooks:**

| Hook | Endpoint | Invalidates |
|------|----------|-------------|
| `useCreatePostmortem()` | POST /postmortems | ['postmortems'] |
| `useUpdatePostmortem()` | PUT /postmortems/:id | ['postmortem', id], ['postmortems'] |
| `useDeletePostmortem()` | DELETE /postmortems/:id | ['postmortems'] |
| `useCreateActionItem()` | POST /postmortems/:id/action-items | ['postmortem', id], ['my-action-items'] |
| `useUpdateActionItem()` | PUT /postmortems/:pmId/action-items/:itemId | ['postmortem', pmId], ['my-action-items'] |
| `useDeleteActionItem()` | DELETE /postmortems/:pmId/action-items/:itemId | ['postmortem', pmId], ['my-action-items'] |

## Commits

| Hash | Description |
|------|-------------|
| 8bcb39e | feat(10-05): create frontend TypeScript types for postmortems |
| 4d66844 | feat(10-05): create React Query hooks for postmortems |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

```bash
npx tsc --noEmit  # No postmortem-related errors
```

All hooks exported and types match backend API.

## Self-Check: PASSED

- [x] frontend/src/types/postmortem.ts exists
- [x] frontend/src/hooks/usePostmortems.ts exists
- [x] Commit 8bcb39e exists
- [x] Commit 4d66844 exists
