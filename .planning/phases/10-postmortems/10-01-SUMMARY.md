---
phase: 10-postmortems
plan: 01
subsystem: postmortem
tags: [database, types, prisma, foundation]
dependency_graph:
  requires: []
  provides: [postmortem-schema, postmortem-types]
  affects: [postmortem-service, postmortem-api]
tech_stack:
  added: []
  patterns: [state-machine-enum, multi-incident-linking]
key_files:
  created:
    - prisma/schema.prisma (PostmortemStatus enum, ActionItemStatus enum, Postmortem model, ActionItem model)
    - src/types/postmortem.ts
  modified:
    - prisma/schema.prisma (User relations, Team relations)
decisions:
  - id: 10-01-1
    decision: Use incidentIds String[] for multi-incident linking instead of join table
    rationale: Simpler queries, matches existing pattern for affectedComponentIds in StatusIncident
metrics:
  duration: 2 min
  completed: 2026-02-08
---

# Phase 10 Plan 01: Schema & Types Summary

Prisma Postmortem and ActionItem models with TypeScript interfaces for multi-incident postmortems with action item tracking.

## What Was Built

### Task 1: Prisma Schema Models (1cd4f52)

Added to `prisma/schema.prisma`:

**Enums:**
- `PostmortemStatus`: DRAFT, PUBLISHED
- `ActionItemStatus`: OPEN, IN_PROGRESS, COMPLETED

**Models:**
- `Postmortem`: id, title, content, incidentIds[], status, team relation, createdBy relation, publishedAt, timestamps, actionItems relation
- `ActionItem`: id, postmortemId, title, description, status, priority, assignee relation, dueDate, completedAt, timestamps

**Relations added:**
- `User.postmortemsCreated` (PostmortemCreatedBy relation)
- `User.actionItemsAssigned`
- `Team.postmortems`

**Indexes:**
- `Postmortem`: [teamId, status], [createdById]
- `ActionItem`: [postmortemId], [assigneeId, status]

### Task 2: TypeScript Interfaces (804b63c)

Created `src/types/postmortem.ts`:

```typescript
// Enums
export type PostmortemStatus = 'DRAFT' | 'PUBLISHED';
export type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
export type ActionItemPriority = 'HIGH' | 'MEDIUM' | 'LOW';

// State machine
export const ACTION_ITEM_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]>

// Interfaces
export interface Postmortem { ... }
export interface ActionItem { ... }
export interface CreatePostmortemInput { ... }
export interface UpdatePostmortemInput { ... }
export interface CreateActionItemInput { ... }
export interface UpdateActionItemInput { ... }
export interface PostmortemTimelineEvent { ... }
```

### Task 3: Database Migration

Used `prisma db push` to sync schema with database (migration history had shadow database issues). Tables verified:
- `Postmortem` table with all 10 columns
- `ActionItem` table with all 11 columns
- `PostmortemStatus` and `ActionItemStatus` enums created
- Prisma client regenerated with 931 Postmortem references

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used db push instead of migrate dev**
- **Found during:** Task 3
- **Issue:** Migration history had shadow database error (P3006) due to previous migration state
- **Fix:** Used `npx prisma db push` which syncs schema directly without migration files
- **Impact:** Database is in sync, Prisma client regenerated. No migration file created but schema changes are tracked in schema.prisma which is committed.

## Verification Results

| Check | Result |
|-------|--------|
| `npx prisma validate` | PASSED |
| `npx tsc --noEmit src/types/postmortem.ts` | PASSED |
| Postmortem table exists | PASSED |
| ActionItem table exists | PASSED |
| Enums created | PASSED |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1cd4f52 | feat | Add Postmortem and ActionItem models to schema |
| 804b63c | feat | Create TypeScript interfaces for postmortem domain |

## Self-Check: PASSED

- [x] prisma/schema.prisma contains `model Postmortem`
- [x] prisma/schema.prisma contains `model ActionItem`
- [x] src/types/postmortem.ts exists
- [x] Commit 1cd4f52 exists
- [x] Commit 804b63c exists
