# Project Research Summary

**Project:** PageFree OnCall Platform v1.2 - Production Readiness
**Domain:** Incident Management Platform (PagerDuty Alternative)
**Researched:** 2026-02-08
**Confidence:** MEDIUM-HIGH

## Executive Summary

PageFree is a production incident management platform approaching v1.2, which focuses on three key capabilities: runbook automation for pre-approved remediation scripts, partner/contractor status page access, and production hardening (VAPID keys, PWA icons, Socket.IO auth, webhook fixes, rate limiting). The platform has existing infrastructure (v1.0/v1.1) with alert routing, escalation, notifications, and workflows already built.

The recommended approach leverages webhook-based runbook execution (avoiding agent complexity), partner accounts with magic link authentication (simpler than full SSO), and completing existing infrastructure rather than building new systems. The tech stack is modern and appropriate: Node.js 24.x LTS, TypeScript 5.x, Express 5.x, Prisma ORM, PostgreSQL 18.x, Redis 8.x, Socket.IO 4.x, React 19.x with Vite 7.x. All v1.2 features extend existing patterns—runbooks extend workflows, partner pages extend status pages, hardening completes half-implemented services.

The key risks center on backward compatibility during production hardening. Socket.IO auth must validate sessions without breaking existing clients. Rate limiting must protect APIs without disrupting legitimate webhooks. VAPID key implementation must replace placeholders without invalidating existing push subscriptions. Runbook automation must enforce pre-approval security model while integrating seamlessly with existing workflow triggers. All changes must maintain zero-downtime for a platform handling 24/7 incident response.

## Key Findings

### Recommended Stack

The existing stack is production-ready and appropriate for scale. Node.js 24.x LTS provides stability through 2027. Express 5.x is now production-ready with official LTS. Prisma ORM offers excellent TypeScript integration crucial for maintaining type safety across 50+ engineers. Socket.IO 4.x with Redis adapter enables horizontal scaling. BullMQ 5.x provides exactly-once job semantics essential for reliable notification delivery.

**Core technologies already in use:**
- **Node.js 24.x LTS + TypeScript 5.x**: Active LTS, type safety for large teams
- **Express 5.x + Prisma ORM**: Production-ready web framework with type-safe database access
- **PostgreSQL 18.x + Redis 8.x**: ACID compliance for incident data, caching for schedules/sessions
- **Socket.IO 4.x + BullMQ 5.x**: Real-time updates and reliable job processing with retries
- **React 19.x + Vite 7.x**: Modern frontend with fast HMR, TanStack Query for server state
- **Workbox 7.x**: PWA support for offline functionality and push notifications

**Critical additions for v1.2:**
- **web-push library**: Complete VAPID implementation (infrastructure exists, needs proper key usage)
- **Redis-backed rate limiter**: Upgrade from memory-based to distributed (express-rate-limit + ioredis)
- **Session validation**: Connect existing Socket.IO to connect-pg-simple session store

### Expected Features

v1.2 focuses on production readiness, not net-new capabilities. Existing v1.0/v1.1 features (alerts, routing, escalation, notifications, workflows, internal status pages) are out of scope.

**Must have (table stakes for production):**
- **VAPID key configuration**: Web push requires proper keys; current implementation has placeholder
- **PWA manifest icons**: Mobile home screen needs branded 192x192 and 512x512 PNG icons
- **Socket.IO session auth**: Production needs session validation, not token pass-through
- **Webhook signature fixes**: Edge case handling for all supported monitoring integrations
- **API rate limiting**: Production APIs need Redis-backed limits across all endpoints

**Should have (competitive differentiators):**
- **Runbook automation**: Execute pre-approved scripts on incident triggers—PagerDuty requires separate Runner agent
- **Partner status pages**: Authenticated external access—Statuspage charges $300+/month for this
- **Integrated script library**: Curated, versioned runbook scripts with approval workflow
- **Incident-triggered automation**: Workflow executor already handles webhooks/Jira; extend with runbook action

**Defer to v1.3+ (not essential for v1.2):**
- Script approval workflow (admin review before activation)
- Runbook execution callbacks (receive status from external systems)
- Partner invitation flow (email invite with setup wizard)
- Component-level partner access (fine-grained visibility)
- Sandbox script execution (isolated environment—major infrastructure)

### Architecture Approach

Incident management platforms share an event-driven architecture with clear component boundaries: ingestion layer (webhooks, API), processing layer (alert deduplication, routing, escalation), notification layer (job queue with provider adapters), and real-time layer (WebSocket + event bus). PageFree follows this pattern correctly.

**Major components (existing):**
1. **Alert Processing Engine**: De-duplication by fingerprint, enrichment with metadata, routing to on-call teams
2. **Routing & Escalation Engine**: Schedule resolution with caching, multi-level escalation with timeouts, BullMQ-backed state tracking
3. **Notification Dispatcher**: Job queue with retry policies, multiple channels (push, SMS, email, voice), AWS SNS/Twilio integration
4. **Workflow System**: Trigger-based automation (webhooks, Jira, Linear), Handlebars templating, execution audit trail
5. **Real-time Event Bus**: Redis Pub/Sub for state changes, Socket.IO for WebSocket connections, horizontal scaling support
6. **Status Page System**: Public/private pages with single access tokens, component status computation, subscriber notifications

**v1.2 extensions:**
- **Runbook Executor**: New workflow action type, webhook-based execution to external targets (Ansible, SSM), parameter templating from incident context
- **Partner Authentication**: New PartnerUser entity, magic link login (reuse existing notification infrastructure), session-scoped to read-only status page access
- **Production Services**: Complete push service with real VAPID keys, add Socket session validation layer, implement Redis rate limiter middleware

### Critical Pitfalls

Research identified eight critical pitfalls specific to production hardening and runbook automation, plus general incident platform patterns to avoid.

1. **Breaking Socket.IO clients during auth upgrade**: Current clients pass token but don't expect validation errors. Must implement graceful fallback for legacy tokens while adding proper session validation.

2. **VAPID key rollover breaking push subscriptions**: Existing PushSubscription records may have placeholder keys. Must detect and re-register clients, not just replace keys server-side.

3. **Rate limiting disrupting webhook ingestion**: Memory-based login limiter exists. Adding Redis-backed API-wide limits must whitelist verified webhook sources or use separate tier.

4. **Arbitrary script execution security risk**: Runbook automation must enforce pre-approved scripts only. No pasting code at execution time. All scripts reviewed by admin before APPROVED status.

5. **Runbook agent deployment complexity**: Avoid PagerDuty's agent model. Use webhook-based execution to existing tools (Ansible Tower, AWS SSM). PageFree orchestrates, doesn't execute.

6. **Partner page access without audit trail**: Single access token (current) has no user-level tracking. Partner accounts must log access per user for compliance.

7. **Synchronous notification in request path**: Never send notifications in HTTP handlers. Always use BullMQ job queue for delivery with exponential backoff.

8. **No alert deduplication causing incident storms**: Always use deduplication keys (fingerprint, alias). Upsert instead of insert. Increment occurrence count.

## Implications for Roadmap

Based on combined research, v1.2 should be structured into 4 focused phases following a "complete, extend, harden" pattern. Foundation work (Phase 1) completes half-implemented services. Core capabilities (Phase 2) extend existing systems. Integration (Phase 3) connects partner access. Polish (Phase 4) adds refinements post-validation.

### Phase 1: Production Hardening

**Rationale:** Complete half-implemented infrastructure before adding new features. VAPID keys, Socket auth, and rate limiting are prerequisites for reliable production operation. These changes have high risk of breaking existing clients—must validate in isolation before feature work.

**Delivers:** Production-ready push notifications, authenticated WebSocket connections, API rate limiting across all endpoints, fixed webhook signature edge cases, PWA manifest with proper icons.

**Addresses:** All "table stakes" features from FEATURES.md—VAPID keys, PWA icons, Socket session auth, webhook fixes, Redis rate limiting.

**Avoids:** Pitfall #2 (VAPID rollover), Pitfall #3 (rate limiting webhooks), Pitfall #1 (breaking Socket clients). Establishes stability foundation before feature additions.

**Research flag:** SKIP—production hardening uses standard patterns. Socket.IO auth documented, rate limiting is established pattern, VAPID is web standard.

### Phase 2: Runbook Automation Core

**Rationale:** Extends existing workflow system with new action type. Workflow infrastructure (triggers, templating, execution tracking) already exists. Runbook is incremental: add script library model, execution target configuration, new action type in WorkflowExecutor. Lower risk than partner pages because it's internal-only (no auth surface).

**Delivers:** Pre-approved script library with CRUD, execution targets (webhook endpoints), runbook action type in workflows, manual trigger from incident detail page, execution audit trail.

**Addresses:** Competitive differentiators—runbook automation, integrated script library, incident-triggered automation from FEATURES.md.

**Uses:** BullMQ (existing) for execution jobs, Handlebars (existing) for parameter templating, WorkflowExecution (existing) for audit trail, webhook delivery infrastructure (existing).

**Avoids:** Pitfall #4 (arbitrary script execution), Pitfall #5 (agent complexity). Pre-approval model enforced in API, webhook-based execution avoids deployment complexity.

**Research flag:** SKIP—extends existing workflow patterns. No new concepts beyond "webhook action with script metadata."

### Phase 3: Partner Status Page Access

**Rationale:** Adds authentication layer on top of existing status page system. StatusPage model and status computation already exist. Partner access requires new entity (PartnerUser) and auth flow (magic link), but no changes to status computation logic. Isolated risk—only affects new partner users, doesn't impact internal or existing private pages.

**Delivers:** PartnerUser model with status page assignments, magic link authentication (reuse notification infrastructure), partner-scoped session with read-only access, access audit logging, admin partner management UI.

**Addresses:** Partner status pages (differentiator), authenticated access without password complexity.

**Uses:** Magic link infrastructure (existing in notifications), session management (connect-pg-simple existing), audit system (existing AuditEvent model).

**Avoids:** Pitfall #6 (no audit trail), security mistakes from PITFALLS.md (visibility controls, team boundaries). Separate session type prevents privilege escalation.

**Research flag:** NEEDS LIGHT RESEARCH—magic link auth pattern is well-documented, but session scoping for read-only external users may have nuances. Consider `gsd:research-phase` if team unfamiliar with multi-session-type patterns.

### Phase 4: Refinement & Extensions

**Rationale:** Post-validation improvements after core v1.2 ships. Script approval workflow, execution callbacks, partner invitation flow are "nice to have" but not blockers. This phase can be v1.2.1/v1.2.2 patch releases based on user feedback.

**Delivers:** Script approval workflow (DRAFT → APPROVED states with admin review), runbook execution callbacks (webhook endpoint to receive completion status), partner invitation flow (email invite + magic link setup), component-level partner access (fine-grained visibility).

**Addresses:** "Add after validation" items from FEATURES.md.

**Uses:** Existing workflow approval patterns (if any), webhook receiver infrastructure for callbacks, email notification infrastructure for invites.

**Research flag:** SKIP—refinements of Phase 2/3 patterns. Approval workflow is basic state machine, callbacks are reverse webhooks, invitations extend existing email templates.

### Phase Ordering Rationale

- **Hardening first:** Production stability is prerequisite for new features. Socket auth and rate limiting must not break under load. VAPID keys must work reliably before depending on push for runbook notifications.
- **Runbooks before partners:** Runbook automation is lower risk (internal-only, extends existing workflow system). Partner pages require new authentication surface and external user management. Validate workflow extension pattern before adding auth complexity.
- **Partner pages self-contained:** Phase 3 doesn't depend on Phase 2 success. Can be parallelized if team capacity allows, but sequential order reduces risk.
- **Refinements deferred:** Phase 4 items are polish, not core functionality. Ship v1.2.0 without them, iterate based on real usage. Script approval can be "admin manually sets status" initially.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Partner Pages)**: Magic link auth is standard, but session scoping for read-only external users may have nuances. Recommend light `gsd:research-phase` if team hasn't implemented multi-session-type auth before. Focus research on session scope/permissions patterns, not basic magic link implementation.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Hardening)**: Socket.IO authentication, rate limiting, VAPID keys are all documented web standards. Implementation is straightforward extension of existing services.
- **Phase 2 (Runbooks)**: Direct extension of existing workflow system. Webhook delivery, templating, audit logging all exist. New action type follows established pattern.
- **Phase 4 (Refinements)**: All features extend Phase 2/3 patterns. Approval workflow is state machine, callbacks are webhook receivers, invitations are email templates.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via official docs, versions confirmed as current stable, existing codebase analysis validates choices |
| Features | MEDIUM-HIGH | Feature scope clear from project requirements, competitive analysis validates runbook/partner differentiators, table stakes derived from production deployment needs |
| Architecture | HIGH | Codebase inspection confirms standard incident platform patterns, existing workflow/status page systems provide extension points, no architectural changes required |
| Pitfalls | MEDIUM-HIGH | Runbook security model well-documented (PagerDuty, Azure), auth pitfalls common in production upgrades, codebase analysis identifies specific breaking points (Socket token handling, session validation) |

**Overall confidence:** MEDIUM-HIGH

Research is strong on technical implementation (stack, architecture) and industry patterns (runbook automation, partner pages). Lower confidence on operational pitfalls specific to PageFree's existing client base—don't know if production users rely on specific Socket.IO token behavior or webhook ingestion patterns. Mitigation: extensive testing in staging with production-like load before rollout.

### Gaps to Address

**During Phase 1 planning:**
- **Socket.IO client compatibility**: Unknown if existing mobile/web clients have hardcoded token handling. Must audit client code before implementing session validation. Consider feature flag for gradual rollout.
- **Rate limiting thresholds**: No data on current webhook ingestion rates or API call patterns. Must analyze production metrics before setting Redis rate limits. Risk of false positives blocking legitimate sources.
- **VAPID key migration**: Unknown how many clients have active push subscriptions with placeholder keys. Must detect and re-register, but registration UX (permission prompt) may confuse users if triggered without context.

**During Phase 2 planning:**
- **Runbook execution targets**: Unknown which external tools (Ansible Tower, AWS SSM, custom services) users actually need. May need discovery research or user interviews before building execution target abstraction.
- **Script library governance**: Approval workflow deferred to Phase 4, but admin manual approval may not scale. Consider if "auto-approve for specific teams" or "approval delegation" needed even in MVP.

**During Phase 3 planning:**
- **Partner account provisioning**: Unknown if self-service partner signup (rejected as anti-feature) will be requested despite security concerns. May need compromise solution like "partner requests access, admin approves."
- **Status page component mapping**: Existing StatusPageComponent has `serviceIdentifier` string field. Partner pages may expose inconsistency if some components use legacy string match vs Service FK. Consider cleanup migration before Phase 3.

**Validation during Phase 4:**
- **Runbook execution callbacks**: Unknown if external systems (Ansible, SSM) support callback webhooks or if polling required. May need research into specific tool APIs during refinement phase.

## Sources

### Primary (HIGH confidence)
- **STACK.md**: Official documentation verified for Node.js 24.x LTS, Express 5.2.x, PostgreSQL 18.x, Redis 8.x, Socket.IO 4.x, BullMQ 5.x, React 19.x, Vite 7.x, Workbox 7.4.0, Zod 4.3.6 (2026-01-22 release)
- **FEATURES.md**: PagerDuty Automation Actions docs, Atlassian Statuspage pricing/features, Azure Automation Runbooks, Rundeck documentation, MDN Web Push API, web.dev push notifications guide, Socket.IO CORS/auth docs
- **ARCHITECTURE.md**: PagerDuty Events API, Opsgenie Alert API, GoAlert open-source repository analysis, Grafana OnCall repository architecture, AWS SNS patterns, Redis Pub/Sub docs, PostgreSQL docs, BullMQ docs, Socket.IO docs, Twilio webhook patterns
- **PITFALLS.md**: Backstage Software Catalog docs, Opsgenie Service API, Atlassian Compass, Google SRE Workbook, Grafana OnCall integration docs
- **Codebase analysis**: `/Users/tvellore/work/pagefree/prisma/schema.prisma`, `/Users/tvellore/work/pagefree/src/services/workflow/`, `/Users/tvellore/work/pagefree/src/services/statusPage.service.ts`, `/Users/tvellore/work/pagefree/src/services/push.service.ts`, `/Users/tvellore/work/pagefree/src/lib/socket.ts`, `/Users/tvellore/work/pagefree/src/middleware/rateLimiter.ts`

### Secondary (MEDIUM confidence)
- Martin Fowler distributed systems patterns (HeartBeat, Idempotent Receiver)
- AWS EventBridge architecture patterns
- GitHub webhook best practices
- GraphQL subscriptions patterns (Apollo docs)
- PagerDuty Platform marketing pages (runbook automation capabilities)
- Rundeck marketing pages (runbook automation definition)
- Google SRE book on runbooks (concept definitions)

### Tertiary (LOW confidence, needs validation)
- Rate limiting threshold recommendations—must be tuned based on actual production metrics
- Socket.IO client behavior assumptions—requires client code audit
- External tool callback support—needs specific API research during implementation

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
