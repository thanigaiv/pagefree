# OnCall Platform

## What This Is

A production-ready Digital Operations Reliability Platform that orchestrates incident response for 50+ on-call engineers. Features a complete alert pipeline (ingestion, deduplication, routing, escalation), multi-channel notifications (email, SMS, Slack, Teams, push, voice), on-call scheduling with timezone/DST handling, a React dashboard with real-time WebSocket updates, a visual no-code workflow automation builder, auto-computed status pages, and postmortem documentation with action item tracking. Built as a cost-effective PagerDuty replacement with enhanced automation capabilities and simpler integration setup.

## Core Value

Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds, with clear escalation paths. If alerts don't reach the right person at the right time, nothing else matters.

## Requirements

### Validated

**Alert Routing & Escalation:**
- ✓ Receive alerts via webhook API from monitoring tools — v1.0
- ✓ Route alerts to appropriate on-call engineer based on service and schedule — v1.0
- ✓ Escalate to next person if not acknowledged within timeout — v1.0
- ✓ Support multi-level escalation policies — v1.0
- ✓ Deduplicate and group related alerts — v1.0 (serializable transactions prevent race conditions)

**On-Call Management:**
- ✓ Create and manage on-call schedules with rotations — v1.0
- ✓ Support multiple rotation types (daily, weekly, custom) — v1.0 (RRULE-based)
- ✓ Allow schedule overrides and shift swaps — v1.0
- ✓ Calendar integration (sync with Google/Outlook calendars) — v1.0
- ✓ Time zone handling for distributed teams — v1.0 (IANA timezone, DST verified)

**Integrations:**
- ✓ DataDog integration for receiving alerts — v1.0 (P1-P5 severity mapping)
- ✓ New Relic integration for receiving alerts — v1.0
- ✓ Generic webhook receiver for any monitoring tool — v1.0 (with HMAC signature verification)
- ✓ Slack notifications and incident channels — v1.0 (Block Kit messages)
- ✓ Microsoft Teams notifications and incident channels — v1.0 (Adaptive Cards)
- ✓ Bidirectional sync (acknowledge in Slack = acknowledge in platform) — v1.0

**Incident Management:**
- ✓ Web dashboard showing active incidents — v1.0 (with real-time Socket.io updates)
- ✓ Acknowledge incidents (stops escalation) — v1.0 (with optimistic UI)
- ✓ Resolve incidents with resolution notes — v1.0
- ✓ Reassign incidents to different responders — v1.0
- ✓ Add notes and timeline to incidents — v1.0 (via audit events)
- ✓ Incident priority levels — v1.0

**Automation & Workflows:**
- ✓ Define response plays triggered by incident conditions — v1.0
- ✓ Automated actions (create ticket, post to Slack, call webhook) — v1.0 (Jira + Linear + webhook with OAuth2)
- ✓ Conditional workflow logic (if priority = high, then...) — v1.0
- ✓ Template library for common workflows — v1.0 (Ticketing, Communication, Auto-resolution categories)

**Status Pages:**
- ✓ Create private status pages for internal services — v1.0
- ✓ Automatic status updates based on incidents — v1.0 (Redis-cached computation)
- ✓ Manual status updates and maintenance windows — v1.0 (BullMQ-scheduled)
- ✓ Subscriber notifications for status changes — v1.0 (email, webhook, Slack channels)

**Postmortems:**
- ✓ Generate incident timeline from incident data — v1.0 (from audit events)
- ✓ Postmortem template and editor — v1.0 (Markdown editor)
- ✓ Link incidents to postmortems — v1.0 (multi-incident linking)
- ✓ Share postmortems with team — v1.0 (team-based RBAC, publish workflow)
- ✓ Track action items from postmortems — v1.0 (OPEN/IN_PROGRESS/COMPLETED state machine)

**Mobile & Notifications:**
- ✓ Progressive Web App (PWA) for mobile access — v1.0 (offline caching, install prompt)
- ✓ Push notifications for new incidents — v1.0 (VAPID-based web push)
- ✓ Acknowledge/resolve from mobile — v1.0 (swipe gestures, bottom nav)
- ✓ View incident details and timeline on mobile — v1.0
- ✓ Push notification reliability and delivery tracking — v1.0 (NotificationLog per channel)

**User & Team Management:**
- ✓ User authentication and profiles — v1.0 (Okta SSO + break-glass local auth)
- ✓ Team structure (organize users into teams) — v1.0 (flat structure with tags)
- ✓ Role-based access control (admin, responder, observer) — v1.0 (two-level RBAC)
- ✓ User notification preferences (push, email, SMS) — v1.0
- ✓ Audit log of user actions — v1.0 (comprehensive audit middleware)

### Active

**Deferred from v1.0:**
- [ ] Runbook automation (execute scripts on incident trigger) — deferred for security review (sandboxing required)
- [ ] Public status pages for customer-facing services — deferred to v2

### Out of Scope

- Conference call bridges — Not needed for initial rollout
- Service dependency mapping — Complex feature, not critical for v1
- Multi-tenancy — Internal tool, single organization only
- Native iOS/Android apps — PWA sufficient for mobile needs
- Advanced analytics/ML — Basic reporting adequate for v1, requires data accumulation
- Real-time monitoring (building own monitoring) — Integration with existing tools sufficient

## Context

**Current State (post v1.0):**
- v1.0 shipped with ~51,000 lines of TypeScript across 281 source files
- Tech stack: Express.js + Prisma + PostgreSQL (backend), React + Vite + TanStack Query + shadcn/ui (frontend)
- Infrastructure: BullMQ + Redis (queues), Socket.io (real-time), AWS SES/SNS (notifications), Twilio (SMS/voice)
- 10 phases, 85 plans, 360 commits executed in 2 days
- 74/75 v1 requirements satisfied (1 intentionally deferred: AUTO-06)
- All 8 E2E flows verified by integration checker

**Known Tech Debt:**
- AUTO-06 runbook automation deferred for security review
- PWA icons are SVG placeholders (need production PNGs)
- VAPID keys need generation before push notification deployment
- 10 failing Phase 2 webhook tests (regression from Phase 4 changes)
- Socket authentication needs session verification enhancement for production
- No rate limiting on WebSocket events

**Migration Strategy:**
- Phased rollout — migrate team by team to de-risk
- Must coexist with PagerDuty during transition period
- Success measured by: each team fully migrated, PagerDuty turned off by contract renewal

## Constraints

- **Infrastructure**: AWS — leverage RDS, SES, SNS for core services
- **Tech Stack**: React/Node.js/TypeScript — Express.js backend, Vite frontend
- **Mobile**: Progressive Web App (PWA) — one codebase, mobile-optimized, push notification support
- **Scale**: Must support 50+ on-call engineers, high incident volume, 24/7 reliability
- **Migration**: Must allow gradual rollout, team-by-team migration without disrupting operations
- **Integrations**: DataDog, New Relic, Slack, Teams supported at launch

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PWA over native mobile apps | One codebase, faster development, still gets push notifications and offline capability | ✓ Good — PWA with offline caching, push notifications, and swipe gestures working |
| Modern web stack (React/Node.js/TypeScript) | Industry standard, good developer experience, strong ecosystem | ✓ Good — 51K LOC TypeScript, strong type safety across full stack |
| AWS infrastructure (SES, SNS) | Team already on AWS, leverage managed services, reduce operational burden | ✓ Good — SES for email, SNS for push and SMS failover |
| Phased migration approach | De-risk by migrating one team at a time, iterate based on real usage feedback | — Pending (v1.0 built, migration not yet started) |
| Enhanced automation as differentiator | Address key PagerDuty pain point, provide competitive advantage | ✓ Good — Visual workflow builder with React Flow exceeds PagerDuty response plays |
| Prisma ORM with PostgreSQL | Type-safe database access, schema-driven development | ✓ Good — Strong type generation, migration support |
| BullMQ for async job processing | Reliable delayed job execution for escalation timers and notifications | ✓ Good — 5 workers (escalation, notification, workflow, maintenance, status notification) |
| Socket.io for real-time updates | Bidirectional WebSocket communication for dashboard updates | ✓ Good — Real-time incident updates across browser tabs |
| Serializable transactions for deduplication | Prevent duplicate incidents during concurrent alert storms | ✓ Good — Race condition tests passing with P2034 retry |
| RRULE for schedule representation | Calendar standard, handles infinite schedules without pre-computing | ✓ Good — DST transitions handled correctly |
| Circuit breaker for notification failover | Prevent hammering failed providers | ✓ Good — Twilio→SNS failover with 3-failure threshold |
| Audit events as incident timeline | No separate timeline table, reuse audit infrastructure | ✓ Good — Consistent audit trail across all features |

---
*Last updated: 2026-02-08 after v1.0 milestone*
