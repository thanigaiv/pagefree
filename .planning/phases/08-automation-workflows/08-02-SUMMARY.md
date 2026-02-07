---
phase: 08-automation-workflows
plan: 02
subsystem: workflow
tags: [handlebars, linear-sdk, jira-api, webhook, template-interpolation]

# Dependency graph
requires:
  - phase: 08-01
    provides: Workflow types and database schema
provides:
  - Template interpolation service with {{variable}} syntax
  - Webhook action executor with Bearer/Basic/OAuth2/custom auth
  - Jira ticket creation action with REST API v3
  - Linear issue creation action with official SDK
  - Ticket URL storage in incident metadata
affects: [08-03, 08-04, 08-05, 08-06]

# Tech tracking
tech-stack:
  added: [handlebars@4.7.8, @linear/sdk@74.0.0]
  patterns: [Handlebars safe environment, OAuth2 client credentials flow, action executor pattern]

key-files:
  created:
    - src/services/workflow/template.service.ts
    - src/services/actions/webhook.action.ts
    - src/services/actions/jira.action.ts
    - src/services/actions/linear.action.ts
  modified: []

key-decisions:
  - "Safe Handlebars environment with whitelisted helpers only (no eval/exec)"
  - "OAuth2 tokens cached for 1 minute to reduce token requests"
  - "Webhook response bodies truncated to 1000 chars for storage"
  - "Ticket metadata stored in alert.metadata.tickets array"

patterns-established:
  - "Action executor pattern: async function returning result object with success/error"
  - "Template context building from incident data"
  - "Retry wrapper with exponential backoff for external API calls"

# Metrics
duration: 4min
completed: 2026-02-07
---

# Phase 08 Plan 02: Template and Action Executors Summary

**Handlebars template interpolation service and action executors for webhooks, Jira, and Linear with full auth support**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-07T23:14:18Z
- **Completed:** 2026-02-07T23:18:16Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments
- Template service with safe {{variable}} interpolation using sandboxed Handlebars
- Webhook executor supporting POST/PUT/PATCH with 4 authentication methods
- Jira ticket creation using REST API v3 with Atlassian Document Format
- Linear issue creation using official TypeScript SDK
- All actions store ticket URLs in incident metadata for timeline visibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create template service** - `121d0f0` (feat)
2. **Task 2: Create webhook action executor** - `f0290c1` (feat)
3. **Task 3: Create Jira and Linear action executors** - `6c31e07` (feat)

## Files Created

- `src/services/workflow/template.service.ts` - Handlebars-based template interpolation with safe helpers
- `src/services/actions/webhook.action.ts` - HTTP webhook executor with Bearer/Basic/OAuth2/custom auth
- `src/services/actions/jira.action.ts` - Jira REST API v3 ticket creation
- `src/services/actions/linear.action.ts` - Linear SDK issue creation

## Decisions Made

1. **Safe Handlebars environment** - Created sandboxed environment with only safe helpers (uppercase, lowercase, json, shortId, dateFormat). No eval/exec to prevent template injection.

2. **OAuth2 token caching** - Cached tokens for 1 minute with 5-second buffer before expiry to reduce token endpoint requests.

3. **Response truncation** - Webhook response bodies truncated to 1000 characters for storage efficiency.

4. **Ticket metadata storage** - Tickets stored in alert.metadata.tickets array, allowing multiple tickets per incident and preserving existing metadata.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **@types/handlebars conflict** - Initial install of @types/handlebars conflicted with handlebars' built-in types. Removed @types/handlebars as handlebars@4.7.8 includes its own TypeScript definitions.

2. **Prisma JSON type casting** - Required double cast (`as unknown as Prisma.InputJsonValue`) for metadata updates. Followed existing pattern from audit.service.ts.

## User Setup Required

None - no external service configuration required. Jira and Linear credentials are provided at runtime when workflows are executed.

## Next Phase Readiness

- Template service ready for workflow executor integration
- Action executors ready to be called from workflow jobs
- Need workflow executor service (08-03) to orchestrate action execution
- Need workflow trigger service (08-04) to match incidents to workflows

---
*Phase: 08-automation-workflows*
*Completed: 2026-02-07*

## Self-Check: PASSED
