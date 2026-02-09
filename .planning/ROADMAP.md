# Roadmap: OnCall Platform

## Milestones

- [x] **v1.0 MVP** - Phases 1-10 (shipped 2026-02-08)
- [x] **v1.1 Service Catalog** - Phases 11-13 (shipped 2026-02-08) — [See archive](milestones/v1.1-ROADMAP.md)
- [x] **v1.2 Production Readiness** - Phases 14-17 (shipped 2026-02-09) — [See archive](milestones/v1.2-ROADMAP.md)

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

<details>
<summary>v1.2 Production Readiness (Phases 14-17) - SHIPPED 2026-02-09</summary>

See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details.

- 4 phases, 13 plans, 35 commits, 57 minutes execution time
- Production hardening: VAPID keys, PWA icons, Socket.IO auth, Redis rate limiting, WebSocket rate limiting
- Runbook automation: approval workflow, webhook-based execution with BullMQ, workflow integration, manual triggering
- Partner status pages: magic link authentication, separate sessions, access control middleware, admin UI

</details>

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
