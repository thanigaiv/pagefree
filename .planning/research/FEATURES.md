# Feature Research: v1.2 Production Readiness

**Domain:** Incident Management Platform - Production Hardening
**Researched:** 2026-02-08
**Confidence:** MEDIUM-HIGH

## Scope

This research covers NEW features for v1.2 only:
1. **Runbook automation** - Pre-approved scripts executed on incident triggers
2. **Partner status pages** - Authenticated external access
3. **Production hardening** - PWA icons, VAPID keys, webhook fixes, socket auth, rate limiting

Existing v1.0/v1.1 features (alerts, routing, escalation, notifications, workflows, internal status pages, etc.) are NOT in scope.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in production-ready incident management. Missing these = platform feels incomplete for real deployment.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **VAPID key configuration** | Web push notifications require VAPID for production; current implementation has placeholder | LOW | Already have push service, just need proper key generation/configuration and actual web-push library usage |
| **PWA manifest icons** | Mobile users on home screen see generic icon instead of branded | LOW | Add icon assets to manifest.json, likely 192x192 and 512x512 PNG |
| **Socket.IO session authentication** | Current simplified auth uses token pass-through; production needs proper session validation | MEDIUM | Comment in code says "verify session from connect-pg-simple"; need to integrate with existing session store |
| **Webhook signature verification fixes** | Must handle all edge cases (encoding, timestamps) for Datadog/New Relic webhooks reliably | LOW-MEDIUM | Existing infrastructure works but may have edge cases per "webhook fixes" scope item |
| **API rate limiting** | Production APIs need rate limits to prevent abuse; only login rate limiting exists | MEDIUM | Existing rate limiter is memory-based and login-only; need Redis-backed limiter for all API endpoints |

### Differentiators (Competitive Advantage)

Features that set PageFree apart. These directly address gaps in competitors like PagerDuty.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Runbook automation** | Execute pre-approved remediation scripts automatically when incidents trigger; PagerDuty requires separate Runner agent and Rundeck license | HIGH | Pre-approved scripts only (security constraint), no arbitrary code execution. Builds on existing workflow infrastructure |
| **Partner/contractor status pages** | Share incident status with external parties via authenticated access without exposing internal systems; Statuspage charges $300+/month for this | MEDIUM | Existing private status pages use single access token; need partner accounts with proper auth |
| **Integrated script library** | Curated, versioned, audited runbook scripts managed within platform; competitors require external script repos | MEDIUM | Governance advantage - scripts reviewed before approval, full audit trail |
| **Incident-triggered automation** | Runbooks automatically invoked by workflow triggers (existing), not just manual | LOW | Existing workflow executor already handles webhooks/Jira/Linear; extend with runbook action type |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Arbitrary script execution** | "Let me run any script" | Security nightmare - no governance, audit gaps, potential for destructive commands | Pre-approved scripts only: curated library, version controlled, reviewed before deployment |
| **SSH/direct server access** | "Execute runbook directly on servers" | Requires agent deployment, network access, credentials management | Use webhooks to existing tooling (Ansible Tower, AWS SSM, Rundeck); PageFree orchestrates, not executes |
| **Public partner pages** | "Make partner pages fully public" | Exposes sensitive operational data to competitors/attackers | Authenticated access with email domain restrictions or explicit partner accounts |
| **Self-registration for partners** | "Partners sign themselves up" | No control over who sees status; potential spam | Admin-provisioned partner accounts with invitation flow |
| **Runner agents** | "Install agent to execute scripts" | Deployment complexity, security surface, maintenance burden | Webhook-based execution via existing integrations; external tools (Ansible/SSM) handle the "last mile" |

## Runbook Automation Deep Dive

### Industry Standard: How Runbooks Work

Based on research of PagerDuty Automation Actions, Rundeck, and Azure Automation:

**Execution Models:**

1. **Agent-based (PagerDuty Runner, Rundeck Enterprise Runner):**
   - Install software on target networks
   - Agent polls for jobs, executes locally
   - Requires firewall rules, credential management
   - **Not recommended for v1.2** - too much complexity

2. **Webhook-based (Recommended for PageFree):**
   - Define scripts as named actions with pre-configured parameters
   - When triggered, POST to external automation endpoint
   - External system (Ansible Tower, AWS SSM, custom service) executes
   - PageFree tracks execution status via callback webhooks

3. **Sandbox execution (Azure Automation):**
   - Cloud-hosted execution environment
   - Scripts run in isolated sandbox
   - **Future consideration** - significant infrastructure

### Recommended Architecture for PageFree v1.2

```
┌─────────────────────────────────────────────────────────┐
│                    RUNBOOK SYSTEM                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Runbook    │    │  Execution   │                   │
│  │   Library    │    │   Targets    │                   │
│  │ (pre-approved│    │ (webhooks to │                   │
│  │   scripts)   │    │ external     │                   │
│  └──────┬───────┘    │  systems)    │                   │
│         │            └──────┬───────┘                   │
│         ▼                   │                           │
│  ┌──────────────────────────▼───────────────────────┐   │
│  │              Runbook Executor                      │   │
│  │  - Resolves script + target                       │   │
│  │  - Builds execution context (incident data)       │   │
│  │  - Posts to target webhook                        │   │
│  │  - Tracks execution status                        │   │
│  └──────────────────────────┬───────────────────────┘   │
│                             │                           │
│                             ▼                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           External Execution Targets              │   │
│  │  - AWS Systems Manager (SSM) Run Command          │   │
│  │  - Ansible Tower/AWX webhooks                     │   │
│  │  - Custom execution service                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Runbook Feature Requirements

| Requirement | Priority | Complexity | Notes |
|-------------|----------|------------|-------|
| Pre-approved script library | P1 | MEDIUM | Named scripts with version, description, approval status |
| Execution targets (webhook endpoints) | P1 | LOW | Similar to existing workflow webhook action |
| Trigger from workflow | P1 | LOW | New action type in workflow executor |
| Manual trigger from incident | P1 | LOW | API + UI button on incident detail |
| Execution audit trail | P1 | LOW | Leverage existing WorkflowExecution logging |
| Script versioning | P2 | LOW | Track changes, rollback capability |
| Script approval workflow | P2 | MEDIUM | Admin review before script becomes available |
| Parameter templating | P1 | LOW | Reuse existing Handlebars templating from workflows |
| Execution timeout | P1 | LOW | Already in workflow executor |
| Callback for execution status | P2 | MEDIUM | Webhook endpoint to receive completion status from external system |

### Security Model for Runbooks

**Pre-approved scripts only (per project requirements):**

1. **Script Registration:** Admin creates script definition with:
   - Name, description, version
   - Target execution endpoint (webhook URL)
   - Required parameters (templated from incident context)
   - Approval status (DRAFT, APPROVED, DEPRECATED)

2. **Execution Controls:**
   - Only APPROVED scripts can be executed
   - Scripts scoped to team or global
   - Execution logged with user, incident, timestamp, result

3. **NO arbitrary code execution:**
   - Cannot paste custom script at execution time
   - Cannot modify script parameters beyond defined templates
   - All scripts reviewed by admin before approval

## Partner Status Pages Deep Dive

### Industry Standard: Authenticated Status Page Access

Based on research of Atlassian Statuspage and industry patterns:

**Access Models:**

1. **Single access token (current PageFree):**
   - One shared token for private page
   - Anyone with token can access
   - No user-level tracking

2. **Audience-specific pages (Statuspage $300+/month):**
   - Multiple user groups with different views
   - Email-based authentication
   - Audit of who viewed what

3. **Partner accounts (recommended for PageFree):**
   - Named external users with credentials
   - Session-based authentication
   - Audit trail per partner user
   - Revocable access

### Recommended Architecture for PageFree v1.2

```
┌─────────────────────────────────────────────────────────┐
│               PARTNER STATUS PAGE ACCESS                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Partner    │    │   Status     │                   │
│  │   Accounts   │    │    Pages     │                   │
│  │ (external    │────│ (configured  │                   │
│  │  users)      │    │  access)     │                   │
│  └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                           │
│         ▼                   ▼                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Partner Authentication                  │   │
│  │  - Magic link login (email-based, no password)    │   │
│  │  - Session with limited scope (read-only)         │   │
│  │  - Access logged per request                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Access Controls:                                        │
│  - Partner sees only assigned status pages               │
│  - Read-only (no subscribe, no admin actions)           │
│  - Session expires after configurable period            │
│  - Admin can revoke access instantly                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Partner Status Page Feature Requirements

| Requirement | Priority | Complexity | Notes |
|-------------|----------|------------|-------|
| Partner account model | P1 | MEDIUM | New entity: PartnerUser with email, name, status page access |
| Magic link authentication | P1 | LOW | Reuse existing magic link infrastructure from notifications |
| Partner-scoped session | P1 | MEDIUM | Separate session type with limited permissions |
| Status page access assignment | P1 | LOW | Many-to-many: PartnerUser to StatusPage |
| Access audit logging | P1 | LOW | Extend existing audit system |
| Admin partner management UI | P2 | LOW | CRUD for partner accounts |
| Partner invitation flow | P2 | LOW | Email invite with magic link to set up |
| Access revocation | P1 | LOW | Deactivate partner account, invalidate sessions |
| Component-level access | P3 | MEDIUM | Show only specific components to specific partners |

### Access Control Model

**Partner capabilities (read-only):**
- View assigned status page(s)
- See component status
- See active incidents
- See maintenance windows
- See incident history

**Partner CANNOT:**
- Subscribe to updates (managed by internal team)
- View internal incidents (only status page incidents)
- Access any admin functions
- See other status pages
- View audit logs

## Production Hardening Deep Dive

### VAPID Keys for Web Push

**Current state:** Push service exists but uses placeholder VAPID key

**Required changes:**
1. Generate VAPID key pair (once, store securely)
2. Store VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment
3. Use `web-push` library to send actual push notifications
4. Store full PushSubscription (endpoint + keys) not just endpoint

**Complexity:** LOW - infrastructure exists, need to complete implementation

### PWA Icons

**Current state:** PWA manifest likely missing proper icons

**Required changes:**
1. Add icon assets: 192x192, 512x512 PNG
2. Update manifest.json with icon references
3. Add apple-touch-icon for iOS

**Complexity:** LOW - asset creation and manifest update

### Socket.IO Authentication

**Current state:** Token passed but not validated against session store

```typescript
// Current (simplified)
const token = socket.handshake.auth?.token;
(socket as any).userId = token; // NOT validated

// Needed
const session = await sessionStore.get(token);
if (!session || !session.user) throw new Error('Invalid session');
socket.userId = session.user.id;
```

**Complexity:** MEDIUM - need to query connect-pg-simple session table

### Webhook Signature Verification

**Current state:** Basic verification exists

**Potential fixes needed:**
- Timestamp validation (reject old webhooks)
- Encoding edge cases (URL encoding, charset)
- Provider-specific quirks (Datadog vs New Relic)

**Complexity:** LOW-MEDIUM - depends on specific issues found

### API Rate Limiting

**Current state:** Login-only, memory-based rate limiter

**Required changes:**
1. Redis-backed rate limiter for persistence across restarts
2. Multiple tiers: webhook ingestion, API calls, public endpoints
3. Response headers (X-RateLimit-Limit, X-RateLimit-Remaining)
4. Per-IP and per-user limits

**Complexity:** MEDIUM - new middleware, Redis integration

## Feature Dependencies

```
Runbook Automation
    └──requires──> Workflow System (existing)
                       └──requires──> Incident Management (existing)
    └──requires──> Execution Target Configuration (new)
    └──requires──> Script Library (new)
    └──requires──> Audit System (existing)

Partner Status Pages
    └──requires──> Status Page System (existing)
    └──requires──> Partner Account Model (new)
    └──requires──> Magic Link Auth (existing)
    └──requires──> Session Management (existing)

Production Hardening
    └── VAPID Keys ──> Push Service (existing)
    └── Socket Auth ──> Session Store (existing)
    └── Rate Limiting ──> Redis (existing)
    └── PWA Icons ──> Manifest (existing)
```

### Dependency Notes

- **Runbook automation requires workflow system:** Extends existing WorkflowExecutor with new action type
- **Partner pages require status page system:** Adds access layer on top of existing StatusPage model
- **All hardening items have existing infrastructure:** Completing/fixing rather than building new

## v1.2 MVP Definition

### Launch With (v1.2.0)

Minimum for production deployment with new capabilities:

- [ ] **Runbook script library** - Admin can create/approve scripts
- [ ] **Runbook execution via webhook** - Execute script to external endpoint
- [ ] **Runbook workflow trigger** - Add "runbook" action type to workflow builder
- [ ] **Partner account model** - Create partner users with status page access
- [ ] **Partner magic link login** - Email-based authentication for partners
- [ ] **VAPID key implementation** - Production-ready web push
- [ ] **Socket session validation** - Proper auth for real-time
- [ ] **Redis-backed rate limiting** - All API endpoints protected

### Add After Validation (v1.2.x)

- [ ] **Script approval workflow** - Admin review before script activation
- [ ] **Runbook execution callbacks** - Receive status from external systems
- [ ] **Partner invitation flow** - Email invite with setup wizard
- [ ] **Component-level partner access** - Fine-grained visibility control

### Future Consideration (v1.3+)

- [ ] **Sandbox script execution** - Run scripts in isolated environment (major infrastructure)
- [ ] **Partner SSO** - SAML/OIDC for enterprise partners
- [ ] **Multi-audience status pages** - Different views for different partner groups

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| VAPID keys | HIGH | LOW | P1 |
| PWA icons | MEDIUM | LOW | P1 |
| Socket auth fix | HIGH | MEDIUM | P1 |
| Redis rate limiting | HIGH | MEDIUM | P1 |
| Runbook script library | HIGH | MEDIUM | P1 |
| Runbook webhook execution | HIGH | LOW | P1 |
| Runbook workflow action | HIGH | LOW | P1 |
| Partner account model | MEDIUM | MEDIUM | P1 |
| Partner magic link auth | MEDIUM | LOW | P1 |
| Partner access audit | MEDIUM | LOW | P2 |
| Script approval workflow | MEDIUM | MEDIUM | P2 |
| Runbook callbacks | MEDIUM | MEDIUM | P2 |
| Partner invitation flow | LOW | LOW | P2 |
| Webhook signature fixes | MEDIUM | LOW | P1 (if broken) |

**Priority key:**
- P1: Required for v1.2.0 launch
- P2: Add in v1.2.x patch releases

## Competitor Feature Analysis

| Feature | PagerDuty | Statuspage | Our Approach |
|---------|-----------|------------|--------------|
| **Runbook execution** | Requires Runner agent ($), Rundeck integration | N/A | Webhook-based, no agent, built-in library |
| **Script governance** | Managed via external tools | N/A | Integrated approval workflow, version control |
| **Partner status access** | N/A | $300+/month tier for audience-specific | Included in platform, partner accounts |
| **Auth for external users** | N/A | Email verification, SSO at enterprise tier | Magic link (simple), SSO later |
| **Rate limiting** | Enterprise feature | Built-in | Redis-backed, configurable tiers |
| **PWA push** | Native apps preferred | N/A | First-class PWA with proper VAPID |

**Key Competitive Insights:**

1. **Runbook without agents:** PagerDuty requires Runner installation; PageFree uses webhooks to existing tools
2. **Integrated script governance:** Competitors require external script repos; PageFree has built-in library
3. **Partner access included:** Statuspage charges $300+/month; PageFree includes in platform
4. **Simpler partner auth:** Magic link avoids password management complexity

## Sources

**High Confidence (Official Documentation):**
- PagerDuty Automation Actions: https://support.pagerduty.com/docs/automation-actions
- Atlassian Statuspage pricing/features: https://www.atlassian.com/software/statuspage
- Azure Automation Runbooks: https://learn.microsoft.com/en-us/azure/automation/automation-runbook-execution
- Rundeck Documentation: https://docs.rundeck.com/docs/
- MDN Web Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- web.dev Push Notifications: https://web.dev/articles/push-notifications-overview
- Socket.IO CORS/Auth: https://socket.io/docs/v4/handling-cors/

**Medium Confidence (Industry Patterns):**
- PagerDuty Platform: https://www.pagerduty.com/platform/automation/
- Rundeck Runbook Automation marketing: https://www.rundeck.com/runbook-automation
- Google SRE on runbooks: https://sre.google/sre-book/accelerating-sre-on-call/
- PagerDuty runbook definition: https://www.pagerduty.com/resources/learn/what-is-a-runbook/

**Codebase Analysis:**
- Existing workflow system: `/Users/tvellore/work/pagefree/src/services/workflow/`
- Status page implementation: `/Users/tvellore/work/pagefree/src/services/statusPage.service.ts`
- Push service: `/Users/tvellore/work/pagefree/src/services/push.service.ts`
- Socket implementation: `/Users/tvellore/work/pagefree/src/lib/socket.ts`
- Rate limiter: `/Users/tvellore/work/pagefree/src/middleware/rateLimiter.ts`
- Prisma schema: `/Users/tvellore/work/pagefree/prisma/schema.prisma`

---
*Feature research for: PageFree OnCall Platform v1.2 Production Readiness*
*Researched: 2026-02-08*
