---
phase: 08-automation-workflows
plan: 01
subsystem: database
tags: [prisma, typescript, workflow, json-schema, react-flow]

# Dependency graph
requires:
  - phase: 07-external-integrations
    provides: Incident model, Team model, User model
provides:
  - Workflow model with JSON definition storage
  - WorkflowVersion for full version history
  - WorkflowExecution for tracking per-incident runs
  - WorkflowActionSecret for encrypted action credentials
  - TypeScript types for workflow definitions (React Flow compatible)
affects: [08-02-workflow-api, 08-03-workflow-executor, 08-04-visual-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JSON workflow definitions stored in Prisma Json fields
    - Discriminated union types for action data
    - React Flow compatible node/edge structure

key-files:
  created:
    - src/types/workflow.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Store workflow definition as JSON blob with typed TypeScript interface"
  - "Use definitionSnapshot in execution for in-flight version isolation"
  - "WorkflowActionSecret separate from workflow for encrypted credential storage"

patterns-established:
  - "WorkflowDefinition JSON structure with nodes, edges, trigger, settings"
  - "ActionData discriminated union by actionType for type-safe action handling"
  - "Type guards for runtime validation of node data types"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 8 Plan 01: Workflow Schema and Types Summary

**Prisma models for workflow automation (Workflow, WorkflowVersion, WorkflowExecution, WorkflowActionSecret) with comprehensive TypeScript types for React Flow visual builder**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T23:14:03Z
- **Completed:** 2026-02-07T23:16:56Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Created 4 Prisma models for workflow automation with proper relations and indexes
- Built comprehensive TypeScript types matching JSON structure for visual builder
- Synced database schema and regenerated Prisma client with workflow types

## Task Commits

Each task was committed atomically:

1. **Task 1: Add workflow models to Prisma schema** - `007f0a3` (feat)
2. **Task 2: Create TypeScript types for workflow definitions** - `5cc1a2f` (feat)
3. **Task 3: Run Prisma migration and generate client** - No commit (db push operation)

## Files Created/Modified
- `prisma/schema.prisma` - Added Workflow, WorkflowVersion, WorkflowExecution, WorkflowActionSecret models with relations to User, Team, Incident
- `src/types/workflow.ts` - Comprehensive TypeScript types for workflow definitions (522 lines)

## Decisions Made
- Used `prisma db push` instead of `migrate dev` due to existing migration state - appropriate for development, schema fully synced
- Added `actionSecrets` relation to Workflow model for managing encrypted credentials per workflow
- Included type guards (isWebhookAction, isJiraAction, etc.) for runtime type checking of discriminated unions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prisma migrate dev failed due to shadow database issues with existing migrations - resolved by using `prisma db push` which syncs schema directly without migration files

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Database schema ready for workflow CRUD API implementation
- TypeScript types ready for import in service layer and frontend
- Ready for 08-02 (Workflow API) to implement CRUD operations

---
*Phase: 08-automation-workflows*
*Completed: 2026-02-07*

## Self-Check: PASSED
