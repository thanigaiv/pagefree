# Project Research Summary

**Project:** OnCall Platform - Incident Management System
**Domain:** Digital Operations Reliability / On-Call Management
**Researched:** 2026-02-06
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a PagerDuty alternative for a 50-person engineering team, addressing known pain points around automation complexity and integration setup. The research shows this domain requires event-driven architecture with extreme reliability guarantees - missed alerts mean production stays down. The recommended approach uses a monolithic Node.js/TypeScript backend with PostgreSQL and Redis, progressively enhanced from basic alert routing to advanced workflow automation.

The core technical pattern is fire-and-forget ingestion with async processing: accept alerts immediately (202 Accepted), process through job queues (BullMQ), route via cached schedule resolution, and deliver through multi-channel notifications with retry logic. This pattern, verified across PagerDuty, Opsgenie, and open-source platforms like GoAlert, provides the reliability needed for 24/7 operations.

Key risks center on delivery guarantees and timezone handling. The research identifies 8 critical pitfalls that must be addressed in early phases: no delivery guarantee strategy, single point of failure in notifications, timezone/DST bugs, race conditions in deduplication, webhook reliability assumptions, missing escalation on delivery failure, alert fatigue design, and scheduling edge cases. Building delivery tracking, audit trails, and timezone-aware scheduling from day one prevents expensive retrofits later.

## Key Findings

### Recommended Stack

The stack prioritizes proven technologies with strong TypeScript support and AWS-managed services to minimize operational overhead. Node.js 24.x LTS provides the runtime, Express 5.x for the API layer, Prisma ORM for type-safe database access, BullMQ for job queues, and Socket.IO for real-time updates. The architecture separates concerns: API servers handle requests, worker processes manage background jobs (notifications, escalations), and Redis coordinates via pub/sub.

**Core technologies:**
- **Node.js 24.x + TypeScript 5.x** — LTS runtime with end-to-end type safety essential for large teams
- **Express 5.x + Prisma ORM** — Battle-tested API framework with type-safe database layer
- **PostgreSQL 18.x + Redis 8.x** — ACID compliance for incident data integrity, Redis for job queues and caching
- **BullMQ 5.x** — Exactly-once job semantics with retry strategies, critical for alert delivery guarantees
- **Socket.IO 4.x** — Bidirectional real-time for instant alert updates and interactive acknowledgments
- **React 19.x + Vite 7.x** — Modern frontend with PWA capabilities via Workbox 7.x for mobile experience
- **AWS Services** — SNS for push notifications, Lambda for webhook processing, RDS/ElastiCache for managed infrastructure
- **Twilio** — Voice calls and SMS for critical escalation paths

**Key version notes:**
- BullMQ requires Redis 6.2+ for streams; use node-redis 4.x (ioredis explicitly recommends this for new projects)
- Socket.IO 4.x compatible with Express 5.x; use Redis adapter for multi-instance scaling
- Avoid: MongoDB (ACID violations), Bull (maintenance mode), moment.js (deprecated), Create React App (unmaintained)

### Expected Features

Research across PagerDuty, Opsgenie, and Splunk On-Call reveals clear feature tiers. Table stakes are features users assume exist - missing them makes the product feel incomplete. Differentiators address PagerDuty pain points around automation and integration simplicity.

**Must have (table stakes):**
- Alert ingestion with webhooks (Datadog, New Relic, Slack, Teams per requirements)
- On-call scheduling with weekly/daily rotations, timezone support, overrides
- Multi-level escalation policies with timeout configuration
- Multi-channel notifications (email, Slack, Teams, SMS, phone, push)
- Alert deduplication via fingerprinting to prevent spam
- Incident state management (trigger, acknowledge, resolve workflow)
- Mobile PWA with progressive enhancement (push notifications, offline capability)
- User/team management with role-based boundaries
- Incident dashboard with filtering and real-time updates
- Audit log showing who did what when for compliance

**Should have (competitive):**
- Basic workflow automation (simple if-then rules before visual builder) - addresses "PagerDuty automation is limited" pain point
- Alert enrichment from AWS/K8s metadata for faster diagnosis
- Status page integration for stakeholder communication
- Postmortem automation from incident timeline
- MTTR/MTTA analytics to track team performance
- Easy integration setup (one-click, auto-discovery) - addresses "integration setup is cumbersome" pain point

**Defer (v2+):**
- Advanced workflow builder (visual designer for complex automation)
- ML-based noise reduction (requires 6+ months of historical data)
- Incident Command System with defined roles (IC, Ops Lead, Comms Lead per Google SRE)
- Responder recommendations via ML
- Service catalog and dependency modeling
- Multi-region deployment (can start single-region)

**Anti-features to avoid:**
- Real-time everything (use 30-60s polling for dashboards, WebSocket only for critical updates)
- Alert snoozing without escalation (incidents get forgotten)
- Built-in monitoring (scope creep - integrate with existing tools)
- Unlimited alert retention (90-day with archival to S3)
- Complex RBAC initially (team-based access sufficient for 50 people)

### Architecture Approach

Incident management platforms share a common event-driven pattern with clear layer separation. The architecture has five layers: ingestion (webhooks, API), processing (deduplication, enrichment, routing), notification (multi-channel delivery via job queue), persistence (PostgreSQL + Redis), and real-time (WebSocket + event bus). Each layer operates independently, connected via job queues and pub/sub patterns.

**Major components:**

1. **Alert Processing Engine** — Receives alerts, deduplicates by fingerprint (upsert pattern), enriches with metadata, validates structure. Runs as background worker consuming from alert queue. Critical pattern: idempotent processing allows safe retries.

2. **Routing & Escalation Engine** — Resolves current on-call user from schedules (with 1-5 min Redis caching), matches escalation policies, determines notification targets. Tracks escalation state in database, triggers timeouts via scheduled jobs. Must handle edge cases: DST transitions, user deactivation mid-shift, schedule gaps.

3. **Notification Dispatcher** — Fan-out to multiple channels (push, SMS, email, voice, Slack, Teams) via persistent job queue (BullMQ). Each channel has dedicated worker with retry logic (exponential backoff), circuit breakers for failing providers, and delivery confirmation tracking. Critical: never synchronous - always queue-based.

4. **Schedule Resolver** — Calculates current on-call user(s) from rotation rules, timezone conversions, and overrides. Heavily cached (1-5 min TTL keyed by schedule + minute) to handle alert storms. Invalidates cache on schedule changes. Complex logic isolated here to simplify routing.

5. **Real-time Event Bus** — Redis Pub/Sub broadcasts state changes (alert acknowledged, incident resolved) to WebSocket servers, which push updates to connected clients. Decouples API/workers from WebSocket layer. Secondary to push notifications (mobile apps in background can't maintain WebSocket).

**Data flow:** External alert → Webhook (202 Accepted) → Alert Queue → Processing Worker (dedupe, enrich) → Routing Engine (schedule resolver) → Notification Queue → Channel Workers (parallel delivery) → Database (status tracking) → Event Bus → WebSocket → Clients

**Critical patterns:**
- Fire-and-forget ingestion: return 202 immediately, process async
- Idempotent alert processing: use fingerprints/aliases for deduplication
- Job queue for all notifications: BullMQ with retry strategies
- Schedule caching with invalidation: sub-5ms routing under load
- Multi-channel redundancy: push fails → SMS → voice call escalation

### Critical Pitfalls

Research identifies 8 critical pitfalls (system-wide failures if not addressed) and 9 moderate pitfalls (delays/refactoring). These map to specific phases in roadmap planning.

1. **No Delivery Guarantee Strategy** — Alerts sent fire-and-forget without tracking, retry logic, or audit trail. Engineers never get paged, incidents go unnoticed. **Prevention:** Store delivery state (pending, delivered, failed), implement at-least-once semantics with idempotent receivers, retry with exponential backoff, maintain audit log, monitor delivery rates. **Must address in Phase 1.**

2. **Single Point of Failure in Notification Stack** — Dependency on one SMS provider, one push service. Provider outage = all alerts fail exactly when most needed. **Prevention:** Support multiple providers with automatic failover (Twilio → backup), allow users to configure multiple channels (SMS + phone + push), provider health checks trigger failover. **Must address in Phase 2.**

3. **Timezone and DST Naive Scheduling** — Schedules break during DST transitions, wrong person gets paged. **Prevention:** Store ALL timestamps in UTC, convert to user timezone only for display, use timezone-aware libraries (date-fns), explicitly handle DST edge cases (spring forward 2:30 AM doesn't exist, fall back 2:30 AM occurs twice), test across timezones. **Must address in Phase 1 - very hard to fix later.**

4. **Race Conditions in Alert Deduplication** — Concurrent alerts create duplicate incidents or legitimate alerts get dropped. **Prevention:** Use database transactions or distributed locks for deduplication, design fingerprint strategy carefully (include service name, alert type; exclude timestamp, exact values), time-window with proper locking, track suppressed duplicates. **Must address in Phase 2.**

5. **Integration Webhook Reliability Assumptions** — Assume webhooks always arrive exactly once in order. Reality: retries cause duplicates, network delays cause out-of-order delivery, webhooks arrive hours late. **Prevention:** Idempotent webhook endpoints, validate signatures (HMAC), process async (return 200 immediately), handle out-of-order delivery, log all payloads, set timeouts. **Must address in Phase 1.**

6. **No Escalation When Notification Delivery Fails** — Push notification fails silently (expired token), system marks "delivered" even though user never notified. **Prevention:** Track acknowledgment separately from delivery, implement escalation timers (5 min timeout), multi-channel escalation (push → SMS → voice), re-send through different channel on failure, alert on unacknowledged high-severity incidents. **Must address in Phase 2.**

7. **Ignoring Alert Fatigue Design** — Deliver thousands of alerts successfully, but engineers get numb and start ignoring them. **Prevention:** Expose alert volume metrics prominently, implement throttling per service, support priority levels with different channels (P1 = phone, P3 = Slack), provide alert analytics (noisiest services), allow temporary muting with auto-unmute, show acknowledgment rates. **Must address in Phase 3.**

8. **Scheduling Algorithm Edge Cases Not Tested** — Simple rotation works but breaks on: user vacation override during shift, user deactivated mid-rotation, timezone change while on-call, shift transition during active incident, schedule gaps (weekday ends, weekend hasn't started). **Prevention:** Explicit test cases for all edge conditions, define getCurrentOnCallUser() algorithm clearly, show schedule gaps in UI, require explicit handoff during rotation, validate schedule changes don't create gaps. **Must address in Phase 2.**

**Additional moderate pitfalls:**
- No audit trail (Phase 1) - needed for compliance and debugging
- Synchronous notification blocking (Phase 2) - must use job queues before scale
- No channel verification (Phase 2) - verify SMS numbers, push tokens before use
- Hard-coded routing rules (Phase 2) - make data-driven and UI-configurable
- No rate limiting (Phase 3) - prevent alert storms from misconfigured monitoring

## Implications for Roadmap

Based on research findings, the roadmap should follow a dependency-driven structure: foundation (weeks 1-2), core alert flow (weeks 3-4), multi-channel reliability (week 5), advanced escalation (week 6), scheduling (weeks 7-8), real-time UX (weeks 9-10), production hardening (weeks 11-12).

### Phase 1: Foundation & Core Infrastructure (Weeks 1-2)
**Rationale:** Nothing else can be built without data models, job queue infrastructure, and basic ingestion. Early validation of architectural choices (PostgreSQL + Redis + BullMQ) before committing to complex features.

**Delivers:** Database schema (alerts, incidents, users, schedules), BullMQ + Redis job queue setup, basic API structure with auth middleware, webhook ingestion endpoint with async processing, single notification channel (email or push) as proof-of-concept.

**Addresses:**
- Alert ingestion (FEATURES.md - table stakes)
- User management foundation (FEATURES.md - table stakes)
- Basic notification worker (FEATURES.md - table stakes)

**Avoids:**
- Pitfall 1: No delivery guarantee - build audit trail and tracking from start
- Pitfall 3: Timezone bugs - all timestamps in UTC from day one
- Pitfall 5: Webhook reliability - idempotent endpoints with async processing

**Research flag:** Standard patterns - no additional research needed. Well-documented infrastructure setup.

### Phase 2: Complete Alert Flow & Routing (Weeks 3-4)
**Rationale:** Delivers end-to-end value (alert arrives → notification sent) before adding complexity. Validates core architecture under basic load. Dependencies resolved by Phase 1.

**Delivers:** Alert deduplication with fingerprinting (race-safe with transactions), schedule resolver with current on-call calculation (Redis caching), routing engine mapping schedules to users, notification dispatcher enqueueing jobs, basic single-level escalation.

**Addresses:**
- Alert deduplication (FEATURES.md - table stakes)
- On-call scheduling (FEATURES.md - table stakes)
- Escalation policies (FEATURES.md - table stakes)
- Alert routing (FEATURES.md - table stakes)

**Implements:**
- Alert Processing Engine (ARCHITECTURE.md)
- Routing Engine (ARCHITECTURE.md)
- Schedule Resolver with caching (ARCHITECTURE.md critical pattern)

**Avoids:**
- Pitfall 4: Deduplication races - use database transactions/locks
- Pitfall 8: Scheduling edge cases - comprehensive test suite for rotations, DST, gaps

**Research flag:** Needs targeted research for schedule algorithm edge cases (DST transitions, rotation boundaries, international timezone handling). Use `/gsd:research-phase` before implementation.

### Phase 3: Multi-Channel Notifications & Reliability (Week 5)
**Rationale:** Improves reliability of existing flow by expanding channels. Independent workers can be built in parallel. Addresses single-point-of-failure risk.

**Delivers:** SMS integration (Twilio), voice call integration (Twilio Voice), push notifications (AWS SNS → FCM/APNs), webhook delivery (outbound), channel fallback logic (push fails → SMS → voice), notification channel verification flow.

**Addresses:**
- Multi-channel notifications (FEATURES.md - table stakes)
- Mobile app push infrastructure (FEATURES.md - table stakes)

**Uses:**
- Twilio Voice API (STACK.md)
- AWS SNS for push (STACK.md)
- BullMQ workers with retry strategies (STACK.md)

**Avoids:**
- Pitfall 2: Single point of failure - multiple providers with failover
- Pitfall 11: No channel verification - verify before activation

**Research flag:** Needs integration research for Twilio Voice API patterns, AWS SNS platform application setup, FCM/APNs token management. Standard patterns exist but provider-specific details required.

### Phase 4: Advanced Escalation & Acknowledgment (Week 6)
**Rationale:** Requires core flow working. Adds sophistication to routing logic. Essential before production use with real on-call team.

**Delivers:** Multi-level escalation policies (Level 1 → Level 2 → Level 3), timeout tracking with escalation worker (database-backed timers), acknowledgment flow that stops escalation, manual escalation controls, delivery failure detection triggering escalation.

**Addresses:**
- Advanced escalation policies (FEATURES.md - table stakes)
- Incident acknowledgment (FEATURES.md - table stakes)

**Implements:**
- Escalation Manager with state machine (ARCHITECTURE.md)

**Avoids:**
- Pitfall 6: No escalation on delivery failure - timeout-based escalation with acknowledgment tracking
- Pitfall 3: In-memory escalation state (PITFALLS.md anti-pattern) - database-backed timers

**Research flag:** Standard patterns - escalation state machines well-documented in open-source platforms (GoAlert, Grafana OnCall).

### Phase 5: Scheduling & Rotations (Weeks 7-8)
**Rationale:** Needed for real-world usage but can start with manual assignments in earlier phases. Complex logic best tackled after core reliability proven.

**Delivers:** Schedule CRUD API, rotation configuration (daily, weekly, custom patterns), full timezone handling with DST edge case support, schedule overrides (vacations, swaps), rotation worker executing scheduled transitions, schedule validation preventing gaps.

**Addresses:**
- Advanced on-call scheduling (FEATURES.md - table stakes)
- Schedule overrides (FEATURES.md - table stakes)

**Implements:**
- Schedule Resolver complete implementation (ARCHITECTURE.md)
- Background rotation worker (ARCHITECTURE.md)

**Avoids:**
- Pitfall 8: Scheduling edge cases - explicit tests for vacation, deactivation, gaps, DST
- Pitfall 3: Timezone bugs - comprehensive DST transition handling

**Research flag:** Needs deep research on timezone libraries (date-fns-tz vs luxon), DST transition edge cases, iCal/RRULE standards for rotation patterns. Complex domain with subtle bugs.

### Phase 6: Real-Time Updates & Dashboard (Weeks 9-10)
**Rationale:** UX polish after core functionality works. Can demo without real-time initially. Improves operational experience but not mission-critical.

**Delivers:** Socket.IO WebSocket server with Redis adapter (multi-instance), event bus integration (Redis Pub/Sub), React dashboard with TanStack Query, real-time incident updates (acknowledge, resolve events), mobile PWA with Workbox service worker.

**Addresses:**
- Incident dashboard (FEATURES.md - table stakes)
- Mobile PWA (FEATURES.md - table stakes)
- Real-time updates (FEATURES.md - differentiator)

**Implements:**
- Real-time Event Bus (ARCHITECTURE.md)
- WebSocket Server layer (ARCHITECTURE.md)

**Uses:**
- Socket.IO 4.x with Redis adapter (STACK.md)
- React 19.x + Vite 7.x (STACK.md)
- Workbox 7.x for PWA (STACK.md)

**Avoids:**
- Pitfall 4 (anti-pattern): WebSockets for critical delivery - push notifications primary, WebSocket secondary

**Research flag:** Standard patterns - React Query + Socket.IO + PWA extensively documented. Reference Vite PWA plugin documentation.

### Phase 7: Production Hardening & Observability (Weeks 11-12)
**Rationale:** Essential for production but can launch without perfect observability. Tune based on real usage patterns from pilot deployment.

**Delivers:** Heartbeat monitoring system, Prometheus metrics collection (alert delivery latency, escalation times, acknowledgment rates), structured logging (Winston/Pino), circuit breakers for external services, dead letter queue handling, retry/backoff tuning, alert fatigue analytics (volume trends, noisiest services), rate limiting on alert creation.

**Addresses:**
- Alert fatigue design (PITFALLS.md - critical pitfall 7)
- Rate limiting (PITFALLS.md - moderate pitfall 14)
- Monitoring and observability (production requirement)

**Avoids:**
- Pitfall 7: Alert fatigue - expose volume metrics, throttling, priority-based routing
- Pitfall 14: No rate limiting - protect against alert storms

**Research flag:** Standard SRE patterns - Prometheus metrics, circuit breakers, structured logging well-documented. Reference Google SRE Workbook monitoring chapter.

### Phase Ordering Rationale

**Dependency-driven sequencing:**
- Phase 1 provides infrastructure required by all subsequent phases (database, job queue, auth)
- Phase 2 depends on Phase 1 but delivers complete alert flow before adding complexity
- Phase 3 expands Phase 2's single-channel to multi-channel (independent workers)
- Phase 4 requires Phase 2's routing + Phase 3's multi-channel working
- Phase 5 can be deferred because manual on-call assignment works for pilot
- Phase 6 is pure UX enhancement on top of working backend (no blocking dependencies)
- Phase 7 hardens production system with observability after core features validated

**Pitfall mitigation sequencing:**
- Critical pitfalls (1, 3, 5) addressed in Phase 1 - expensive to retrofit
- Critical pitfalls (2, 4, 6, 8) addressed in Phases 2-4 - before production use
- Alert fatigue (pitfall 7) deferred to Phase 7 - needs real usage data to tune

**Feature grouping logic:**
- Phase 1-2: MVP core (alert in → notification out)
- Phase 3-4: Production reliability (multi-channel, escalation)
- Phase 5: Real-world operations (complex schedules)
- Phase 6-7: Scale and polish (UX, observability)

**Validation gates:**
- After Phase 2: Can handle basic incidents end-to-end
- After Phase 4: Ready for pilot deployment with single team
- After Phase 5: Ready for 50-person team with complex rotations
- After Phase 7: Production-hardened for 24/7 operations

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (Schedule algorithm):** Complex domain with DST transitions, rotation boundaries, timezone edge cases. Recommend `/gsd:research-phase` focusing on: date-fns-tz DST handling, iCal RRULE patterns for rotations, schedule gap detection algorithms, test case design for edge conditions.

- **Phase 3 (Multi-channel integrations):** Provider-specific implementation details needed. Recommend `/gsd:research-phase` for: Twilio Voice API call flow (TwiML), AWS SNS platform application setup (APNs certificates vs tokens, FCM API v1 migration), push token lifecycle management (expiration, refresh, multi-device), SMS delivery confirmation webhooks.

- **Phase 5 (Advanced scheduling):** Deep dive into rotation patterns and timezone complexity. Recommend `/gsd:research-phase` for: Luxon vs date-fns-tz comparison for DST, iCalendar RRULE standard implementation, schedule conflict resolution, handoff procedures during active incidents, UI patterns for schedule visualization.

**Phases with standard patterns (skip additional research):**

- **Phase 1 (Foundation):** Express + Prisma + BullMQ setup extensively documented. Stack research (STACK.md) provides installation commands and configuration examples.

- **Phase 4 (Escalation):** State machine patterns well-established. Reference GoAlert and Grafana OnCall open-source implementations for escalation timer logic.

- **Phase 6 (Real-time):** Socket.IO + React Query + PWA standard patterns. Vite PWA plugin handles service worker complexity. TanStack Query documentation comprehensive.

- **Phase 7 (Observability):** SRE patterns extensively documented. Prometheus client libraries, circuit breaker implementations (opossum), structured logging (Pino) all have clear guides.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via official documentation (Node.js 24.x LTS, PostgreSQL 18.x, Redis 8.x, Socket.IO 4.x, BullMQ, Prisma). Specific version compatibility matrix provided. No unverified dependencies. |
| Features | HIGH | Based on official platform documentation (PagerDuty, Opsgenie, Splunk On-Call) and open-source analysis (Grafana OnCall, GoAlert). Clear differentiation between table stakes, differentiators, and anti-features. Competitive analysis comprehensive. |
| Architecture | MEDIUM-HIGH | Verified against multiple production systems (PagerDuty API, Opsgenie, GoAlert repository structure, Grafana OnCall architecture). Architectural patterns documented (idempotent receiver, job queue, event bus) but some implementation details inferred. Project structure follows proven patterns. |
| Pitfalls | MEDIUM | Critical pitfalls backed by SRE resources (Google SRE Workbook on-call chapter, incident management patterns), but specific scenarios (DST edge cases, deduplication races) partially inferred from distributed systems experience. Phase mapping validated against domain complexity. |

**Overall confidence:** MEDIUM-HIGH

Research is comprehensive for stack selection, feature scope, and architectural approach. Confidence is slightly reduced for pitfall specifics (some edge cases inferred) and implementation details (architectural patterns verified but not every component decision validated against production systems).

### Gaps to Address

**Scheduling algorithm DST handling:** Research identifies DST as critical pitfall but doesn't provide specific library recommendation (date-fns-tz vs luxon vs Temporal). **Mitigation:** Conduct targeted research during Phase 5 planning comparing timezone libraries on: DST transition handling quality, bundle size impact (frontend usage), TypeScript support, maintenance status. Test cases should cover spring-forward (non-existent hour) and fall-back (repeated hour) scenarios.

**Notification provider failover implementation:** Research recommends multi-provider setup but doesn't detail failover trigger logic (how to detect provider degradation before complete failure). **Mitigation:** During Phase 3 planning, research circuit breaker patterns (opossum library), provider health check designs (synthetic transactions vs failure rate thresholds), and chaos engineering approaches to test failover paths.

**Alert fingerprinting strategy:** Deduplication identified as critical but optimal fingerprint design (what to include/exclude) depends on monitoring integrations. **Mitigation:** During Phase 2 implementation, analyze actual Datadog/New Relic webhook payloads from requirements doc integrations. Design fingerprint to balance: too broad (legitimate separate incidents deduplicated) vs too narrow (obvious duplicates create spam).

**Mobile push token lifecycle:** Research mentions token expiration and multi-device support but lacks specifics on FCM/APNs token refresh patterns. **Mitigation:** During Phase 3 planning, research: FCM token lifecycle (when tokens invalidate), APNs token vs certificate auth trade-offs, handling app reinstall scenarios, detecting and removing dead tokens (failure threshold before removal).

**Escalation timeout values:** Research suggests 5-minute escalation timeout but optimal values likely vary by severity (P1 vs P3). **Mitigation:** During Phase 4 planning, research industry standards (PagerDuty default timeouts), interview stakeholders for current PagerDuty configuration, design timeout configurability per escalation policy with sensible defaults.

**Alert volume thresholds for fatigue:** Research cites Google SRE recommendation (max 2 incidents per shift) but doesn't provide throttling thresholds. **Mitigation:** During Phase 7 planning, research: Google SRE Workbook specific recommendations, alert fatigue studies, throttling algorithm options (token bucket, sliding window), and implement configurable thresholds with alerting on approach to limits.

## Sources

### Primary (HIGH confidence)
- **Node.js official releases:** https://nodejs.org/en/about/previous-releases - verified Node 24.x LTS until 2027
- **Express.js documentation:** https://expressjs.com - verified Express 5.2.1 current stable, production-ready
- **PostgreSQL official releases:** https://www.postgresql.org - verified PostgreSQL 18.1 release (2025-11-13)
- **Redis documentation:** https://redis.io - verified Redis 8.x current version
- **Socket.IO documentation:** https://socket.io - verified Socket.IO 4.x current stable, Express 5.x compatibility
- **BullMQ documentation:** https://docs.bullmq.io - verified modern successor to Bull, exactly-once semantics
- **Prisma documentation:** https://www.prisma.io - verified 500k+ developers, TypeScript-first ORM
- **Vite documentation:** https://vite.dev - verified Vite 7.3.1 current version
- **TanStack Query documentation:** https://tanstack.com/query/latest - verified v5 current stable
- **Workbox GitHub:** https://github.com/GoogleChrome/workbox - verified Workbox 7.4.0 release (2025-11-19)
- **Zod GitHub:** https://github.com/colinhacks/zod - verified Zod 4.3.6 release (2026-01-22)
- **PagerDuty Platform:** https://www.pagerduty.com/platform/ - feature analysis, Event Orchestration capabilities
- **Atlassian Opsgenie:** https://www.atlassian.com/software/opsgenie/features - competitive features, integration count
- **Splunk On-Call:** https://www.splunk.com/en_us/products/on-call.html - competitive feature analysis
- **Google SRE Workbook - Incident Response:** https://sre.google/workbook/incident-response/ - on-call best practices, alert fatigue thresholds (2 incidents per shift), escalation patterns
- **Twilio Voice API documentation:** https://www.twilio.com/docs/voice - verified voice call capabilities, TwiML patterns

### Secondary (MEDIUM confidence)
- **Grafana OnCall repository:** https://github.com/grafana/oncall - architecture analysis (Python/TypeScript microservices), maintenance status (archiving Mar 2026)
- **GoAlert repository:** Analysis of open-source incident management platform (Go/TypeScript/PostgreSQL architecture), scheduling algorithms
- **Martin Fowler - Distributed Systems Patterns:** Idempotent Receiver pattern, Leader/Followers pattern, HeartBeat pattern
- **Netflix Dispatch:** https://github.com/Netflix/dispatch - incident management patterns
- **Increment Magazine - When the Pager Goes Off:** Manual processes, operational complexity in on-call systems
- **AWS SNS documentation:** https://aws.amazon.com/sns - mobile push notification patterns, retry policies (50 attempts over 6 hours)
- **AWS documentation (RDS, ElastiCache, Lambda, CloudWatch):** Infrastructure patterns for incident management platforms
- **PagerDuty go-pagerduty library:** https://github.com/PagerDuty/go-pagerduty - API breaking changes (v1.5.0), synchronization issues

### Tertiary (LOW confidence, inferred patterns)
- **DST transition edge cases:** Standard scheduling system pitfalls (spring forward non-existent hour, fall back repeated hour) - not directly documented but inferred from datetime complexity
- **Deduplication race conditions:** Specific concurrent alert scenarios inferred from distributed systems experience, not documented in incident management sources
- **Schedule algorithm edge cases:** User deactivation mid-shift, timezone change while on-call, shift transition during incident - inferred from operational complexity, not explicitly documented
- **Notification provider failover:** Circuit breaker patterns and health check designs inferred from SRE best practices, not specific to incident management domain

---
*Research completed: 2026-02-06*
*Ready for roadmap: yes*
