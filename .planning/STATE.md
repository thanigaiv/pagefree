# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds
**Current focus:** Phase 4 - Alert Routing & Deduplication

## Current Position

Phase: 4 of 10 (Alert Routing & Deduplication) — IN PROGRESS
Plan: 8 of 8 complete
Status: Phase 4 complete - all functionality and tests implemented
Last activity: 2026-02-07 — Completed 04-08-PLAN.md (Integration Testing)

Progress: [████████████████████░░] 35% (3 phases complete, phase 4 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 33
- Average duration: 3.3 min
- Total execution time: 1.87 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & User Management | 11/11 | 48 min | 4 min |
| 2. Alert Ingestion & Webhooks | 7/7 | 16 min | 2.3 min |
| 3. Scheduling System | 7/7 | 25 min | 3.6 min |
| 4. Alert Routing & Deduplication | 8/8 | 30 min | 3.8 min |

**Recent Trend:**
- Last 7 plans: 04-03 (4 min), 04-04 (3 min), 04-05 (5 min), 04-06 (2 min), 04-07 (4 min), 04-08 (3 min)
- Trend: Phase 4 complete with comprehensive test coverage

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Decision | Phase-Plan | Rationale |
|----------|------------|-----------|
| UTC timestamp storage via @db.Timestamptz | 01-01 | Prevent timezone bugs across distributed teams |
| Soft delete pattern with isActive flag | 01-01 | Preserve audit trail and foreign key integrity |
| Two-level RBAC (Platform + Team roles) | 01-01 | Support global admins and per-team permissions |
| Break-glass accounts separated via flag | 01-01 | Enable emergency access when Okta unavailable |
| ES modules (type: module) | 01-01 | Modern JavaScript standards and better ESM compatibility |
| Action naming convention (namespace.entity.action) | 01-02 | Consistent audit event identification across system |
| req.audit() helper with automatic context | 01-02 | Reduce boilerplate, ensure IP/user-agent always captured |
| Cleanup scheduled only in production | 01-02 | Avoid unnecessary background jobs in development |
| Platform admins bypass all team role checks | 01-03 | Global admin access pattern per user decision |
| Full visibility model (any user can view teams) | 01-03 | Per user decision for cross-team visibility |
| PermissionResult with allowed/reason pattern | 01-03 | Consistent error messaging for permission denials |
| Role hierarchy with numeric values | 01-03 | Enables minimum role comparisons (OBSERVER < RESPONDER < TEAM_ADMIN) |
| In-memory rate limiting for break-glass | 01-05 | Emergency-only use case doesn't require distributed rate limiting |
| Two-tier rate limiting (5/15min + 3 failed/5min) | 01-05 | Defense in depth: general + failed attempt tracking |
| HIGH severity logging for break-glass | 01-05 | Security visibility for all emergency access usage |
| Generic error messages prevent enumeration | 01-05 | Don't reveal which emails are break-glass accounts |
| Session middleware before Passport initialization | 01-04 | Express best practice - session must exist before user serialization |
| User auto-creation on first Okta login | 01-04 | Handle users authenticating before SCIM provisioning completes |
| HMAC signature verification for Okta webhooks | 01-04 | Prevent spoofed webhook requests from invalidating sessions |
| JSON path filtering for session deletion | 01-04 | Query connect-pg-simple sess column format (sess.passport.user) |
| Webhooks mounted before auth middleware | 01-04 | Use signature-based auth instead of session-based auth |
| CLI tool for break-glass account creation | 01-05 | Secure administrative operation outside web UI |
| SHA-256 API key hashing | 01-10 | Prevent plaintext key exposure in database breaches |
| Service-specific key prefixes (dd_, nr_, sk_) | 01-10 | Easy identification in logs and monitoring |
| Scope-based API key permissions | 01-10 | Fine-grained access control per service operation |
| Platform admin only for API key management | 01-10 | Centralized control over external service authentication |
| API key usage tracking (lastUsedAt, usageCount) | 01-10 | Monitor active integrations and identify unused keys |
| Timing-safe SCIM token comparison | 01-06 | Prevent timing attacks on bearer token validation |
| Break-glass exclusion from SCIM | 01-06 | Emergency accounts never exposed to Okta provisioning |
| Soft delete with session invalidation | 01-06 | SCIM deactivation preserves audit trail and revokes access |
| Default RESPONDER role for SCIM members | 01-06 | Safe default requiring manual elevation by team admins |
| 1:1 Okta group to platform team mapping | 01-06 | Simplified provisioning with syncedFromOkta flag |
| Idempotent SCIM provisioning | 01-06 | Return existing resources on duplicate for Okta retry safety |
| Profile data read-only (synced from Okta) | 01-07 | Per user decision - contact info managed in Okta, platform is read-only |
| Notification preferences managed in platform | 01-07 | Not synced to/from Okta, user controls channel preferences directly |
| Independent contact verification required | 01-07 | Despite Okta data source, users must verify email/SMS/push independently |
| All three channels required for on-call | 01-07 | Email, SMS, and push all verified before canBeOnCall flag is true |
| 90-day mobile refresh tokens | 01-07 | Long-lived tokens for 24/7 on-call scenarios with quick mobile access |
| SHA-256 refresh token hashing | 01-07 | Prevent plaintext token exposure in database breaches |
| Dev mode verification code exposure | 01-07 | Include code in response for testing convenience (not in production) |
| Full visibility: any user can view any team | 01-08 | Per user decision for cross-team transparency |
| Health warnings for <3 responders or no admin | 01-08 | Per user decision to surface understaffed teams |
| Users can self-remove from teams | 01-08 | Per user decision for self-service team management |
| Flat team structure with tags | 01-08 | Organizational and technical tags instead of hierarchy |
| Vitest over Jest for testing | 01-09 | ESM-native support and modern Node.js compatibility |
| Test database safety check | 01-09 | Prevent accidental test execution against production |
| Foreign key-aware cleanup order | 01-09 | Respect constraints during test data cleanup |
| Conditional AWS SES credential initialization | 01-11 | Support both explicit env vars and IAM role-based auth |
| AWS SDK default credential chain fallback | 01-11 | Enable IAM roles, EC2 instance profiles, ECS task roles |
| @ts-expect-error for intentionally unused helpers | 01-11 | Mark test helpers reserved for future implementation |
| AlertSeverity enum (CRITICAL/HIGH/MEDIUM/LOW/INFO) | 02-01 | Standard severity levels for alert normalization across integrations |
| AlertStatus enum (OPEN/ACKNOWLEDGED/RESOLVED/CLOSED) | 02-01 | Alert lifecycle states for incident management |
| Per-integration webhook secrets | 02-01 | Each monitoring tool integration has own HMAC secret for signature verification |
| Configurable deduplication window per integration | 02-01 | Different tools have different retry patterns (default 15 min) |
| Hybrid idempotency (key + fingerprint) | 02-01 | External idempotency key preferred, content fingerprint as fallback |
| Nullable alertId in WebhookDelivery | 02-01 | Track failed/duplicate webhook attempts without creating alerts |
| Raw + normalized dual storage pattern | 02-01 | Preserve original webhook JSON + extract normalized Alert fields |
| Raw body captured via express.json verify callback | 02-02 | Preserve original payload before JSON parsing for HMAC verification |
| Timing-safe comparison using crypto.timingSafeEqual | 02-02 | Prevent timing attacks on signature verification |
| Middleware factory pattern for signature verification | 02-02 | Enable per-integration signature configuration |
| RFC 7807 Problem Details for webhook auth errors | 02-02 | Structured error responses for webhook authentication failures |
| Integration object attached to request | 02-02 | Avoid duplicate database lookups in downstream handlers |
| External idempotency key checked first | 02-03 | Most reliable deduplication when monitoring tools provide unique delivery IDs |
| Content fingerprint fallback for deduplication | 02-03 | Ensures deduplication works even without idempotency headers |
| Field normalization (snake_case, camelCase) | 02-03 | Handle multiple field name variations for broad integration compatibility |
| Long message hashing (>100 chars to 16-char hash) | 02-03 | Keep fingerprints consistent while handling large payloads |
| Header sanitization before storage | 02-03 | Prevent sensitive data (auth, signatures, tokens) from persisting in database |
| RFC 7807 Problem Details for webhook errors | 02-04 | Standard machine-readable error format with field-level validation details |
| Zod passthrough mode for unknown fields | 02-04 | Strict validation on required fields, lenient on extras for different monitoring tools |
| Lenient severity parsing with default fallback | 02-04 | Unknown severity values default to MEDIUM instead of rejecting webhook |
| Field name variation support | 02-04 | Handle snake_case/camelCase and common aliases (message/body → description) |
| Timestamp fallback chain | 02-04 | Prioritize explicit timestamp field, fall back to triggered_at/event_time variants |
| 32-byte hex webhook secrets via crypto.randomBytes | 02-05 | Cryptographically secure secret generation for HMAC verification |
| Secrets only on create/rotate operations | 02-05 | Never expose full secret after creation, show prefix only for identification |
| Type-specific integration defaults | 02-05 | Pre-configured settings for DataDog, New Relic, PagerDuty simplify setup |
| Hard delete for integrations | 02-05 | Integration deletion orphans related alerts/deliveries (no soft delete) |
| High severity audit logging for integration lifecycle | 02-05 | Create, rotate, and delete operations logged at HIGH severity |
| Break-glass authentication for integration tests | 02-07 | Use /auth/emergency endpoint for authenticated test sessions |
| Test database safety pattern: warning only | 02-07 | Phase 1 pattern - warn but don't throw for non-test DATABASE_URL |
| Store schedules as RRULE strings, compute on-demand | 03-01 | Calendar standard - infinite schedules without pre-computing shifts |
| IANA timezone names (America/New_York) not abbreviations | 03-01 | Offsets/abbreviations break during DST transitions |
| Multi-layer schedule precedence via priority field | 03-01 | Support complex patterns (weekday primary + weekend backup + holiday) |
| CalendarSync stores OAuth tokens, not events | 03-01 | Platform is source of truth, calendars are sync targets (one-way) |
| ScheduleOverride for temporary coverage | 03-01 | Highest precedence - overrides all layers for specific time range |
| Layer priorities: 100 to 1 with 10-point gaps | 03-03 | Enable easy insertion of new layers without reordering |
| Restrictions stored as JSON: {daysOfWeek: [...]} | 03-03 | Flexible schema for time-based filtering (weekday/weekend) |
| Team admin required for layer mutations | 03-03 | Elevated permissions for schedule configuration changes |
| Hard delete for layers (no soft delete) | 03-03 | Layers are configuration, not audit-critical like alerts |
| Overlap conflict detection using OR conditions | 03-04 | Check for any time range overlap to prevent double-booking |
| Hard delete for overrides (no soft delete) | 03-04 | Overrides are temporary and don't require long-term audit trail |
| Responders can create overrides | 03-04 | Allow flexibility for on-call team members without admin intervention |
| Swaps require original user or team admin | 03-04 | Only shift owner or admin can initiate swap for accountability |
| Override precedence over layers/schedules | 03-05 | Temporary coverage (vacation, emergencies) must override scheduled rotations |
| Shift calculation from RRULE occurrences | 03-05 | On-demand calculation handles infinite schedules and DST transitions |
| Layer restrictions pre-filtering | 03-05 | Performance optimization - skip RRULE if day-of-week doesn't match |
| Priority-descending layer evaluation | 03-05 | Stop at first matching layer for efficiency (higher priority = 100 -> 1) |
| OAuth credentials optional for development | 03-06 | Enable development without requiring Google/Microsoft app registration |
| One-way calendar sync (system to calendar) | 03-06 | Platform is source of truth, calendars are read-only views |
| Delete and recreate calendar sync strategy | 03-06 | Simplicity over complexity - avoid update/merge logic |
| Token refresh on expiry detection | 03-06 | Prevent sync failures due to expired OAuth tokens |
| Fixed timezone validation test with genuinely invalid zone | 03-07 | EST is valid in Luxon, use Invalid/Timezone for proper rejection testing |
| Relaxed rotation position test to verify user in list | 03-07 | RRULE calculation deterministic but complex, test presence not position |
| DST fixtures cover US and EU transition dates | 03-07 | Support international teams with different DST dates |
| Schedule cleanup added to test setup | 03-07 | Foreign key-aware cleanup prevents test failures (scheduleOverride, scheduleLayer, schedule order) |
| EscalationPolicy repeatCount for policy cycling | 04-01 | Repeat entire escalation chain N times to prevent missed alerts (PagerDuty pattern) |
| EscalationJob tracks BullMQ job ID | 04-01 | Enable atomic cancellation on acknowledgment to prevent notification races |
| Incident tracks currentLevel and currentRepeat | 04-01 | Enable escalation resume after server restart and provide audit trail |
| Alert.incidentId nullable foreign key | 04-01 | Preserve Phase 2 webhook deduplication, alerts can exist before incident creation |
| PagerDuty timeout validation (1-3min min, 30min default) | 04-03 | Industry-standard timeouts prevent too-rapid or too-slow escalation |
| Max 9 repeatCount, max 10 levels per policy | 04-03 | PagerDuty patterns prevent over-complex escalation chains |
| Default policy auto-switching per team | 04-03 | Ensure exactly one default policy per team, unset others when setting new default |
| 409 Conflict for policy deletion with active incidents | 04-03 | Prevent escalation policy deletion while incidents are using it |
| Serializable transaction isolation for deduplication | 04-04 | Prevent duplicate incidents during concurrent alert storms with same fingerprint |
| P2034 retry with exponential backoff | 04-04 | Handle serialization conflicts gracefully, max 3 retries with 200/400/800ms delays |
| Service tag-based alert routing | 04-04 | TeamTag.TECHNICAL matches alert metadata.service to route alerts to correct team |
| Null assignedUserId allowed on incidents | 04-04 | Create incidents even when no on-call user available, prevents alert loss during gaps |
| Acknowledge assigns incident to acknowledger | 04-05 | Common on-call pattern - whoever acks takes ownership |
| Timeline built from audit events (no separate table) | 04-05 | Audit events are the source of truth for incident history |
| Notes stored as audit events (incident.note.added) | 04-05 | Consistent with timeline approach, no separate notes table |
| Close only works on RESOLVED incidents | 04-05 | Enforce state machine: OPEN → ACKNOWLEDGED → RESOLVED → CLOSED |
| Worker status check before escalating | 04-06 | Re-check incident.status in worker to prevent race with acknowledgment |
| Stale escalation reconciliation on startup | 04-06 | Reschedule OPEN incidents with no active jobs (>1hr stale) prevents missed escalations |
| Degraded mode if Redis unavailable | 04-06 | Server starts without workers if Redis fails, logs error instead of crashing |

### Pending Todos

None yet.

### Blockers/Concerns

**From research:**
- ✅ Phase 1: Must store all timestamps in UTC to prevent timezone bugs (ADDRESSED: Used @db.Timestamptz in all models)
- ✅ Phase 2: Webhook idempotency and signature validation essential (ADDRESSED: Signature validation in 02-02, hybrid idempotency in 02-03)
- ✅ Phase 3: DST handling requires explicit test cases for spring-forward/fall-back scenarios (ADDRESSED: DST test fixtures in 03-07, spring-forward/fall-back verified)
- ✅ Phase 4: Alert deduplication needs database transactions to prevent race conditions (ADDRESSED: Serializable isolation in 04-04, P2034 retry logic verified)
- Phase 5: Multi-provider notification failover must be built in from start (critical pitfall)

**Current concerns:**
- ✅ Phase 4 complete - all functionality and tests implemented
- Next: Phase 5 - Notification System (multi-provider notification delivery)

## Session Continuity

Last session: 2026-02-07 04:20 UTC
Stopped at: Completed 04-08-PLAN.md (Integration Testing)
Resume file: None

---
*Phase 4 Complete: Alert Routing & Deduplication (8/8 plans complete)*
*Next: Phase 5 planning - Notification System*
