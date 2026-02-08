# v1.2 Production Readiness - Requirements

**Milestone:** v1.2 Production Readiness
**Goal:** Make the platform production-ready for team migration while adding runbook automation and partner status page access
**Status:** Roadmap Created
**Created:** 2026-02-08
**Roadmap Created:** 2026-02-08

## Overview

v1.2 focuses on three areas identified during v1.0/v1.1 deployment:
1. **Production Hardening** - Fix known tech debt blocking production deployment
2. **Runbook Automation** - Execute pre-approved remediation scripts on incident triggers
3. **Partner Status Pages** - Grant authenticated external access to status pages

## Requirements

### Production Hardening

#### HARD-01: VAPID Key Configuration
**Priority:** P1 (Blocker)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Implement production-ready web push notifications with proper VAPID key generation and configuration.

**Acceptance Criteria:**
- Generate VAPID key pair using web-push library
- Store VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment configuration
- Update push service to use actual VAPID keys instead of placeholder
- Store full PushSubscription (endpoint + auth keys) not just endpoint
- Send test push notification with VAPID signature verification

**Related:**
- Extends: Existing push service (src/services/push.service.ts)
- Blocks: Production deployment of push notifications

---

#### HARD-02: PWA Icon Assets
**Priority:** P1 (Nice-to-have but expected)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Replace SVG placeholder icons with proper PNG assets for PWA home screen installation.

**Acceptance Criteria:**
- Create 192x192 PNG icon for PWA manifest
- Create 512x512 PNG icon for PWA manifest
- Add apple-touch-icon (180x180) for iOS home screen
- Update manifest.json with icon references
- Verify icons appear correctly on iOS and Android home screens

**Related:**
- Updates: frontend/public/manifest.json
- Assets: frontend/public/icons/

---

#### HARD-03: Socket.IO Session Validation
**Priority:** P1 (Security)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Implement proper session validation for Socket.IO connections instead of token pass-through.

**Acceptance Criteria:**
- Query connect-pg-simple session table on socket connection
- Validate session exists and is not expired
- Extract user ID from validated session
- Reject connections with invalid/expired sessions
- Handle session refresh/expiration during active connection
- Add audit logging for socket authentication failures

**Related:**
- Updates: src/lib/socket.ts
- Depends on: connect-pg-simple session store (existing)
- Security: Prevents unauthorized WebSocket connections

---

#### HARD-04: Webhook Test Fixes
**Priority:** P1 (Quality)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Fix 10 failing Phase 2 webhook tests that regressed during Phase 4 changes.

**Acceptance Criteria:**
- All Phase 2 webhook tests pass
- Datadog signature verification handles edge cases (encoding, timestamps)
- New Relic signature verification handles edge cases
- Generic webhook signature verification (HMAC) works reliably
- Add timestamp validation (reject webhooks older than 5 minutes)
- Document webhook signature requirements for integration partners

**Related:**
- Updates: src/routes/webhook.routes.ts, src/middleware/webhookVerification.ts
- Tests: __tests__/routes/webhook.test.ts
- Fixes: Regression from Phase 4 deduplication changes

---

#### HARD-05: Redis-Backed Rate Limiting
**Priority:** P1 (Security)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Implement Redis-backed rate limiting for all API endpoints to prevent abuse.

**Acceptance Criteria:**
- Replace memory-based rate limiter with Redis-backed implementation
- Define rate limit tiers:
  - Webhook ingestion: 1000 req/min per IP
  - API calls (authenticated): 500 req/min per user
  - Public endpoints: 100 req/min per IP
- Return standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- Log rate limit violations to audit system
- Admin UI to view rate limit metrics (optional for v1.2.0)

**Related:**
- Updates: src/middleware/rateLimiter.ts
- Depends on: Redis (existing)
- Replaces: Memory-based login rate limiter

---

#### HARD-06: WebSocket Rate Limiting
**Priority:** P1 (Security)
**Category:** Production Hardening
**Status:** Not Started
**Phase:** 14 - Production Hardening

**Description:**
Add rate limiting to WebSocket events to prevent abuse of real-time connections.

**Acceptance Criteria:**
- Limit socket event emission to 100 events/min per connection
- Disconnect clients exceeding rate limits
- Log rate limit violations with user ID and socket ID
- Emit warning to client before disconnect (grace threshold at 80 events/min)
- Exempt system events (e.g., incident.created) from rate limits

**Related:**
- Updates: src/lib/socket.ts
- Security: Prevents WebSocket flooding attacks

---

### Runbook Automation

#### AUTO-07: Runbook Script Library
**Priority:** P1 (Core Feature)
**Category:** Runbook Automation
**Status:** Not Started
**Phase:** 15 - Runbook Automation Foundation

**Description:**
Create a pre-approved script library where admins can define, version, and approve runbook scripts.

**Acceptance Criteria:**
- Database model: Runbook (id, name, description, version, executionTarget, parameters, approvalStatus, createdBy, teamId)
- ApprovalStatus enum: DRAFT, APPROVED, DEPRECATED
- Admin UI to create/edit runbooks
- Script parameters defined as JSON schema for validation
- Version tracking (increment version on edit, keep history)
- Only PLATFORM_ADMIN can approve runbooks
- Team-scoped runbooks (teamId) and global runbooks (teamId = null)
- Audit log for runbook create/edit/approve/deprecate

**Related:**
- New model: Runbook in prisma/schema.prisma
- New routes: src/routes/runbook.routes.ts
- New service: src/services/runbook.service.ts
- RBAC: PLATFORM_ADMIN only for approval

---

#### AUTO-08: Runbook Execution via Webhook
**Priority:** P1 (Core Feature)
**Category:** Runbook Automation
**Status:** Not Started
**Phase:** 15 - Runbook Automation Foundation

**Description:**
Execute approved runbooks by posting to external webhook endpoints (Ansible Tower, AWS SSM, custom services).

**Acceptance Criteria:**
- Runbook executor service that:
  - Resolves runbook definition from library
  - Builds execution context (incident data, parameters)
  - Posts to configured webhook endpoint
  - Tracks execution status (PENDING, RUNNING, SUCCESS, FAILED)
  - Logs execution with full audit trail
- Support parameter templating using Handlebars (reuse workflow templating)
- Timeout configuration per runbook (default 5 minutes)
- Retry logic for failed webhook requests (3 retries with exponential backoff)
- Store execution result payload from webhook response

**Related:**
- New service: src/services/runbook-executor.service.ts
- Reuses: Handlebars templating from workflow system
- Model: RunbookExecution (id, runbookId, incidentId, status, result, executedBy, startedAt, completedAt)

---

#### AUTO-09: Runbook Workflow Action Type
**Priority:** P1 (Core Feature)
**Category:** Runbook Automation
**Status:** Not Started
**Phase:** 16 - Runbook Integration

**Description:**
Add "runbook" as a new action type in the workflow builder for automated execution on incident triggers.

**Acceptance Criteria:**
- Extend WorkflowDefinition schema with "runbook" action type
- Workflow builder UI: Add runbook action node
- Runbook selector in workflow builder (dropdown of APPROVED runbooks)
- WorkflowExecutor handles runbook actions by calling runbook-executor service
- Runbook execution logs linked to workflow execution logs
- Visual workflow builder shows runbook icon/label on action nodes

**Related:**
- Updates: src/services/workflow/executor.service.ts
- Updates: frontend/src/components/WorkflowBuilder.tsx
- Depends on: AUTO-07, AUTO-08

---

#### AUTO-10: Manual Runbook Trigger
**Priority:** P1 (Core Feature)
**Category:** Runbook Automation
**Status:** Not Started
**Phase:** 16 - Runbook Integration

**Description:**
Allow responders to manually trigger runbooks from the incident detail page.

**Acceptance Criteria:**
- "Run Runbook" button on incident detail page
- Modal to select runbook (filtered by team scope)
- Show runbook description and parameters before execution
- Confirm dialog with "Are you sure?" prompt
- Execute runbook and show status in incident timeline
- Audit log for manual runbook execution

**Related:**
- Updates: frontend/src/pages/IncidentDetailPage.tsx
- API: POST /api/incidents/:id/runbooks/:runbookId/execute
- Depends on: AUTO-07, AUTO-08

---

### Partner Status Pages

#### PARTNER-01: Partner Account Model
**Priority:** P1 (Core Feature)
**Category:** Partner Status Pages
**Status:** Not Started
**Phase:** 17 - Partner Status Pages

**Description:**
Create a partner user model for external authenticated access to status pages.

**Acceptance Criteria:**
- Database model: PartnerUser (id, email, name, isActive, createdBy, createdAt, updatedAt)
- Many-to-many relation: PartnerUser ↔ StatusPage (access assignment)
- Partner users scoped to specific status pages (cannot see all pages)
- Admin UI to create/deactivate partner accounts
- Partner status: ACTIVE, DEACTIVATED
- Audit log for partner account create/deactivate/access-grant/access-revoke

**Related:**
- New model: PartnerUser in prisma/schema.prisma
- New join table: _PartnerUserStatusPageAccess
- RBAC: Read-only access only, no subscriptions

---

#### PARTNER-02: Partner Magic Link Authentication
**Priority:** P1 (Core Feature)
**Category:** Partner Status Pages
**Status:** Not Started
**Phase:** 17 - Partner Status Pages

**Description:**
Implement magic link email authentication for partner users (no password required).

**Acceptance Criteria:**
- Partner login endpoint: POST /api/partner/auth/request-login
- Generate magic link token (JWT with short expiration: 15 minutes)
- Send magic link via email (reuse existing email service)
- Partner login flow: Click link → verify token → create partner session
- Partner session separate from internal user sessions (different cookie name)
- Partner session expires after 24 hours
- Audit log for partner logins

**Related:**
- New routes: src/routes/partner-auth.routes.ts
- Reuses: Email service (existing), JWT library (jose)
- Session: Separate partner session middleware

---

#### PARTNER-03: Partner Status Page Access Control
**Priority:** P1 (Core Feature)
**Category:** Partner Status Pages
**Status:** Not Started
**Phase:** 17 - Partner Status Pages

**Description:**
Enforce access control for partner users viewing status pages.

**Acceptance Criteria:**
- Partner users can only view assigned status pages
- Partner users see:
  - Component status
  - Active incidents
  - Maintenance windows
  - Incident history
- Partner users CANNOT:
  - Subscribe to updates
  - View internal incidents (only status page incidents)
  - Access admin functions
  - See other status pages
  - View audit logs
- Access checks enforced in API middleware
- Frontend hides unavailable actions (no subscribe button for partners)

**Related:**
- Updates: src/routes/statusPage.routes.ts
- Middleware: requirePartnerAuth, checkStatusPageAccess
- Frontend: Partner-specific status page view

---

#### PARTNER-04: Partner Access Audit Logging
**Priority:** P1 (Security)
**Category:** Partner Status Pages
**Status:** Not Started
**Phase:** 17 - Partner Status Pages

**Description:**
Log all partner access to status pages for security and compliance.

**Acceptance Criteria:**
- Audit events for:
  - partner.login (successful magic link login)
  - partner.access.statusPage (viewed status page)
  - partner.access.denied (attempted unauthorized access)
- Audit log includes partner email, IP address, user agent, timestamp
- Admin UI to view partner access logs (filter by partner, date range)
- Retention: 90 days for partner access logs

**Related:**
- Uses: Existing audit service (src/services/audit.service.ts)
- New audit actions: partner.* namespace

---

## Requirement Traceability

### Phase Mapping

| Requirement | Phase | Category | Status |
|-------------|-------|----------|--------|
| HARD-01 | Phase 14 | Production Hardening | Not Started |
| HARD-02 | Phase 14 | Production Hardening | Not Started |
| HARD-03 | Phase 14 | Production Hardening | Not Started |
| HARD-04 | Phase 14 | Production Hardening | Not Started |
| HARD-05 | Phase 14 | Production Hardening | Not Started |
| HARD-06 | Phase 14 | Production Hardening | Not Started |
| AUTO-07 | Phase 15 | Runbook Automation | Not Started |
| AUTO-08 | Phase 15 | Runbook Automation | Not Started |
| AUTO-09 | Phase 16 | Runbook Automation | Not Started |
| AUTO-10 | Phase 16 | Runbook Automation | Not Started |
| PARTNER-01 | Phase 17 | Partner Status Pages | Not Started |
| PARTNER-02 | Phase 17 | Partner Status Pages | Not Started |
| PARTNER-03 | Phase 17 | Partner Status Pages | Not Started |
| PARTNER-04 | Phase 17 | Partner Status Pages | Not Started |

**Coverage:** 14/14 requirements mapped (100%)

### Production Hardening
| Requirement | Components | Dependencies |
|-------------|-----------|--------------|
| HARD-01 | Push Service, Environment Config | Redis, web-push library |
| HARD-02 | PWA Manifest, Icon Assets | None |
| HARD-03 | Socket.IO Server | connect-pg-simple session store |
| HARD-04 | Webhook Routes, Verification Middleware | Phase 2 tests |
| HARD-05 | Rate Limiter Middleware | Redis |
| HARD-06 | Socket.IO Server | Redis |

### Runbook Automation
| Requirement | Components | Dependencies |
|-------------|-----------|--------------|
| AUTO-07 | Runbook Model, Service, Routes, Admin UI | RBAC system |
| AUTO-08 | Runbook Executor Service, Execution Model | AUTO-07, BullMQ, Handlebars |
| AUTO-09 | Workflow Executor, Workflow Builder UI | AUTO-07, AUTO-08, Workflow System |
| AUTO-10 | Incident Detail UI, Runbook API | AUTO-07, AUTO-08 |

### Partner Status Pages
| Requirement | Components | Dependencies |
|-------------|-----------|--------------|
| PARTNER-01 | PartnerUser Model, Admin UI | RBAC system |
| PARTNER-02 | Partner Auth Routes, Magic Link Email | jose library, Email service |
| PARTNER-03 | Status Page Routes, Partner Middleware | PARTNER-01, PARTNER-02 |
| PARTNER-04 | Audit Service, Admin Audit UI | PARTNER-01, PARTNER-02, PARTNER-03 |

## Out of Scope

Explicitly NOT included in v1.2:

- **Arbitrary script execution** - Security risk; only pre-approved scripts allowed
- **SSH/direct server access** - Use webhooks to existing tools (Ansible, SSM)
- **Runner agents** - Webhook-based execution is simpler and sufficient
- **Sandbox script execution** - Future consideration (v1.3+)
- **Partner SSO** - Future consideration (v1.3+)
- **Script approval workflow UI** - Auto-approved by admin for v1.2, workflow in v1.2.x
- **Runbook execution callbacks** - Webhook can return status synchronously; async callbacks in v1.2.x
- **Component-level partner access** - Page-level access only for v1.2
- **Partner invitation flow** - Admin creates accounts directly for v1.2

## Success Criteria

v1.2 is considered successful when:

1. **Production Hardening Complete:**
   - Push notifications work with proper VAPID keys
   - PWA icons display correctly on mobile home screens
   - Socket.IO connections are properly authenticated
   - All webhook tests pass
   - Rate limiting active on all API endpoints and WebSocket events

2. **Runbook Automation Functional:**
   - Admins can create and approve runbooks
   - Runbooks execute via webhook to external systems
   - Workflows can trigger runbooks automatically
   - Responders can manually trigger runbooks from incidents
   - Full audit trail for all runbook executions

3. **Partner Access Enabled:**
   - Partner accounts created and assigned to status pages
   - Partners can log in via magic link
   - Partners see only assigned status pages (read-only)
   - All partner access logged for audit

4. **Migration Readiness:**
   - No known blockers for production deployment
   - Team-by-team migration can proceed
   - Platform ready to coexist with PagerDuty during transition

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Runbook security** | HIGH - Arbitrary code execution risk | Pre-approved scripts only, webhook-based execution, full audit trail |
| **Partner token leakage** | MEDIUM - Unauthorized access | Short-lived JWT, audit logging, revocation capability |
| **Rate limit bypass** | MEDIUM - API abuse | Redis-backed limiter, multiple enforcement points |
| **Socket auth bypass** | HIGH - Unauthorized real-time access | Proper session validation, audit logging |
| **VAPID key exposure** | MEDIUM - Push notification spoofing | Environment-only storage, never in code/logs |

---

**Requirements Status:** Roadmap Created
**Next Step:** Plan Phase 14 (Production Hardening) using `/gsd:plan-phase 14`
**Roadmap:** 4 phases (14-17), estimated 14 requirements

*Requirements defined: 2026-02-08*
*Roadmap created: 2026-02-08*
