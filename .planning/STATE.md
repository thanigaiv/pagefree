# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-06)

**Core value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds
**Current focus:** Phase 2 - Alert Ingestion & Webhooks

## Current Position

Phase: 1 of 10 (Foundation & User Management) — COMPLETE ✓
Plan: 11/11 complete
Status: Ready for Phase 2
Last activity: 2026-02-06 — Phase 1 verified and complete (all gaps closed)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 4 min
- Total execution time: 0.80 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & User Management | 11/11 | 48 min | 4 min |

**Recent Trend:**
- Last 7 plans: 01-05 (3 min), 01-10 (5 min), 01-06 (3 min), 01-07 (5 min), 01-08 (5 min), 01-09 (8 min), 01-11 (2 min)
- Trend: Excellent velocity, Phase 1 complete

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

### Pending Todos

None yet.

### Blockers/Concerns

**From research:**
- ✅ Phase 1: Must store all timestamps in UTC to prevent timezone bugs (ADDRESSED: Used @db.Timestamptz in all models)
- Phase 2: Webhook idempotency and signature validation essential (critical pitfall)
- Phase 3: DST handling requires explicit test cases for spring-forward/fall-back scenarios (critical pitfall)
- Phase 4: Alert deduplication needs database transactions to prevent race conditions (critical pitfall)
- Phase 5: Multi-provider notification failover must be built in from start (critical pitfall)

**Current concerns:**
- None - Phase 1 fully complete with all TypeScript compilation errors resolved
- Project builds cleanly with `npm run build`
- All 46 tests passing

## Session Continuity

Last session: 2026-02-06 22:12:12 UTC
Stopped at: Completed 01-11-PLAN.md - TypeScript compilation fixes (Phase 1 complete)
Resume file: None

---
*Phase 1 Complete: Ready for Phase 2 - Alert Configuration & Escalation*
