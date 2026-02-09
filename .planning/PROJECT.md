# OnCall Platform

## What This Is

A production-ready Digital Operations Reliability Platform that orchestrates incident response for 50+ on-call engineers. Features a complete alert pipeline (ingestion, deduplication, routing, escalation) with service-based routing through a comprehensive service catalog, multi-channel notifications (email, SMS, Slack, Teams, push, voice), on-call scheduling with timezone/DST handling, a React dashboard with real-time WebSocket updates, service dependency tracking with visual graphs, a visual no-code workflow automation builder with webhook-based runbook automation, auto-computed status pages with authenticated partner access, and postmortem documentation with action item tracking. Production-hardened with VAPID-based web push, Redis rate limiting, Socket.IO session validation, and WebSocket event throttling. Built as a cost-effective PagerDuty replacement with enhanced automation capabilities (including pre-approved remediation scripts), service ownership clarity, and simpler integration setup.

## Core Value

Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds, with clear escalation paths. If alerts don't reach the right person at the right time, nothing else matters.

## Recent Milestone: v1.2 Production Readiness (Shipped 2026-02-09)

**Goal:** Make the platform production-ready for team migration while adding runbook automation and partner status page access.

**Shipped features:**
- Production hardening (PWA PNG icons, VAPID keys, webhook timestamp validation, Socket.IO session validation, Redis API rate limiting, WebSocket event rate limiting)
- Runbook automation with pre-approved admin-managed scripts, webhook-based execution, BullMQ queue processing, workflow integration, and manual incident triggering
- Partner/contractor authenticated access to status pages via magic link authentication with scoped read-only access

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

**Service Catalog (v1.1):**
- ✓ Create technical services with team ownership and routing keys — v1.1 (with audit logging)
- ✓ Edit service metadata and manage lifecycle states — v1.1 (ACTIVE/DEPRECATED/ARCHIVED)
- ✓ Service directory with search, filter by team/status — v1.1 (React Query with optimistic updates)
- ✓ Service dependency relationships with cycle detection — v1.1 (DFS-based graph validation)
- ✓ Visual dependency graph with upstream/downstream views — v1.1 (React Flow + dagre auto-layout)
- ✓ Alert routing via service_key — v1.1 (three-tier routing with TeamTag fallback)
- ✓ Integration default service configuration — v1.1 (with ACTIVE-only service dropdown)
- ✓ Service escalation policy precedence — v1.1 (service overrides team default)
- ✓ Service display on incident details — v1.1 (conditional rendering for legacy incidents)

**Production Hardening (v1.2):**
- ✓ VAPID keys for web push notifications — v1.2 (web-push library with signature verification)
- ✓ Production-ready PWA icons — v1.2 (PNG assets at 192x192, 512x512, 180x180)
- ✓ Socket.IO session validation — v1.2 (PostgreSQL session store validation, 5-min refresh)
- ✓ Webhook test suite fixes — v1.2 (timestamp validation, 27/27 tests passing)
- ✓ Redis-backed API rate limiting — v1.2 (3-tier: webhook/api/public with graceful degradation)
- ✓ WebSocket event rate limiting — v1.2 (100/min with 80% warning threshold)

**Runbook Automation (v1.2):**
- ✓ Pre-approved runbook script library — v1.2 (approval workflow DRAFT→APPROVED→DEPRECATED)
- ✓ Webhook-based execution infrastructure — v1.2 (BullMQ queue, 3-retry exponential backoff)
- ✓ Workflow builder runbook action nodes — v1.2 (visual workflow integration)
- ✓ Manual runbook triggering from incidents — v1.2 (Run Runbook button with confirmation)

**Partner Status Pages (v1.2):**
- ✓ Partner account creation and management — v1.2 (admin UI with access assignment)
- ✓ Magic link authentication — v1.2 (SHA-256 hashed tokens, 15-min expiry)
- ✓ Scoped read-only status page access — v1.2 (separate partner.sid sessions)
- ✓ Partner audit logging — v1.2 (access events with 90-day retention)

### Active

**Deferred:**
- [ ] Public status pages for customer-facing services — deferred to future milestone

### Out of Scope

- Conference call bridges — Not needed for initial rollout
- Multi-tenancy — Internal tool, single organization only
- Native iOS/Android apps — PWA sufficient for mobile needs
- Advanced analytics/ML — Basic reporting adequate for v1, requires data accumulation
- Real-time monitoring (building own monitoring) — Integration with existing tools sufficient

## Context

**Current State (post v1.2):**
- v1.2 shipped with ~68,000 lines of TypeScript (total codebase)
- Tech stack: Express.js + Prisma + PostgreSQL (backend), React + Vite + TanStack Query + shadcn/ui (frontend)
- Infrastructure: BullMQ + Redis (queues), Socket.io (real-time), AWS SES/SNS (notifications), Twilio (SMS/voice)
- **v1.0:** 10 phases, 85 plans, 360 commits (shipped 2026-02-08)
- **v1.1:** 3 phases, 6 plans, 17 commits (shipped 2026-02-08, same day)
- **v1.2:** 4 phases, 13 plans, 35 commits (shipped 2026-02-09)
- 105/106 total requirements satisfied across v1.0 + v1.1 + v1.2 (1 deferred: public status pages)
- All Phase 2 webhook tests passing (27/27)
- Production-ready: session validation, rate limiting, VAPID keys, PWA icons complete

**Known Tech Debt:**
- None blocking production deployment
- Quick tasks added RunbooksPage (1041 lines) and Partners card (phase 17 followup)

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
| **v1.1 Service Catalog Decisions** | | |
| PostgreSQL for dependency graphs | Recursive CTEs sufficient, avoid graph DB complexity | ✓ Good — DFS cycle detection O(V+E), recursive CTE with depth limit works well |
| Service-first routing with TeamTag fallback | Maintain backward compatibility during migration | ✓ Good — Zero breaking changes, gradual service adoption possible |
| Implicit Prisma join table for dependencies | Simpler than explicit ServiceDependency model | ✓ Good — Clean many-to-many relation, no extra queries needed |
| React Flow + dagre for graph visualization | Library already installed from workflow builder | ✓ Good — Consistent UX, auto-layout works well for service graphs |
| Routing key immutable after creation | Prevent breaking integrations, enforce via UI | ✓ Good — Clear constraint, forces intentional service design |
| ACTIVE-only services in dropdowns | Reduce noise, focus on operational services | ✓ Good — Users only see relevant services in integration config |
| Service escalation policy as optional override | Flexibility without forcing per-service configuration | ✓ Good — Defaults to team policy, allows service-specific escalation when needed |
| **v1.2 Production Hardening Decisions** | | |
| web-push library for VAPID signing | Standard approach, not hand-rolling crypto | ✓ Good — Proper signature verification, secure web push |
| Sharp for SVG-to-PNG icon conversion | Programmatic, reproducible build process | ✓ Good — Icons can be regenerated from source, 192x192/512x512/180x180 |
| Cookie-based Socket.IO auth | withCredentials cleaner than auth token payload | ✓ Good — Automatic cookie transmission, session store validated |
| 5-minute session check interval | Balance freshness with overhead | ✓ Good — Extends session by 24h if within 5min of expiry |
| Redis-backed rate limiting | Distributed state, graceful degradation | ✓ Good — 3-tier (webhook/api/public), falls back on Redis failure |
| In-memory WebSocket rate tracking | Per-connection state, no Redis needed | ✓ Good — 100/min limit with 80% warning, system events exempt |
| BullMQ job ID dashes not colons | BullMQ validation requirement | ✓ Good — incident-id-level-N format works |
| **v1.2 Runbook Automation Decisions** | | |
| z.any() for runbook JSON validation | Follow workflow.service.ts pattern | ✓ Good — Type safety via TypeScript, not Zod runtime |
| Version snapshot on approval | Complete audit trail for all changes | ✓ Good — Prevents execution of unreviewed changes |
| Rollback reverts to DRAFT | Requires re-approval for safety | ✓ Good — No accidental execution of rolled-back versions |
| Reuse executeWebhookWithRetry | Proven pattern from webhook.action.ts | ✓ Good — 3-retry exponential backoff already working |
| Non-blocking runbook scheduling | Returns immediately, executes async | ✓ Good — Workflow executor doesn't wait, BullMQ processes |
| **v1.2 Partner Status Pages Decisions** | | |
| Separate PartnerSession table | Complete isolation from internal users | ✓ Good — partner.sid cookie, different session lifecycle |
| SHA-256 tokenHash for magic links | Never store plaintext tokens | ✓ Good — 15-min expiry, secure passwordless auth |
| Reuse SESSION_SECRET | Same security, avoid additional env var | ✓ Good — Both sessions use same signing key |
| Partner routes before audit middleware | Use partner session, not internal | ✓ Good — Middleware ordering critical for session access |

---
*Last updated: 2026-02-09 after v1.2 milestone completion*
