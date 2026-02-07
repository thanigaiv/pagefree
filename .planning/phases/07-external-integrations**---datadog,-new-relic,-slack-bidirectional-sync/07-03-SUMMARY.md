---
phase: 07-external-integrations
plan: 03
status: complete
completed: 2026-02-07
duration: 2.3 min

# Classification
subsystem: slack-integration
tags: [slack, slash-commands, notifications, admin-tools, provider-identification]

# Dependencies
requires:
  - "07-01: Provider-specific payload normalizers (title prefix source)"
  - "07-02: Test webhook and deliveries API endpoints (integration health data)"
  - "05-01: Slack bidirectional interaction (base slash command infrastructure)"
provides:
  - "/oncall integrations slash command for admin health monitoring"
  - "Provider prefix display in Slack notifications"
affects:
  - "Future admin tooling: Pattern established for integration health checks"
  - "Future notification templates: Provider identification pattern"

# Technical Stack
tech-stack:
  added:
    - "date-fns: Human-readable time formatting for webhook timestamps"
  patterns:
    - "Admin role gating via platformRole === 'PLATFORM_ADMIN'"
    - "24h rolling window for error metrics"
    - "Health status emoji indicators (checkmark/warning)"
    - "Provider prefix detection with fallback logic"

# Key Files
key-files:
  created: []
  modified:
    - path: "src/services/notification/slack-interaction.service.ts"
      changes: "Added /oncall integrations command with admin check, integration health stats, and error count display"
      lines_changed: "+107 -3"
    - path: "src/services/notification/templates/slack.templates.ts"
      changes: "Added getProviderPrefix() helper and provider prefix logic to message builder"
      lines_changed: "+27 -2"

# Decisions Made
decisions:
  - id: "admin-only-integrations"
    what: "Who can view integration status via Slack"
    chosen: "Platform admins only (platformRole === 'PLATFORM_ADMIN')"
    rationale: "Integration health is sensitive operational data, should be restricted to admins"

  - id: "error-window"
    what: "Time window for error count display"
    chosen: "24 hours (rolling window)"
    rationale: "Balance between recent issues and historical context, standard ops metric window"

  - id: "health-indicators"
    what: "Visual status representation in Slack"
    chosen: "Emoji-based: :white_check_mark: for healthy, :warning: for errors"
    rationale: "Clear visual distinction, Slack-native formatting, no color dependency"

  - id: "prefix-double-check"
    what: "Handle potential double-prefixing from normalizer"
    chosen: "Check if title starts with [DataDog] or [New Relic] before adding"
    rationale: "Normalizer in 07-01 already adds prefix, fallback prevents duplicates"

  - id: "time-formatting"
    what: "How to display last webhook time"
    chosen: "date-fns formatDistanceToNow() with addSuffix"
    rationale: "Human-readable relative time ('3 minutes ago'), better UX than timestamps"

  - id: "date-fns-dependency"
    what: "Install date-fns for time formatting"
    chosen: "Add as production dependency"
    rationale: "Deviation Rule 3 (blocking issue) - needed for human-readable time display"

---

# Phase 7 Plan 3: Slack command and title prefix

**One-liner:** /oncall integrations admin command shows integration health with last webhook time and 24h error counts, Slack messages display [DataDog]/[New Relic] provider prefixes with double-prefix prevention

## What Was Built

Added two Slack-facing features for better operational visibility: an admin-only slash command to check integration health from Slack, and provider identification in Slack notification titles.

**Architecture:**
```
Slack /oncall integrations → SlackInteractionService
                                       ↓
                            Check platformRole = ADMIN
                                       ↓
                    Query integrations + webhookDeliveries
                                       ↓
                        Format with date-fns + emojis
                                       ↓
                              Ephemeral response


Incident → Dispatcher → buildSlackIncidentBlocks()
                                 ↓
                        getProviderPrefix(title)
                                 ↓
              Check existing [Provider] prefix
                                 ↓
           [Already prefixed] OR [Add prefix] OR [No prefix]
                                 ↓
                         Display in Slack
```

**Components:**
1. **handleSlashIntegrations()**: Admin-gated command that queries active integrations, fetches last webhook delivery time, calculates 24h error count per integration, formats with health emojis
2. **getProviderPrefix()**: Helper that checks if title already has prefix (from 07-01 normalizer), falls back to service name detection, prevents double-prefixing
3. **date-fns integration**: Human-readable relative time formatting ("3 minutes ago" vs timestamps)

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1. /oncall integrations command | `4c29f2d` | Admin-only slash command showing integration health with last webhook time and 24h error counts |
| 2. Provider prefix in messages | `f446671` | Provider prefix display in Slack notifications with double-prefix prevention |

**Total commits:** 2 task commits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed date-fns dependency**
- **Found during:** Task 1 implementation
- **Issue:** date-fns not installed, TypeScript compilation failed with "Cannot find module 'date-fns'"
- **Fix:** npm install date-fns (added to package.json and package-lock.json)
- **Files modified:** package.json, package-lock.json
- **Commit:** 4c29f2d (included with Task 1)
- **Rationale:** Required for formatDistanceToNow() function, blocking task completion

## Next Phase Readiness

**Ready for 07-04 (Integration health monitoring UI):** ✅
- Health metrics pattern established (last webhook time, 24h error counts)
- Database queries optimized (groupBy for error counts)
- Admin role gating pattern demonstrated

**Ready for 07-05 (Slack sync features):** ✅
- Slash command infrastructure extended with new command
- Help text updated to include integrations command
- Provider prefix logic compatible with bidirectional sync

**Blockers:** None

**Concerns:** None - features are additive and don't affect existing notification flow

## Testing Notes

**TypeScript Compilation:** ✅ No errors specific to changed files (project-wide config warnings ignored)

**Manual Verification Paths:**

1. **/oncall integrations (as admin):**
   - Check user.platformRole === 'PLATFORM_ADMIN'
   - Query prisma.integration.findMany({ where: { isActive: true } })
   - Join webhookDeliveries for last delivery time
   - GroupBy webhookDelivery for 24h error counts
   - Format with date-fns formatDistanceToNow()
   - Display: `:white_check_mark: *DataDog Production* (DataDog) - Last webhook: 3 minutes ago`
   - Display with errors: `:warning: *New Relic Staging* (New Relic) - Last webhook: 1 hour ago - :x: 5 errors (24h)`

2. **/oncall integrations (as non-admin):**
   - Check user.platformRole !== 'PLATFORM_ADMIN'
   - Return: `:lock: Only platform admins can view integration status`

3. **Slack notification with DataDog alert:**
   - Alert title from normalizer: "[DataDog] High CPU Usage"
   - getProviderPrefix() detects existing prefix
   - Returns empty string (no double-prefix)
   - Display: "[DataDog] High CPU Usage"

4. **Slack notification with generic alert:**
   - Alert title: "Database connection timeout"
   - Service: "postgres"
   - getProviderPrefix() finds no prefix, no provider match
   - Returns empty string
   - Display: "Database connection timeout"

**Edge Cases:**
- No active integrations → "No active integrations configured"
- Integration with no webhooks → "Last webhook: never"
- Integration with 0 errors → Only show checkmark, no error count

## Self-Check: PASSED

✅ All modified files exist:
- src/services/notification/slack-interaction.service.ts
- src/services/notification/templates/slack.templates.ts
- package.json (date-fns dependency)

✅ All commits exist:
- 4c29f2d (Task 1)
- f446671 (Task 2)

✅ Deviation documented:
- date-fns installation (Rule 3 - Blocking)
