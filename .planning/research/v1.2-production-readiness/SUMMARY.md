# Research Summary: v1.2 Production Readiness

**Milestone:** v1.2 - Production Readiness
**Features:** Runbook Automation, Partner Status Pages
**Researched:** 2026-02-08
**Overall Confidence:** HIGH

## Executive Summary

v1.2 production readiness requires minimal stack additions. The existing infrastructure handles 90% of requirements. Two targeted additions are needed:

1. **vm2 + piscina** for secure runbook execution
2. **jose** for JWT-based partner authentication

The existing BullMQ worker infrastructure, Passport auth, and status page system provide solid foundations. New features integrate cleanly without architectural changes.

## Key Findings

**Stack:** Add vm2 (sandbox), piscina (worker pool), jose (JWT). Total 3 new packages.

**Architecture:** Runbooks execute in BullMQ workers with vm2 sandbox + piscina isolation. Partner auth uses JWT middleware alongside existing Passport.

**Critical Pitfall:** vm2 is NOT immune to sandbox escapes. Pre-approval workflow is mandatory security control.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Runbook Foundation
**Duration:** 1-2 weeks
**Rationale:** Database models and execution engine first, before triggers.

Build:
- Runbook and RunbookExecution Prisma models
- vm2 + piscina execution service
- Admin CRUD routes for runbooks
- Approval workflow (requires PLATFORM_ADMIN)

Addresses:
- Secure script storage (database, not filesystem)
- Execution isolation (piscina worker threads)
- Audit logging (existing AuditEvent model)

Avoids:
- Filesystem security issues
- Main thread blocking from runaway scripts

### Phase 2: Runbook Triggers
**Duration:** 1 week
**Rationale:** Hook into existing incident/workflow system.

Build:
- Incident trigger integration (on create, on state change)
- BullMQ job for async execution
- Real-time status via Socket.io
- Execution history UI

Addresses:
- Automated remediation on incident
- Non-blocking execution
- Visibility into runbook results

Avoids:
- Blocking incident pipeline
- Missing execution visibility

### Phase 3: Partner Status Pages
**Duration:** 1-2 weeks
**Rationale:** Simpler feature, builds on existing status page infrastructure.

Build:
- PartnerAccess model and admin CRUD
- jose JWT middleware for /api/status routes
- Token generation and revocation
- Partner usage tracking

Addresses:
- External authenticated access
- Token lifecycle management
- Audit trail for partner access

Avoids:
- Overcomplicating with OAuth
- Exposing internal endpoints to partners

### Phase 4: Polish and Security
**Duration:** 1 week
**Rationale:** Hardening before production release.

Build:
- Rate limiting for runbook execution
- Partner access monitoring dashboard
- Security audit of vm2 sandbox config
- Documentation for ops team

Addresses:
- Runbook abuse prevention
- Partner access visibility
- Production security baseline

**Phase ordering rationale:**
1. Runbook execution needs database + execution engine before triggers
2. Triggers depend on Phase 1's execution infrastructure
3. Partner pages are independent, can parallel with Phase 2
4. Security hardening as final pass before release

**Research flags for phases:**
- Phase 1: Standard patterns, vm2 docs sufficient
- Phase 2: May need research on BullMQ job chaining if complex trigger logic needed
- Phase 3: Standard JWT patterns, no special research
- Phase 4: May need security review of vm2 sandbox escapes

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | vm2, piscina, jose all verified on npm registry |
| Architecture | HIGH | Builds on existing BullMQ/Workflow patterns |
| Security | MEDIUM | vm2 has known escape vectors; pre-approval is critical control |
| Integration | HIGH | Minimal changes to existing code paths |

## Gaps to Address

- **vm2 sandbox escapes:** Monitor vm2 GitHub for security advisories
- **Partner token rotation:** Consider adding automatic rotation in future milestone
- **Runbook templates:** May want pre-built runbooks for common scenarios (not v1.2 scope)
- **Runbook secrets:** How runbooks access service credentials (deferred to implementation)

## What Was NOT Researched (Intentionally)

- **Existing stack components:** Express, Prisma, BullMQ, React, etc. already documented in main STACK.md
- **Container-based execution:** Explicitly out of scope for v1.2; consider for v2.0
- **Full OAuth for partners:** Determined to be overkill; JWT sufficient
- **Public status pages:** Different from partner pages; current token approach works

---

*Research summary for: PageFree v1.2 - Production Readiness*
*Researched: 2026-02-08*
