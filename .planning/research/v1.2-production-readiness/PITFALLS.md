# Domain Pitfalls: v1.2 Production Readiness

**Milestone:** v1.2 - Production Readiness
**Features:** Runbook Automation, Partner Status Pages, Production Hardening
**Researched:** 2026-02-08
**Confidence:** HIGH (codebase analysis + security patterns + prior research)

---

## Critical Pitfalls

### Pitfall 1: Runbook Command/Code Injection

**What goes wrong:**
Runbooks receive incident context (title, description, metadata). If template variables are interpolated into code/commands without sanitization, attackers can inject malicious code via alert payloads.

Example: Alert title `"; process.exit(1); "` embedded in script string breaks execution.

**Why it happens:**
- vm2 sandbox protects against some attacks but not all
- Developers trust incident data from "internal" monitoring tools
- Handlebars templates safe for HTML, not for code
- Prototype pollution and edge cases in JavaScript create escape vectors

**Consequences:**
- Arbitrary code execution (if sandbox escape)
- Data exfiltration via runbook output
- Infrastructure compromise

**Prevention:**
1. **Pre-approval workflow mandatory**: Only PLATFORM_ADMIN can approve runbooks
2. **Parameterized input**: Pass incident data as JSON argument, never interpolate into script strings
3. **vm2 hardening**: Configure `eval: false, wasm: false, console: 'redirect'`
4. **Piscina isolation**: Even if sandbox escapes, damage limited to worker thread
5. **Network restrictions**: Whitelist-only HTTP access from runbooks
6. **No filesystem access**: Scripts cannot touch filesystem

**Warning signs:**
- Runbook scripts contain string concatenation with `context.incident.*`
- No input validation layer between trigger and execution
- Worker crashes correlate with specific incident patterns

**Phase to address:**
Phase 1 (Runbook Model) - Pre-approval architecture and vm2 security config MUST be established before any execution code is written.

---

### Pitfall 2: Partner Token Leakage via URL and Logs

**What goes wrong:**
Partner status page tokens exposed through:
- Browser history (query param `?token=xxx` visible to anyone with device access)
- Server access logs (rotated to cold storage without scrubbing)
- Analytics platforms (tracking scripts capture full URL)
- Referrer headers (leaked to third-party resources)

Current `statusPublic.routes.ts` uses query params: `const { token } = req.query`

**Why it happens:**
Query parameters are simplest to implement. Existing pattern works but creates security debt that compounds as partner base grows.

**Consequences:**
- Unauthorized access to private status pages
- Competitive intelligence exposure
- Compliance violations (data breach if partner info on page)

**Prevention:**
1. **Authorization header only**: Use `Authorization: Bearer <token>` or custom `X-Status-Token` header
2. **Cookie-based sessions**: After initial validation, issue httpOnly session cookie
3. **Token hashing in DB**: Store only SHA-256 hash, not plaintext
4. **Log scrubbing**: Redact token parameters before storage
5. **Referrer-Policy header**: Set `no-referrer` on partner pages
6. **Short expiry for sensitive pages**: 30 days instead of 90 for critical pages

**Warning signs:**
- Token parameter visible in server access logs
- Support tickets about "someone accessed my status page"
- Long-lived tokens without rotation reminders

**Phase to address:**
Phase 2 (Partner Status Pages) - Token handling MUST move to headers/cookies BEFORE partner rollout.

---

### Pitfall 3: Runbook Execution Blocking Incident Response

**What goes wrong:**
Runbook execution consumes resources or blocks queues, degrading the critical incident notification pipeline. If a runbook hangs or a flood of runbooks triggers, escalation notifications stop.

The existing `workflowQueue` and `escalationQueue` share BullMQ infrastructure. Adding runbooks to this pool creates resource contention.

**Why it happens:**
- Code reuse feels efficient - why not use existing queue infrastructure?
- Synchronous execution simpler to implement and debug
- Resource limits not enforced or insufficient

**Consequences:**
- New alerts queue up, escalations delayed
- Engineers not paged during critical incidents
- SLA violations

**Prevention:**
1. **Separate queue**: Create `runbookQueue` with independent Redis connection and workers
2. **Fire-and-forget pattern**: Incident creation returns immediately, runbook executes async
3. **Hard resource limits**: Max 30s execution (configurable to 5min), auto-termination
4. **Concurrency cap**: Max 4 concurrent runbooks per server
5. **Circuit breaker**: If failure rate > 50%, pause team's runbook auto-triggering
6. **Priority ordering**: Escalation queue always processed before runbook queue

**Warning signs:**
- Incident acknowledgement latency increases after enabling runbooks
- Escalation jobs show "waiting" while runbook jobs are "active"
- BullMQ queue depth growing during incident storms

**Phase to address:**
Phase 1 (Runbook Infrastructure) - Queue isolation architecture required before implementation.

---

### Pitfall 4: Breaking Existing Workflow System with Runbook Coupling

**What goes wrong:**
Adding runbook execution as a workflow action type couples systems inappropriately. A bug in runbook code crashes workflow worker, breaking Jira/Linear ticket creation.

Current `workflow-executor.service.ts` has clean discriminated union: `WebhookActionData | JiraActionData | LinearActionData`. Adding `RunbookActionData` is the wrong approach.

**Why it happens:**
- Workflow system already handles execution, retries, state persistence
- Adding "one more action type" seems like minimal change
- Code reuse prioritized over system boundaries

**Consequences:**
- Runbook failure can cascade to workflow failures
- Debugging complexity increases
- Workflow execution metrics polluted by runbook data

**Prevention:**
1. **Runbooks are NOT workflow actions**: Keep as separate first-class entities
2. **Trigger integration only**: Workflows can TRIGGER runbooks (fire-and-forget), not embed execution
3. **Separate execution tracking**: `RunbookExecution` table distinct from `WorkflowExecution`
4. **Different failure semantics**: Workflow failures stop execution; runbook failures isolated and logged
5. **No shared workers**: Runbook queue workers never process workflow jobs

**Warning signs:**
- PR adds `'runbook'` to `ActionType` union in `types/workflow.ts`
- Single worker processes both workflow and runbook jobs
- Runbook state stored in `WorkflowExecution.completedNodes`

**Phase to address:**
Phase 1 (Runbook Model) - Architecture boundary must be documented before implementation.

---

### Pitfall 5: Partner Auth Escalating to Admin Functions

**What goes wrong:**
Partner authentication accidentally grants access to internal admin endpoints. Valid partner token satisfies `req.user` checks, allowing access beyond status page read.

Current system has `requireAuth`, `requireTeamRole`, `requirePlatformAdmin`. Partner tokens need completely separate authentication path.

**Why it happens:**
- Developers add partner validation to existing middleware for "consistency"
- Testing only verifies happy path (correct access works)
- Auth middleware shared between internal and partner routes

**Consequences:**
- Partners can access team settings, incident details, user data
- Security boundary violation
- Compliance failure

**Prevention:**
1. **Separate middleware stack**: `requirePartnerAuth` that ONLY validates partner tokens, never sets `req.user`
2. **Route isolation**: Partner routes in `/partner/` or `/status/` prefix, internal in `/api/`
3. **No session cookies for partners**: Stateless token auth OR separate cookie namespace
4. **Explicit permission checks**: Each handler verifies access type even if middleware passes
5. **Negative testing**: Security tests verify partner tokens CANNOT access admin endpoints

**Warning signs:**
- Partner token grants access to `/api/teams/:teamId/settings`
- Single middleware handles session and token auth
- Partner can see incident details beyond their status page

**Phase to address:**
Phase 2 (Partner Authentication) - Auth architecture review required before implementation.

---

### Pitfall 6: Secrets Exposed in Runbook Execution Logs

**What goes wrong:**
Runbook stdout/stderr captures sensitive data (API keys, passwords, tokens). Logs visible in UI to all team members, violating least-privilege.

Existing `WorkflowActionSecret` stores encrypted secrets, but execution OUTPUT isn't scrubbed.

**Why it happens:**
- Detailed logging essential for debugging runbook failures
- "Log everything" default during development
- Scripts echo environment variables or API responses containing secrets

**Consequences:**
- Credential exposure to all team members
- Audit trail reveals sensitive data
- Compliance violation (secrets in logs)

**Prevention:**
1. **Output sanitization**: Scrub known secret patterns (API keys, tokens) before storage
2. **Output truncation**: Max 10KB stored (prevents data exfiltration via output)
3. **Secret masking**: Track secrets passed to runbook, mask in output
4. **Separate log retention**: Runbook logs with shorter retention, stricter access
5. **Log level controls**: Production defaults to minimal logging

**Warning signs:**
- Runbook logs contain patterns like `sk_live_`, `ghp_`, `Bearer `
- All team members can view runbook execution details
- Execution logs in same table as general audit events

**Phase to address:**
Phase 1 (Runbook Execution) - Log handling design required in implementation.

---

### Pitfall 7: VAPID Keys Shared or Mismanaged

**What goes wrong:**
Same VAPID keys used in development and production, or keys rotated without user re-subscription, breaking push notifications.

Current `push.service.ts` uses environment variables for VAPID configuration.

**Why it happens:**
- VAPID key generation is one-time task, easily forgotten
- Keys copied between environments for "convenience"
- Rotation process not documented or tested

**Consequences:**
- Push notifications sent to wrong users (wrong environment)
- Production keys exposed in development logs
- Notifications silently fail after rotation

**Prevention:**
1. **Environment-specific keys**: Unique key pair per environment, enforced in deployment
2. **Startup validation**: App refuses to start if VAPID key doesn't match environment pattern
3. **Rotation documentation**: Process documented for key rotation (requires user re-subscription)
4. **Key audit**: Log active VAPID key at startup, alert on unexpected values
5. **Graceful degradation**: Handle push failures gracefully, don't crash on invalid keys

**Warning signs:**
- Same `VAPID_PUBLIC_KEY` in staging and production configs
- Push notifications work intermittently
- No documented key rotation process

**Phase to address:**
Phase 3 (Production Hardening) - VAPID key management explicitly in scope.

---

## Moderate Pitfalls

### Pitfall 8: Runbook Execution Order Dependencies

**What goes wrong:**
Multiple runbooks trigger for same incident. Execution order non-deterministic. Runbooks conflict or depend on each other's results.

**Prevention:**
1. v1.2: Single runbook per incident trigger (no chaining)
2. Document that parallel execution is possible
3. Design runbooks to be idempotent
4. Future: Consider priority/ordering for v2.0

---

### Pitfall 9: Partner Access Scope Creep

**What goes wrong:**
Partners request access to multiple status pages, internal dashboards, or write operations. Scope expands beyond original intent.

**Prevention:**
1. Each token scoped to single statusPageId
2. Partner tokens ONLY work on /status/* routes
3. Separate admin decision for expanded access
4. No JWT refresh - partners request new token on expiry

---

### Pitfall 10: BullMQ Queue Backlog from Failed Runbooks

**What goes wrong:**
Many runbooks fail (bad scripts, timeouts). Failed jobs clog retry queue.

**Prevention:**
1. Low retry count (max 2 retries)
2. Separate queue from incident notifications
3. Dead letter queue for manual investigation
4. Circuit breaker at team level

---

### Pitfall 11: Runbook Versioning Confusion

**What goes wrong:**
Admin updates runbook while execution in progress. Unclear which version executed.

**Prevention:**
1. Capture runbook version at execution start
2. Store frozen script in RunbookExecution record
3. UI shows which version ran

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Synchronous runbook execution | Simpler implementation | Blocks alert pipeline | Never |
| Query param tokens for partners | Quick to implement | Token leakage | MVP only, migrate before rollout |
| Runbooks as workflow actions | Code reuse | Coupled failures | Never |
| Shared BullMQ queue for runbooks | Less configuration | Resource contention | Never |
| Single rate limiter for all routes | Less configuration | Partner can exhaust limits | MVP only |
| Token plaintext in DB | Simpler queries | Exposure risk | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| BullMQ (runbooks) | Sharing worker pool with escalations | Dedicated `runbookQueue` with isolated workers |
| Prisma (runbook model) | Adding foreign key to Workflow model | Separate `Runbook` model, trigger relationship only |
| Socket.io (partner updates) | Broadcasting to all connections | Namespace isolation for partner connections |
| Rate limiter | Single limiter for all routes | Separate: internal API, partner API, public status |
| Audit logging | Logging runbook input with incident data | Log IDs only, reference for detail |
| vm2 integration | Default configuration | Security hardened config from docs |
| piscina setup | Unhandled worker crashes | Error handlers, automatic worker restart |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling for runbook status | High DB load | Socket.io push updates | 50+ concurrent executions |
| Loading all subscribers on status change | Memory spike | Paginate, batch notifications | 1000+ subscribers |
| Inline script validation | Slow save | Background validation job | Scripts > 1000 lines |
| Full audit on every runbook | Write amplification | Batch, async logging | 100+ runbooks/minute |
| Token validation hitting DB | Bottleneck | Redis cache (short TTL) | 100+ partner requests/sec |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Scripts in user-editable text | Code injection | Pre-approved scripts, admin-only |
| Tokens in URL path | Log leakage | Header-based auth |
| Runbook runs as app user | Full access | Isolated worker environment |
| Status page exposes internal names | Info disclosure | Abstract component names |
| No execution timeout | Resource exhaustion | Hard timeout with termination |
| Tokens never expire | Permanent access | Expiry + revocation |
| Output not encrypted | Credential exposure | Encrypt logs at rest |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Execution status hidden in logs | Unknown automation state | Real-time status in incident detail |
| Generic "access denied" | Confusion | "Token expired" vs "Invalid token" vs "Not found" |
| No trigger feedback | Multiple triggers | Immediate toast, disable button |
| Stale status cache | Wrong status | Cache timestamp, manual refresh |
| Silent runbook failures | False confidence | Push notification on failure |
| Regen token no warning | Partners locked out | Confirmation with impact |

---

## "Looks Done But Isn't" Checklist

- [ ] **Runbook execution:** Verify timeout actually terminates execution
- [ ] **Partner auth:** Verify partner endpoints have own rate limits
- [ ] **Status tokens:** Verify admins can regenerate tokens
- [ ] **Runbook triggers:** Verify no duplicate triggers for same incident
- [ ] **Partner notifications:** Verify unsubscribe option exists
- [ ] **Runbook audit:** Verify execution records include triggering user/workflow
- [ ] **VAPID keys:** Verify rotation process documented
- [ ] **Partner sessions:** Verify sessions expire (not just tokens)
- [ ] **Runbook secrets:** Verify secrets encrypted at rest
- [ ] **Status cache:** Verify updates propagate to cached pages

---

## Security Checklists

### Runbook Security
- [ ] Pre-approval required (PLATFORM_ADMIN only)
- [ ] vm2 configured: `eval: false, wasm: false, console: 'redirect'`
- [ ] piscina workers isolated from main process
- [ ] Timeout enforced (default 30s, max 5min)
- [ ] Network restricted to whitelist
- [ ] No filesystem access
- [ ] All executions logged to AuditEvent
- [ ] Output truncated (max 10KB)

### Partner Access Security
- [ ] JWT secret minimum 32 bytes
- [ ] Token hash stored, not plaintext
- [ ] Authorization header only (no URL params)
- [ ] Audience and issuer verified
- [ ] Expiry enforced
- [ ] Revocation respected (isActive check)
- [ ] Usage tracked (lastUsedAt, usageCount)
- [ ] All access logged

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Code injection | Phase 1: Runbook Model | Code review: no interpolation |
| Token leakage | Phase 2: Partner Access | Security test: tokens not in history |
| Execution blocking | Phase 1: Infrastructure | Load test: no escalation impact |
| Workflow coupling | Phase 1: Architecture | Review: separate queues |
| Partner escalation | Phase 2: Auth | Pen test: no admin access |
| Secrets in logs | Phase 1: Execution | Audit: no secret patterns |
| VAPID mismanagement | Phase 3: Hardening | Checklist: unique keys |
| Queue backlog | Phase 1: Infrastructure | Load test: failure handling |

---

## Sources

- Codebase analysis: `/Users/tvellore/work/pagefree/src/`
- OWASP REST Security Cheat Sheet
- OWASP Session Management Testing Guide
- vm2 security documentation and CVE history
- BullMQ best practices
- Prior research: v1.2 planning documents

---
*Pitfalls research for: PageFree v1.2 - Production Readiness*
*Researched: 2026-02-08*
