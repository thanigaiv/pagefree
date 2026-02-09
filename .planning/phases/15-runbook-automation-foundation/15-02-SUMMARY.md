---
phase: 15-runbook-automation-foundation
plan: 02
subsystem: runbook
tags: [runbook, rest-api, webhook-executor, bullmq, queue, worker]
dependency-graph:
  requires: [runbook-models, runbook-service, workflow-patterns, webhook-action]
  provides: [runbook-routes, runbook-executor, runbook-queue, runbook-worker]
  affects: [incidents, audit-log]
tech-stack:
  added: []
  patterns: [parameter-validation-zod, webhook-retry, definition-snapshot, async-execution]
key-files:
  created:
    - src/routes/runbook.routes.ts
    - src/services/runbook/runbook-executor.service.ts
    - src/queues/runbook.queue.ts
    - src/workers/runbook.worker.ts
  modified:
    - src/index.ts
decisions:
  - Reuse existing executeWebhookWithRetry from webhook.action.ts
  - Parameter validation via Zod dynamically built from JSON Schema
  - Definition snapshot stored at execution trigger time
  - Re-check APPROVED status at execution time
metrics:
  duration: 4m 34s
  completed: 2026-02-09T00:06:16Z
---

# Phase 15 Plan 02: Runbook REST API, Executor, and BullMQ Infrastructure Summary

REST API for runbook CRUD and execution trigger, webhook executor with 3-retry exponential backoff, BullMQ queue and worker for async processing.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Runbook REST API Routes | 94f5b38 | src/routes/runbook.routes.ts |
| 2 | Create Runbook Executor Service | dbe85f0 | src/services/runbook/runbook-executor.service.ts |
| 3 | Create Runbook Queue and Worker | 20a5b89 | src/queues/runbook.queue.ts, src/workers/runbook.worker.ts |
| 4 | Wire Routes and Worker into Application | 9d7f548 | src/index.ts |

## Implementation Details

### REST API Routes (Task 1)

Created comprehensive REST API at `/api/runbooks`:

**CRUD Endpoints:**
- `POST /api/runbooks` - Create runbook (starts as DRAFT)
- `GET /api/runbooks` - List runbooks with filters (teamId, approvalStatus)
- `GET /api/runbooks/:id` - Get runbook details
- `PUT /api/runbooks/:id` - Update runbook
- `DELETE /api/runbooks/:id` - Delete runbook

**Approval Workflow:**
- `POST /api/runbooks/:id/approve` - Approve (PLATFORM_ADMIN only, DRAFT -> APPROVED)
- `POST /api/runbooks/:id/deprecate` - Deprecate (PLATFORM_ADMIN only, APPROVED -> DEPRECATED)

**Version Control:**
- `GET /api/runbooks/:id/versions` - Get version history
- `POST /api/runbooks/:id/rollback` - Rollback to previous version

**Execution:**
- `POST /api/runbooks/:id/execute` - Trigger execution (APPROVED runbooks only)
- `GET /api/runbooks/:id/executions` - List executions for runbook
- `GET /api/runbooks/executions/:executionId` - Get execution details

Per AUTO-07/AUTO-08: parameter validation before execution, definition snapshot on trigger, only APPROVED runbooks can execute.

### Runbook Executor Service (Task 2)

`runbook-executor.service.ts` provides:

1. **Parameter Validation (`validateParameters`):**
   - Dynamically builds Zod schema from JSON Schema-like definition
   - Supports string, number, boolean types with enums
   - Handles required vs optional fields with defaults

2. **Context Building (`buildRunbookContext`):**
   - Extends TemplateContext with runbook-specific fields
   - Adds `params` object for user-provided parameters
   - Handles execution with/without incident context

3. **Execution (`runbookExecutor.execute`):**
   - Re-checks APPROVED status at execution time (pitfall #1)
   - Uses definition snapshot from execution record (pitfall #2)
   - Interpolates payload template using Handlebars
   - Calls `executeWebhookWithRetry` with 3 attempts (AUTO-08)
   - Updates execution status and stores result
   - Full audit trail on success/failure

### BullMQ Queue and Worker (Task 3)

**Queue (`runbook.queue.ts`):**
- `runbookQueue` - Queue for runbook execution jobs
- `scheduleRunbook()` - Add job with execution ID as job ID (idempotency)
- `cancelRunbook()` - Remove pending job
- `getRunbookQueueStats()` - Health check metrics

**Worker (`runbook.worker.ts`):**
- `startRunbookWorker()` - Creates worker with concurrency 5
- `stopRunbookWorker()` - Graceful shutdown
- Processes jobs by calling `runbookExecutor.execute()`
- Event handlers for completion/failure logging

### Application Wiring (Task 4)

- Mounted runbook routes at `/api/runbooks`
- Added `startRunbookWorker()` to background worker startup
- Added `stopRunbookWorker()` to graceful shutdown handler
- Updated startup log message to include runbook worker

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions Made

1. **Reuse executeWebhookWithRetry:** Rather than implementing retry logic from scratch, reuses the proven pattern from `webhook.action.ts` which already handles exponential backoff correctly.

2. **Parameter validation via Zod:** Dynamically builds Zod schema from runbook's JSON Schema definition. Supports string/number/boolean types, enums, required fields, and defaults.

3. **Definition snapshot at trigger time:** Execution record stores complete definition snapshot so runbook changes don't affect in-flight executions.

4. **Re-check APPROVED at execution:** Between queue add and worker processing, runbook status may change. Re-checking prevents executing deprecated/draft runbooks.

## Verification Results

- [x] TypeScript compilation passes for all runbook files
- [x] All routes follow existing workflow.routes.ts patterns
- [x] Executor reuses existing webhook action and template services
- [x] Queue and worker follow established BullMQ patterns
- [x] Routes and worker properly wired into application

## Self-Check: PASSED

Verified all artifacts:
- FOUND: src/routes/runbook.routes.ts
- FOUND: src/services/runbook/runbook-executor.service.ts
- FOUND: src/queues/runbook.queue.ts
- FOUND: src/workers/runbook.worker.ts
- FOUND: 94f5b38 (Routes commit)
- FOUND: dbe85f0 (Executor commit)
- FOUND: 20a5b89 (Queue/worker commit)
- FOUND: 9d7f548 (Wiring commit)
