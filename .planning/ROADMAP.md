# Roadmap: OnCall Platform

## Milestones

- [x] **v1.0 MVP** - Phases 1-10 (shipped 2026-02-08)
- [x] **v1.1 Service Catalog** - Phases 11-13 (shipped 2026-02-08) — [See archive](milestones/v1.1-ROADMAP.md)
- [ ] **v1.2 Production Readiness** - Phases 14-17 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-10) - SHIPPED 2026-02-08</summary>

See MILESTONES.md for v1.0 completion summary.

- 10 phases, 85 plans, 360 commits
- ~51,000 lines of TypeScript across 281 source files
- Full incident pipeline, multi-channel notifications, scheduling, dashboards, automation, status pages, postmortems

</details>

<details>
<summary>v1.1 Service Catalog (Phases 11-13) - SHIPPED 2026-02-08</summary>

See [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) for full details.

- 3 phases, 6 plans, 17 commits
- Service catalog with team ownership, lifecycle management, and dependency tracking
- Service-based alert routing with backward-compatible TeamTag fallback
- React Flow + dagre dependency graph visualization

</details>

---

## v1.2 Production Readiness (In Progress)

**Milestone Goal:** Make the platform production-ready for team migration while adding runbook automation and partner status page access.

**Target outcomes:**
- Remove production blockers (VAPID keys, Socket auth, rate limiting)
- Enable pre-approved remediation script execution on incident triggers
- Grant authenticated external access to status pages for partners/contractors

**Phases:** 14-17
**Requirements:** 14 requirements across 3 categories

---

### Phase 14: Production Hardening

**Goal:** Complete half-implemented infrastructure and fix production blockers before feature additions.

**Depends on:** Phase 13 (Service Catalog complete)

**Requirements:** HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06

**Success Criteria** (what must be TRUE):
  1. Push notifications deliver with proper VAPID signature verification (not placeholder keys)
  2. PWA icons display correctly when users add app to iOS/Android home screens
  3. Socket.IO connections authenticate against session store and reject invalid/expired sessions
  4. All 10 Phase 2 webhook tests pass with proper signature verification for edge cases
  5. API rate limits enforce across all endpoints and log violations without blocking legitimate webhooks
  6. WebSocket connections rate limit events and disconnect abusive clients with grace warnings

**Plans:** 6 plans

Plans:
- [ ] 14-01-PLAN.md — VAPID key configuration and web-push integration
- [ ] 14-02-PLAN.md — PWA icon assets (PNG conversion, apple-touch-icon)
- [ ] 14-03-PLAN.md — Socket.IO session validation against PostgreSQL
- [ ] 14-04-PLAN.md — Webhook test fixes and timestamp validation
- [ ] 14-05-PLAN.md — Redis-backed API rate limiting
- [ ] 14-06-PLAN.md — WebSocket event rate limiting

**Rationale:** These changes have high risk of breaking existing clients. Must validate in isolation before feature work. VAPID keys, Socket auth, and rate limiting are prerequisites for reliable production operation.

---

### Phase 15: Runbook Automation Foundation

**Goal:** Create pre-approved script library and webhook-based execution infrastructure.

**Depends on:** Phase 14 (production stability established)

**Requirements:** AUTO-07, AUTO-08

**Success Criteria** (what must be TRUE):
  1. Platform admins can create runbook scripts with parameters defined as JSON schema
  2. Platform admins can version runbooks and approve them for production use (only APPROVED runbooks execute)
  3. Runbooks execute by posting to configured webhook endpoints (Ansible Tower, AWS SSM, custom services)
  4. Every runbook execution logs with full audit trail (who triggered, when, parameters used, result payload)
  5. Failed webhook requests retry with exponential backoff (3 retries) before marking execution as FAILED

**Plans:** 2 plans

Plans:
- [ ] 15-01-PLAN.md - Database models and CRUD service with approval state machine
- [ ] 15-02-PLAN.md - REST API routes, webhook executor, and BullMQ queue infrastructure

**Rationale:** Extends existing workflow system with new action type. Workflow infrastructure (triggers, templating, execution tracking) already exists. Lower risk than partner pages because it's internal-only (no auth surface).

---

### Phase 16: Runbook Integration

**Goal:** Integrate runbooks into workflow automation and enable manual triggering from incidents.

**Depends on:** Phase 15 (runbook library and executor functional)

**Requirements:** AUTO-09, AUTO-10

**Success Criteria** (what must be TRUE):
  1. Workflow builder UI includes "runbook" action node that selects from APPROVED runbooks
  2. Workflow executor handles runbook actions by calling runbook-executor service when triggered
  3. Runbook execution logs link to workflow execution logs for traceability
  4. Incident detail page shows "Run Runbook" button that opens modal with runbook selection
  5. Responders can manually trigger runbooks with confirmation dialog and see execution status in incident timeline

**Plans:** 2 plans

Plans:
- [ ] 16-01-PLAN.md - Backend: Workflow types, executor integration, and manual trigger API
- [ ] 16-02-PLAN.md - Frontend: Workflow builder runbook node and incident Run Runbook modal

**Rationale:** Completes runbook automation by connecting to existing trigger points (workflows and manual incident actions). Delivers competitive differentiator against PagerDuty (which requires separate Runner agent).

---

### Phase 17: Partner Status Pages

**Goal:** Enable authenticated external access to status pages for partners and contractors.

**Depends on:** Phase 14 (production security hardened)

**Requirements:** PARTNER-01, PARTNER-02, PARTNER-03, PARTNER-04

**Success Criteria** (what must be TRUE):
  1. Admins can create partner accounts and assign them to specific status pages (scoped access)
  2. Partner users receive magic link emails and log in without passwords (15-minute token expiration)
  3. Partner users see only assigned status pages with components, incidents, and maintenance windows (read-only)
  4. Partner users cannot subscribe to updates, view internal incidents, or access admin functions
  5. All partner access logs to audit system (login, status page view, access denial) with 90-day retention

**Plans:** 3 plans

Plans:
- [ ] 17-01-PLAN.md — Database models (PartnerUser, PartnerSession, PartnerMagicToken) and partner services
- [ ] 17-02-PLAN.md — Partner magic link authentication with parallel session management
- [ ] 17-03-PLAN.md — Partner status page access control, admin UI, and partner frontend

**Rationale:** Adds authentication layer on top of existing status page system. StatusPage model and status computation already exist. Isolated risk—only affects new partner users, doesn't impact internal or existing private pages.

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & User Management | v1.0 | 11/11 | Complete | 2026-02-08 |
| 2. Alert Ingestion & Webhooks | v1.0 | 7/7 | Complete | 2026-02-08 |
| 3. Scheduling System | v1.0 | 7/7 | Complete | 2026-02-08 |
| 4. Alert Routing & Deduplication | v1.0 | 8/8 | Complete | 2026-02-08 |
| 5. Multi-Channel Notifications | v1.0 | 11/11 | Complete | 2026-02-08 |
| 6. Incident Management Dashboard | v1.0 | 11/11 | Complete | 2026-02-08 |
| 7. External Integrations | v1.0 | 6/6 | Complete | 2026-02-08 |
| 8. Automation & Workflows | v1.0 | 8/8 | Complete | 2026-02-08 |
| 9. Status Pages | v1.0 | 9/9 | Complete | 2026-02-08 |
| 10. Postmortems | v1.0 | 7/7 | Complete | 2026-02-08 |
| 11. Service Model Foundation | v1.1 | 2/2 | Complete | 2026-02-08 |
| 12. Service Dependencies Graph | v1.1 | 2/2 | Complete | 2026-02-08 |
| 13. Service-based Alert Routing | v1.1 | 2/2 | Complete | 2026-02-08 |
| 14. Production Hardening | v1.2 | 6/6 | Complete | 2026-02-09 |
| 15. Runbook Automation Foundation | v1.2 | 2/2 | Complete | 2026-02-09 |
| 16. Runbook Integration | v1.2 | 2/2 | Complete | 2026-02-09 |
| 17. Partner Status Pages | v1.2 | 3/3 | Complete | 2026-02-09 |

---

*Roadmap created: 2026-02-08*
*Last updated: 2026-02-09 (Phase 17 complete - milestone v1.2 complete)*
