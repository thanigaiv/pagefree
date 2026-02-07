---
phase: 04-alert-routing-and-deduplication
plan: 02
subsystem: infra
tags: [bullmq, ioredis, redis, job-queue, delayed-jobs]

# Dependency graph
requires:
  - phase: 04-01
    provides: Incident and escalation models in database schema
provides:
  - BullMQ job queue infrastructure with Redis backend
  - Escalation queue with delayed job scheduling for timeout-based escalation
  - Notification queue for multi-channel alerts (Phase 5)
  - Queue health monitoring functions
affects: [04-03-routing-service, 04-04-deduplication, 05-notifications]

# Tech tracking
tech-stack:
  added: [bullmq@5.67.3, ioredis@5.9.2]
  patterns: [singleton-redis-connection, queue-factory-pattern, job-scheduling-with-delay]

key-files:
  created:
    - src/config/redis.ts
    - src/queues/escalation.queue.ts
    - src/queues/notification.queue.ts
    - src/queues/index.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "BullMQ with Redis for reliable delayed job execution that survives server restarts"
  - "Singleton Redis connection pattern to share across queues and workers"
  - "maxRetriesPerRequest: null and enableReadyCheck: false for BullMQ compatibility"
  - "Exponential backoff retry strategy with max 10 retries before stopping"
  - "Escalation jobs use delay parameter for timeout-based execution"
  - "Notification queue has 5 retry attempts (more than escalation due to critical path)"

patterns-established:
  - "Redis connection config: singleton pattern with event logging"
  - "Queue configuration: separate queues for different job types with tailored retry strategies"
  - "Job ID format: incident:{id}:level:{level}:repeat:{repeat} for idempotency"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 04 Plan 02: BullMQ Queue Infrastructure Summary

**BullMQ with Redis backend for reliable escalation timers and notification delivery**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T04:02:36Z
- **Completed:** 2026-02-07T04:06:21Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments
- Installed BullMQ and ioredis dependencies for Redis-backed job queues
- Created Redis connection singleton with BullMQ-compatible settings and reconnect logic
- Built escalation queue with delayed job scheduling for timeout-based escalation
- Built notification queue for Phase 5 multi-channel notification delivery
- Added queue health monitoring functions for operational visibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Install BullMQ and ioredis dependencies** - `70ea31c` (chore)
2. **Task 2: Create Redis connection configuration** - `27f1532` (feat)
3. **Task 3: Create escalation and notification queues** - `2d81ee2` (feat)

**Additional commit:** `a704cb4` (feat) - Schema changes from plan 04-01 that were uncommitted

## Files Created/Modified
- `package.json` - Added bullmq@5.67.3 and ioredis@5.9.2 dependencies
- `src/config/redis.ts` - Redis singleton with BullMQ-compatible configuration and reconnect logic
- `src/queues/escalation.queue.ts` - Escalation queue with scheduleEscalation() and cancelEscalation() functions
- `src/queues/notification.queue.ts` - Notification queue for Phase 5 with queueNotification() function
- `src/queues/index.ts` - Barrel export for queue modules

## Decisions Made

**BullMQ configuration:**
- `maxRetriesPerRequest: null` - Required by BullMQ to handle connection management internally
- `enableReadyCheck: false` - BullMQ requirement to avoid blocking on Redis READY state

**Redis connection strategy:**
- Singleton pattern to share single connection across queues and workers (performance)
- Exponential backoff retry with max 10 retries, max 2s delay
- Connection lifecycle logging (connect, error, close) for operational visibility

**Queue configuration:**
- Escalation queue: 3 retry attempts with 5s exponential backoff
- Notification queue: 5 retry attempts with 2s exponential backoff (critical path)
- Remove completed jobs automatically, keep failed jobs for debugging

**Job scheduling:**
- Escalation job ID format: `incident:{id}:level:{level}:repeat:{repeat}` for idempotency
- Delay parameter for timeout-based execution (timeoutMinutes * 60 * 1000)
- Job cancellation via BullMQ job ID stored in EscalationJob model

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ioredis TypeScript import error**
- **Found during:** Task 2 (Redis connection configuration)
- **Issue:** Import syntax `import Redis from 'ioredis'` caused TS2709 "Cannot use namespace 'Redis' as a type" error
- **Fix:** Changed to `import { Redis } from 'ioredis'` using named export
- **Files modified:** src/config/redis.ts
- **Verification:** TypeScript compilation succeeded
- **Committed in:** 27f1532 (Task 2 commit)

**2. [Rule 1 - Bug] Removed unused Job import from escalation queue**
- **Found during:** Task 3 (Queue creation)
- **Issue:** TS6133 error for unused `Job` import from bullmq
- **Fix:** Removed Job from import statement
- **Files modified:** src/queues/escalation.queue.ts
- **Verification:** TypeScript compilation succeeded
- **Committed in:** 2d81ee2 (Task 3 commit)

**3. [Rule 3 - Blocking] Committed uncommitted schema changes from plan 04-01**
- **Found during:** Task 1 (After package installation)
- **Issue:** prisma/schema.prisma had uncommitted changes from plan 04-01 (incident models)
- **Fix:** Created separate commit for 04-01 schema changes before proceeding with 04-02
- **Files modified:** prisma/schema.prisma
- **Verification:** Git history shows proper commit attribution
- **Committed in:** a704cb4 (separate commit for 04-01)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue)
**Impact on plan:** All auto-fixes necessary for correctness and proper commit hygiene. No scope creep.

## Issues Encountered
- Uncommitted schema changes from 04-01 required separate commit to maintain atomic task commits
- ioredis TypeScript import syntax required named export pattern for ESM compatibility
- Prisma migration auto-generated during build, included in Task 3 commit

## User Setup Required

None - no external service configuration required yet. Redis connection will be configured via environment variables when deploying:
- `REDIS_HOST` (default: localhost)
- `REDIS_PORT` (default: 6379)
- `REDIS_PASSWORD` (optional)

## Next Phase Readiness

**Ready for next phase:**
- BullMQ infrastructure operational
- Escalation queue accepts delayed jobs with proper job ID format
- Notification queue ready for Phase 5 implementation
- Queue health monitoring functions available

**Blockers/concerns:**
- None. Queue infrastructure is ready for use by routing service (04-03).

---
*Phase: 04-alert-routing-and-deduplication*
*Completed: 2026-02-06*

## Self-Check: PASSED
