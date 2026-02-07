---
phase: 08-automation-workflows
plan: 03
subsystem: workflow-engine
tags: [bullmq, workflow, trigger, executor, queue, worker, notifications]

# Dependency graph
requires:
  - phase: 08-01
    provides: Workflow schema and types (WorkflowDefinition, WorkflowExecution, WorkflowActionSecret)
  - phase: 08-02
    provides: Template interpolation and action executors (webhook, Jira, Linear)
provides:
  - Trigger matching service for event-based workflow activation
  - Sequential workflow executor with stop-on-error and timeout enforcement
  - BullMQ queue and worker for async workflow processing
  - Failure notifications to assignee, creator, and team channel
affects: [08-04-workflow-api, 08-05-visual-builder, 09-dashboard, 10-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Trigger matching with cycle detection (MAX_WORKFLOW_DEPTH=3)
    - Sequential execution with stop-on-first-error
    - State persistence after each action for crash recovery
    - Best-effort failure notifications

key-files:
  created:
    - src/services/workflow/workflow-trigger.service.ts
    - src/services/workflow/workflow-executor.service.ts
    - src/queues/workflow.queue.ts
    - src/workers/workflow.worker.ts
  modified: []

key-decisions:
  - "Simple field matching for conditions (no AND/OR per user decision)"
  - "Sequential execution with stop-on-first-error (per user decision)"
  - "Configurable timeout (1min, 5min, 15min) enforced at workflow level"
  - "Cycle detection at MAX_WORKFLOW_DEPTH=3 to prevent infinite loops"
  - "Per-action timeout = min(30s, remainingTimeout * 0.8) per research"
  - "Failure notifications sent to assignee, creator, and team channel (per user decision)"
  - "State persisted to database after each action (per research pitfall #5)"

patterns-established:
  - "Topological sort for workflow node ordering"
  - "Execution chain tracking for cycle detection"
  - "Serialized node results for JSON storage"
  - "Best-effort notification pattern for workflow failures"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 8 Plan 3: Trigger, Executor, Queue & Worker Summary

**Trigger matching service with cycle detection, sequential executor with timeout enforcement, and BullMQ queue/worker with failure notifications**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T23:20:45Z
- **Completed:** 2026-02-07T23:25:00Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- Trigger matching service finds workflows by team/global scope, trigger type, and condition evaluation
- Sequential workflow executor with stop-on-first-error, configurable timeout (1/5/15min), and state persistence
- BullMQ queue and worker for async processing with concurrency 5 and 100/min rate limit
- Failure notifications sent to incident assignee, workflow creator, and team channel

## Task Commits

Each task was committed atomically:

1. **Task 1: Create trigger matching service** - `4e9210d` (feat)
2. **Task 2: Create workflow executor service** - `aff2d64` (feat)
3. **Task 3: Create BullMQ queue and worker** - `90b4bf1` (feat)

## Files Created/Modified

- `src/services/workflow/workflow-trigger.service.ts` - Event matching and trigger evaluation with cycle detection
- `src/services/workflow/workflow-executor.service.ts` - Workflow orchestration with sequential execution and timeout
- `src/queues/workflow.queue.ts` - BullMQ queue for workflow jobs with execution chain
- `src/workers/workflow.worker.ts` - Worker processing jobs with failure notifications

## Decisions Made

- **Simple field matching:** Conditions use simple equality (field === value), no AND/OR operators per user decision
- **Sequential execution:** Actions run one at a time, stop on first error per user decision
- **Cycle detection:** MAX_WORKFLOW_DEPTH=3 prevents infinite workflow loops (per research pitfall #2)
- **Per-action timeout:** Each action gets min(30s, remainingTimeout * 0.8) to leave headroom (per research pitfall #4)
- **State persistence:** Execution state saved to database after each action for crash recovery (per research pitfall #5)
- **Best-effort notifications:** Failure notifications don't fail the job if send fails

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Trigger matching, executor, queue, and worker are ready for API integration
- Next plan (08-04) can expose workflow CRUD and trigger endpoints
- Visual builder (08-05) can leverage executor for test mode

## Self-Check: PASSED

---
*Phase: 08-automation-workflows*
*Completed: 2026-02-07*
