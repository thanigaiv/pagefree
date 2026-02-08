---
phase: 09-status-pages
plan: 03
subsystem: api
tags: [bullmq, maintenance, status-incidents, scheduling, workers]

# Dependency graph
requires:
  - phase: 09-01
    provides: StatusPage, MaintenanceWindow, StatusIncident Prisma models and TypeScript types
  - phase: 02-alert-ingestion
    provides: BullMQ queue/worker patterns from escalation system
provides:
  - MaintenanceService for scheduling and managing maintenance windows
  - BullMQ maintenance queue with scheduled start/end jobs
  - Maintenance worker to process scheduled maintenance transitions
  - StatusIncidentService for public-facing incident management with updates array
affects: [09-status-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - BullMQ queue for scheduled future actions with delay
    - Service singleton pattern for maintenance and status incidents
    - JSON array updates with timestamp-status-message structure

key-files:
  created:
    - src/queues/maintenance.queue.ts
    - src/services/maintenance.service.ts
    - src/workers/maintenance.worker.ts
    - src/services/statusIncident.service.ts
  modified: []

key-decisions:
  - "MaintenanceJobData uses action field ('start' | 'end') for job type"
  - "StatusIncident updates stored as JSON array with StatusUpdate interface"
  - "Maintenance window component status update is simplified - full status computation deferred to statusComputation service"

patterns-established:
  - "scheduleMaintenanceJobs() returns job IDs for tracking"
  - "cancelMaintenanceJobs() removes by predictable job ID pattern"
  - "StatusIncident updates are append-only with timestamps"

# Metrics
duration: 5 min
completed: 2026-02-08
---

# Phase 9 Plan 03: Maintenance & Status Incidents Summary

**BullMQ maintenance queue with scheduled start/end jobs, MaintenanceService for CRUD and scheduling, maintenance worker for job processing, and StatusIncidentService for public-facing incident updates**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T00:26:30Z
- **Completed:** 2026-02-08T00:31:15Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- BullMQ maintenance queue schedules delayed jobs for future maintenance start/end times
- MaintenanceService handles full lifecycle: create, update, cancel, start, complete
- Maintenance worker processes jobs and triggers component status updates
- StatusIncidentService manages public-facing incidents with timestamped updates array
- Maintenance window times can be rescheduled with automatic job rescheduling

## Task Commits

Each task was committed atomically:

1. **Task 1: Create maintenance queue** - `af424a1` (feat)
2. **Task 2: Create maintenance service** - `01551dc` (feat)
3. **Task 3: Create maintenance worker and status incident service** - `a579c07` (feat)

## Files Created

- `src/queues/maintenance.queue.ts` - BullMQ queue with scheduleMaintenanceJobs() and cancelMaintenanceJobs()
- `src/services/maintenance.service.ts` - MaintenanceService singleton with create/update/cancel/start/complete operations
- `src/workers/maintenance.worker.ts` - Worker processes maintenance-action jobs, calls maintenanceService
- `src/services/statusIncident.service.ts` - StatusIncidentService for public incident management with updates timeline

## Decisions Made

1. **Job ID pattern** - Used `maintenance:{id}:start` and `maintenance:{id}:end` pattern for predictable job lookup/cancellation
2. **Simplified component status updates** - During maintenance start/end, directly set component status (UNDER_MAINTENANCE/OPERATIONAL) rather than full recomputation - statusComputation service handles complex cases
3. **StatusUpdate JSON array** - Updates stored as JSON array with timestamp/status/message, appended on each update

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Maintenance windows can be scheduled with automatic start/end transitions
- Status incidents can be created and updated with timeline
- Ready for 09-04: API routes for status page management
- StatusComputationService (from 09-02) integrates with maintenance for status computation

---
*Phase: 09-status-pages*
*Completed: 2026-02-08*

## Self-Check: PASSED

- [x] src/queues/maintenance.queue.ts exists
- [x] src/services/maintenance.service.ts exists
- [x] src/workers/maintenance.worker.ts exists
- [x] src/services/statusIncident.service.ts exists
- [x] Commit af424a1 exists
- [x] Commit 01551dc exists
- [x] Commit a579c07 exists
- [x] All files pass TypeScript compilation
