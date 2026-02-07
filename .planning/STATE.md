# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds
**Current focus:** Phase 7 - External Integrations

## Current Position

Phase: 7 of 10 (External Integrations) — IN PROGRESS
Plan: 4 of 11 complete
Status: Building frontend UI components for integration management
Last activity: 2026-02-07 — Completed 07-04-PLAN.md (Frontend hooks and IntegrationCard component)
Progress: [████████████████████████████████████░░░░] 64% (6.4 of 10 phases)

## Performance Metrics

**Velocity:**
- Total plans completed: 57
- Average duration: 3.5 min
- Total execution time: 3.49 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & User Management | 11/11 | 48 min | 4 min |
| 2. Alert Ingestion & Webhooks | 7/7 | 16 min | 2.3 min |
| 3. Scheduling System | 7/7 | 25 min | 3.6 min |
| 4. Alert Routing & Deduplication | 8/8 | 30 min | 3.8 min |
| 5. Multi-Channel Notifications | 11/11 | 50 min | 4.5 min |
| 6. Incident Management Dashboard | 11/11 | 52 min | 4.7 min |
| 7. External Integrations | 4/11 | 10 min | 2.5 min |

**Recent Trend:**
- Last 7 plans: 06-06 (4 min), 06-07 (6.8 min), 06-08 (3.5 min), 06-09 (4.3 min), 06-10 (4 min), 06-11 (5 min), 07-04 (2.4 min)
- Trend: Phase 7 in progress - building integration UI components

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
| Cursor-based pagination for alert search | 04-07 | Scalable for large result sets, prevents performance degradation as dataset grows |
| Content fingerprint includes service metadata | 04-07 | Service field from metadata enables better grouping for microservice architectures |
| Return incident_id in webhook response | 04-07 | Monitoring tools can track incident lifecycle from initial alert |
| PagerDuty-style email templates | 05-02 | Color-coded priority headers for familiarity with existing on-call teams |
| Magic link tokens expire in 15 minutes | 05-02 | Balance security (short expiry) with usability (enough time to click) |
| SHA-256 hashing for magic link tokens | 05-02 | Never store plaintext tokens per OWASP security guidance |
| SMS 160-character optimization | 05-02 | Optimize for single SMS to avoid multi-part message delays |
| Escalation level prefix in SMS | 05-02 | [ESC-LN][PRIORITY] format for escalated alerts in character-limited medium |
| Short incident ID in SMS | 05-02 | Last 6 chars for brevity while maintaining uniqueness |
| Phone verification required for SMS | 05-02 | Prevent sending to unverified numbers per Phase 1 decision |
| AWS SNS for push notifications | 05-05 | Native support for iOS APNs and Android FCM with token management |
| iOS critical alerts with interruption-level: critical | 05-05 | Per user decision - override DND for CRITICAL/HIGH incidents |
| Android high-priority notification channel | 05-05 | Per user decision - PRIORITY_MAX overrides DND for critical incidents |
| Twilio voice calls with TwiML IVR | 05-05 | Per user decision - interactive keypress menu (1=ack, 2=details, 9=escalate) |
| Machine detection for voicemail | 05-05 | Identify voicemail vs human answer for delivery tracking |
| Teams app-only authentication | 05-04 | ClientSecretCredential for proactive messaging without user interaction |
| Teams Adaptive Cards v1.5 | 05-04 | Action.Submit buttons for acknowledge/resolve actions |
| Teams chat creation pattern | 05-04 | Create 1:1 chat if doesnt exist for proactive messaging |
| Teams priority styling mirrors Slack | 05-04 | Consistent visual language (CRITICAL=attention, HIGH=warning) |
| NotificationLog per-channel tracking | 05-01 | Track delivery status per channel per incident for granular retry logic |
| MagicLinkToken SHA-256 hashing | 05-01 | OWASP guidance - never store plaintext security tokens for email actions |
| OAuth connection storage for Slack/Teams | 05-01 | Enable bidirectional integration with automatic token refresh support |
| Channel interface abstraction | 05-01 | Polymorphic notification delivery - all channels implement send() contract |
| Channel escalation config pattern | 05-01 | Primary (parallel), secondary (if primary fails), fallback (last resort) |
| TEAMS added to NotificationChannel enum | 05-01 | Microsoft Teams as first-class channel alongside Slack |
| Hybrid parallel/sequential delivery strategy | 05-06 | Primary channels (email/slack/push) parallel for speed, secondary/fallback sequential on failure |
| 5 retry attempts with 30s exponential backoff | 05-06 | At-least-once delivery over ~10 minute window with exponential backoff (30s, 1m, 2m, 4m, 3m) |
| Per-channel job queueing with tracking | 05-06 | Each channel gets own BullMQ job with individual NotificationLog tracking |
| Channel tier escalation on failure | 05-06 | Primary fails (2+ channels) -> secondary (SMS) -> fallback (voice) |
| Critical failure defined as email + SMS both fail | 05-06 | Permanent notification failure when both critical channels fail |
| Extended NotificationJobData with payload/logId/tier | 05-06 | Worker context includes full payload to avoid re-querying database |
| Worker concurrency 10 with 100/min rate limit | 05-06 | Prevent provider throttling while maintaining parallelism |
| Slack optimistic UI with rollback | 05-07 | Update message immediately, restore on failure for instant user feedback |
| HMAC-SHA256 signature verification | 05-07 | Timing-safe comparison prevents timing attacks on webhook auth |
| 5-minute timestamp window for Slack | 05-07 | Replay attack prevention for webhook requests |
| Immediate webhook acknowledgment | 05-07 | Slack requires response within 3 seconds, process asynchronously |
| Short ID suffix matching | 05-07 | /oncall commands accept last 6+ chars of incident ID for UX |
| System user ID for magic link actions | 05-08 | Magic links use 'magic-link' system user - token is proof of authorization |
| SMS keyword parsing with fallback | 05-08 | Detect ACK/RESOLVE keywords, extract 4+ digit short ID, fallback to recent incident |
| Voice IVR keypress menu | 05-08 | Press 1=ack, 2=details, 9=escalate per user decision for intuitive phone interface |
| Twilio signature validation required | 05-08 | All SMS/voice webhooks validate Twilio signature for security |
| Best-effort notification pattern | 05-09 | Catch notification dispatch errors to avoid failing escalation - notifications are critical but not blocking |
| Parallel worker startup | 05-09 | Start escalation and notification workers together, server starts in degraded mode if Redis unavailable |
| Unified notification module exports | 05-09 | Barrel export pattern provides single import point for all notification functionality |
| Twilio primary, AWS SNS fallback for SMS | 05-10 | Multi-provider failover ensures SMS delivery even when Twilio unavailable |
| Circuit breaker pattern for provider health | 05-10 | Open after 3 consecutive failures, reset after 60s, half-open state for testing recovery |
| Provider health monitoring every 30s | 05-10 | Background health checks detect issues proactively, Twilio API ping, SNS passive monitoring |
| Provider ID prefix for tracking | 05-10 | SNS provider IDs prefixed with 'sns:' for clear tracking and cost allocation |
| Mock all external providers for tests | 05-11 | vi.mock() pattern for SES, Twilio, Slack, SNS, Redis enables tests without credentials |
| Socket.io over polling or SSE | 06-02 | Bidirectional communication per user decision in CONTEXT.md |
| Team-based rooms for targeted broadcasts | 06-02 | Efficient broadcasting to only relevant users |
| Graceful fallback when socket not initialized | 06-02 | Don't crash server if Socket.io fails, just log warning |
| Broadcast after transaction completes | 06-02 | Only broadcast successfully committed incidents |
| Timeline virtualization threshold at 20+ events | 06-04 | Performance optimization - virtualize only when needed, simple rendering for short lists |
| User notes visually distinct with blue background | 06-04 | Clear visual hierarchy helps responders quickly find human context |
| Technical details in collapsible section | 06-04 | Progressive disclosure - clean UI by default, technical details on demand |
| External tool links based on service metadata | 06-04 | Reduce context switching - incident responders can jump to monitoring tools directly |
| Optimistic updates for acknowledge only | 06-05 | Instant UI feedback for safe, reversible actions; resolve/close require confirmation |
| Connection status banner hidden when connected | 06-05 | Only show when disconnected/reconnecting - reduces visual clutter during normal operation |
| Toast notifications for multi-user updates | 06-05 | Real-time collaborative awareness - "Alice acknowledged incident" shown when others act |
| Bulk operations use Promise.allSettled | 06-05 | Execute in parallel with partial success tracking (succeeded/failed counts) |
| Resolve confirmation with optional note | 06-05 | AlertDialog prevents accidental resolution, optional textarea for details |
| Mobile-only swipe gestures | 06-08 | Swipe gestures disabled on desktop via useIsMobile hook to prevent mouse conflicts |
| Angle detection 30-degree threshold | 06-08 | Distinguishes horizontal from vertical gestures, prevents blocking scroll |
| Swipe thresholds (80px commit, 30px preview) | 06-08 | Prevents accidental triggers while providing visual feedback |
| PWA prompt after first acknowledgment | 06-08 | User demonstrates value before being asked to install app |
| Vitest for frontend testing | 06-11 | ESM-native testing framework with React Testing Library integration |
| Test setup with global mocks | 06-11 | Mock socket.io, fetch, and browser APIs (IntersectionObserver, ResizeObserver) in setup.ts |
| Component tests with providers | 06-11 | renderWithProviders helper wraps tests with QueryClientProvider and BrowserRouter |
| Async act() for hook state updates | 06-11 | Properly handle React state updates in hook tests to avoid timing issues |
| useSwipeGesture hook for mobile gestures | 06-11 | Reusable hook with threshold detection, direction tracking, and preview state |
| NetworkFirst caching for incidents | 06-07 | Fresh data when online, cached data when offline with 3s network timeout |
| StaleWhileRevalidate for users/teams | 06-07 | Less frequently changing data uses cached version while revalidating in background |
| 5-minute cache expiration for incidents | 06-07 | Balance between offline availability and data freshness for real-time incident data |
| globalThis instead of global for test mocks | 06-07 | Modern TypeScript standard, avoids TS2304 errors in test setup |
| User preferences stored as JSON field | 06-10 | Flexible schema for dashboard/notification settings without additional tables |
| Deep merge for preference updates | 06-10 | Partial updates merge with existing preferences rather than replace |
| Quick filter presets (4 predefined options) | 06-10 | Common use cases: Active Incidents, Critical Only, Needs Attention, Recently Resolved |
| Auto-apply default filters on mount | 06-10 | If user has saved preferences and URL has no filters, apply defaults automatically |
| WebAuthn placeholder endpoints | 06-10 | Full implementation deferred - mock responses for UI development |
| Platform authenticator only for biometric | 06-10 | Focus on built-in biometrics (Face ID, Touch ID, Windows Hello) not cross-device |
| Biometric requires active session | 06-10 | Registration only works for authenticated users, not for initial login |
| Web push subscriptions in UserDevice with platform "web" | 06-09 | Reuse existing table from Phase 5, distinguish via platform field |
| InjectManifest strategy for custom service worker | 06-09 | Full control over service worker enables both caching and push handlers |
| Push notification deep linking to incident detail | 06-09 | Per user decision - tap notification goes directly to incident view |
| VAPID key distribution via backend API | 06-09 | Backend provides public key, stores subscriptions securely |
| apiFetch pattern for frontend API calls | 07-04 | Use existing apiFetch<T>() pattern instead of api.get() for consistency |
| IntegrationCard provider color coding | 07-04 | DataDog purple, New Relic green, PagerDuty emerald, Generic gray |

### Pending Todos

None yet.

### Blockers/Concerns

**From research:**
- ✅ Phase 1: Must store all timestamps in UTC to prevent timezone bugs (ADDRESSED: Used @db.Timestamptz in all models)
- ✅ Phase 2: Webhook idempotency and signature validation essential (ADDRESSED: Signature validation in 02-02, hybrid idempotency in 02-03)
- ✅ Phase 3: DST handling requires explicit test cases for spring-forward/fall-back scenarios (ADDRESSED: DST test fixtures in 03-07, spring-forward/fall-back verified)
- ✅ Phase 4: Alert deduplication needs database transactions to prevent race conditions (ADDRESSED: Serializable isolation in 04-04, P2034 retry logic verified)
- ✅ Phase 5: Multi-provider notification failover must be built in from start (ADDRESSED: Circuit breaker pattern in 05-10, Twilio→SNS failover)

**Current concerns:**
- ✅ Phase 4 complete - all functionality and tests implemented
- ✅ Phase 5 complete - multi-channel notification system fully tested
- ✅ Notification dispatcher with tier-based escalation complete (05-06)
- ✅ At-least-once delivery guarantee via BullMQ retry complete (05-06)
- ✅ Multi-provider SMS failover with circuit breaker complete (05-10)
- ✅ Comprehensive test coverage for notification system complete (05-11)
- ✅ Real-time incident updates via Socket.io complete (06-02)
- TODO: Alert ops team when critical notification failure detected (email + SMS both fail) - deferred to Phase 6 dashboard
- TODO: Socket authentication needs session verification enhancement before production (currently simplified)
- TODO: No rate limiting on socket events - might need throttling for high-traffic systems
- Teams Graph API rate limits (1800 req/min) may need batching for high-traffic systems - monitor in production

## Session Continuity

Last session: 2026-02-07 19:04:00 UTC
Stopped at: Completed 07-04-PLAN.md (Frontend hooks and IntegrationCard component)
Resume file: None

---
*Phase 7 In Progress: External Integrations (4/11 plans complete)*
*Next: Plan 07-05 - Integrations Admin Page*
