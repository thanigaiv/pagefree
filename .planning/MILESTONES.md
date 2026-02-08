# Project Milestones: OnCall Platform

## v1.0 MVP (Shipped: 2026-02-08)

**Delivered:** Production-ready incident management platform replacing PagerDuty for 50+ on-call engineers, with full alert pipeline, multi-channel notifications, scheduling, dashboards, automation, status pages, and postmortems.

**Phases completed:** 1-10 (85 plans total)

**Key accomplishments:**
- Full incident pipeline: alert ingestion from DataDog/New Relic → deduplication → routing to on-call → multi-level escalation with configurable timeouts
- Multi-channel notifications (email, SMS, Slack, Teams, push, voice) with at-least-once delivery, Twilio→SNS failover, and bidirectional Slack interaction
- On-call scheduling with RRULE-based rotations, overrides, shift swaps, Google/Outlook calendar sync, and verified DST handling
- React dashboard with Socket.io real-time updates, PWA offline support, mobile swipe gestures, and push notification deep linking
- Visual no-code workflow builder with React Flow, conditional logic, webhook/Jira/Linear actions, and template library
- Status pages with auto-computation from incidents, maintenance windows, subscriber notifications, and postmortem editor with action item tracking

**Stats:**
- 514 files created/modified
- ~51,000 lines of TypeScript (281 source files)
- 10 phases, 85 plans, 360 commits
- 2 days from start to ship (2026-02-06 → 2026-02-08)

**Git range:** `5d2f069` (init) → `9fda7ed` (milestone audit)

**Tech debt carried forward:**
- AUTO-06 (runbook automation) deferred for security review
- PWA icons are SVG placeholders (need production PNGs)
- VAPID keys need generation for push notifications
- 10 failing Phase 2 webhook tests (regression)

**What's next:** v1.1 Service Catalog

---

## v1.1 Service Catalog (Shipped: 2026-02-08)

**Delivered:** Comprehensive service catalog with team ownership, dependency tracking, and service-based alert routing that replaces team-based routing while maintaining backward compatibility.

**Phases completed:** 11-13 (6 plans total)

**Key accomplishments:**
- Service catalog foundation with CRUD operations, team ownership, lifecycle states (ACTIVE/DEPRECATED/ARCHIVED), and optional escalation policy overrides
- Service dependency graph with DFS-based cycle detection, recursive CTE queries, and React Flow + dagre visualization with upstream/downstream views
- Service-based alert routing with three-tier fallback (routing_key → integration default → TeamTag legacy) ensuring zero breaking changes
- Complete service integration UI with service badges on incident details, default service selector in integration forms, and admin dashboard navigation
- Full backward compatibility - legacy TeamTag routing and incidents without service display correctly without errors

**Stats:**
- 39 files modified (+6,256 insertions, -45 deletions)
- ~62,000 lines of TypeScript total (codebase growth: ~11,000 LOC)
- 3 phases, 6 plans, 14 tasks, 17 commits
- Same-day execution (~1.5 hours, 2026-02-08)

**Git range:** `846ec67` (feat: Phase 11-01 Service model) → `98d9078` (fix: Services navigation)

**Requirements satisfied:**
- All 17 v1.1 requirements (SVC-01 through SVC-06, DEP-01 through DEP-06, ROUTE-01 through ROUTE-05)
- Automated verification: 9/9 must-haves verified across 3 phases
- UAT: 6/7 tests passed (1 environmental issue resolved)

**Key decisions:**
- PostgreSQL for dependency graphs (recursive CTEs sufficient, no graph DB needed)
- Service-first routing with TeamTag fallback (backward compatibility)
- Implicit Prisma join table for dependencies (cleaner than explicit model)
- React Flow + dagre for visualization (reused from workflow builder)
- Routing key immutable after creation (prevents breaking integrations)
- ACTIVE-only services in dropdowns (reduced noise)

**Tech debt carried forward:**
- Same as v1.0 (AUTO-06, PWA icons, 10 failing webhook tests)
- No new tech debt incurred in v1.1

**What's next:** Use `/gsd:new-milestone` to define next milestone

---
