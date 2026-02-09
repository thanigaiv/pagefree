---
phase: 15-runbook-automation-foundation
plan: 01
subsystem: runbook
tags: [runbook, prisma, crud, approval-workflow, versioning]
dependency-graph:
  requires: [workflow-patterns]
  provides: [runbook-models, runbook-service, approval-state-machine]
  affects: [incidents, teams, users]
tech-stack:
  added: []
  patterns: [approval-state-machine, version-snapshots, platform-admin-gates]
key-files:
  created:
    - src/types/runbook.ts
    - src/services/runbook/runbook.service.ts
  modified:
    - prisma/schema.prisma
decisions:
  - z.any() for complex JSON validation (follows workflow.service.ts pattern)
  - Version snapshot on every definition change and approval
  - Rollback reverts to DRAFT status (requires re-approval)
metrics:
  duration: 5m 19s
  completed: 2026-02-08T23:59:21Z
---

# Phase 15 Plan 01: Runbook Database Models and CRUD Service Summary

Runbook database models with approval state machine mirroring the proven Workflow pattern.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Runbook Prisma Models | b83ccdc | prisma/schema.prisma |
| 2 | Create Runbook TypeScript Types | 8f2630e | src/types/runbook.ts |
| 3 | Create Runbook Service with Approval State Machine | 88a25bb | src/services/runbook/runbook.service.ts |

## Implementation Details

### Database Models (Task 1)

Added three new Prisma models:

1. **Runbook** - Main model with:
   - Webhook execution target (URL, method, headers, auth)
   - Parameters defined as JSON Schema
   - Payload template (Handlebars)
   - Approval workflow (DRAFT -> APPROVED -> DEPRECATED)
   - Team or global scope
   - Proper indexes for queries

2. **RunbookVersion** - Version history with:
   - Definition snapshot at each version
   - Change tracking (who, when, note)
   - Unique constraint on runbookId + version

3. **RunbookExecution** - Execution tracking with:
   - Definition snapshot at execution time
   - Optional incident link
   - Parameters used
   - Execution state (PENDING, RUNNING, SUCCESS, FAILED)
   - Trigger tracking (workflow vs manual)

Added User, Team, and Incident relations for proper foreign key relationships.

### TypeScript Types (Task 2)

Created comprehensive type definitions:

- `RunbookApprovalStatus`: 'DRAFT' | 'APPROVED' | 'DEPRECATED'
- `RunbookExecutionStatus`: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'
- `RunbookParameterSchema`: JSON Schema-like parameter definition
- `RunbookWebhookAuth`: Authentication configuration
- `RunbookDefinition`: Complete runbook snapshot for versioning
- `RunbookExecutionResult`: Webhook execution result
- `TriggerRunbookParams`: Parameters for triggering execution

### CRUD Service (Task 3)

Implemented `runbookService` with full CRUD and approval operations:

**CRUD Operations:**
- `create()` - Creates DRAFT runbook with initial version snapshot
- `get()` - Returns runbook with recent versions and executions
- `list()` - Paginated listing with filters (team, approval status)
- `update()` - Updates runbook, creates version snapshot, reverts APPROVED to DRAFT
- `delete()` - Deletes runbook, fails if active executions exist

**Approval State Machine:**
- `approve()` - PLATFORM_ADMIN only, DRAFT -> APPROVED, creates version snapshot
- `deprecate()` - PLATFORM_ADMIN only, APPROVED -> DEPRECATED, creates version snapshot

**Version History:**
- `getVersionHistory()` - Returns all versions with change info
- `rollback()` - Reverts to previous version, sets status to DRAFT (requires re-approval)

**Permission Model:**
- Team runbooks: Team admin required
- Global runbooks: Platform admin required
- View: Team member or platform admin

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions Made

1. **z.any() for complex JSON validation**: Following workflow.service.ts pattern, using z.any() for parameters, webhookHeaders, and webhookAuth fields. Type safety enforced via TypeScript types rather than Zod runtime validation.

2. **Version snapshots**: Created on every definition change and on approval transitions. This ensures complete audit trail for all runbook modifications.

3. **Rollback behavior**: Rolling back to a previous version always sets status to DRAFT, requiring re-approval. This prevents accidental execution of unreviewed changes.

## Verification Results

- [x] `npx prisma generate` - completed without errors
- [x] `npx prisma db push` - schema applied successfully
- [x] TypeScript compilation - no errors in runbook files
- [x] Runbook, RunbookVersion, RunbookExecution models exist
- [x] runbookService exports: create, get, list, update, delete, approve, deprecate, getVersionHistory, rollback

## Self-Check: PASSED

Verified all artifacts:
- FOUND: prisma/schema.prisma (Runbook models)
- FOUND: src/types/runbook.ts
- FOUND: src/services/runbook/runbook.service.ts
- FOUND: b83ccdc (Prisma models commit)
- FOUND: 8f2630e (Types commit)
- FOUND: 88a25bb (Service commit)
