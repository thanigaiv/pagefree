# Roadmap: OnCall Platform

## Milestones

- [x] **v1.0 MVP** - Phases 1-10 (shipped 2026-02-08)
- [ ] **v1.1 Service Catalog** - Phases 11-13 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-10) - SHIPPED 2026-02-08</summary>

See MILESTONES.md for v1.0 completion summary.

- 10 phases, 85 plans, 360 commits
- ~51,000 lines of TypeScript across 281 source files
- Full incident pipeline, multi-channel notifications, scheduling, dashboards, automation, status pages, postmortems

</details>

### v1.1 Service Catalog (In Progress)

**Milestone Goal:** Centralize service ownership and alert routing through a comprehensive service catalog that serves as the single source of truth for the organization's technical ecosystem. Service-based routing replaces team-based routing with backward compatibility.

**Phase Numbering:**
- Integer phases (11, 12, 13): Planned milestone work
- Decimal phases (11.1, 12.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 11: Service Model Foundation** - Technical services with team ownership and lifecycle management
- [ ] **Phase 12: Service Dependencies & Graph** - Dependency relationships with visualization and cycle detection
- [ ] **Phase 13: Service-Based Alert Routing** - Alerts route through services with team-based fallback

## Phase Details

### Phase 11: Service Model Foundation
**Goal**: Users can create and manage technical services with team ownership, lifecycle states, and optional escalation policy overrides
**Depends on**: Phase 10 (v1.0 complete)
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-06
**Success Criteria** (what must be TRUE):
  1. User can create a technical service with name, description, routing key, and owning team
  2. User can edit service metadata (name, description, tags) after creation
  3. User can archive or deprecate a service and see its lifecycle state reflected in the directory
  4. User can browse service directory and filter by team, status, or search term
  5. Service creation fails if no owning team is specified (required field)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Service Dependencies & Graph
**Goal**: Users can model service dependencies and visualize upstream/downstream relationships with cycle detection preventing invalid configurations
**Depends on**: Phase 11
**Requirements**: DEP-01, DEP-02, DEP-03, DEP-04, DEP-05, DEP-06
**Success Criteria** (what must be TRUE):
  1. User can add a dependency relationship between two services
  2. User can remove an existing dependency relationship
  3. System rejects dependency creation that would form a cycle (error displayed to user)
  4. User can view a visual dependency graph showing service relationships
  5. User can see upstream dependencies (what this service depends on) and downstream dependents (what depends on this service) separately
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

### Phase 13: Service-Based Alert Routing
**Goal**: Alerts route to teams via service routing keys, with backward-compatible fallback to existing TeamTag routing for integrations not yet configured with services
**Depends on**: Phase 12
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05
**Success Criteria** (what must be TRUE):
  1. Alert with routing_key in payload routes to the matching service's owning team
  2. Alert without routing_key (or unmatched) falls back to existing TeamTag routing (no breakage)
  3. Incident created via service routing shows linked service on incident detail page
  4. Integration can specify a default service for alerts that arrive without explicit routing_key
  5. Service-level escalation policy takes precedence over team default policy when configured
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 11 -> 11.1 -> 11.2 -> 12 -> 12.1 -> 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-10 | v1.0 | 85/85 | Complete | 2026-02-08 |
| 11. Service Model Foundation | v1.1 | 0/? | Not started | - |
| 12. Service Dependencies & Graph | v1.1 | 0/? | Not started | - |
| 13. Service-Based Alert Routing | v1.1 | 0/? | Not started | - |

---
*Roadmap created: 2026-02-08*
*Last updated: 2026-02-08*
