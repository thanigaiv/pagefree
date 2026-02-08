# Project Research Summary

**Project:** Service Catalog for OnCall Platform
**Domain:** Incident Management / Service Catalog Integration
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

Service Catalog transforms PageFree from team-centric to service-centric incident management. Research shows this is a well-established pattern in incident management platforms (PagerDuty, Opsgenie, Backstage), with clear best practices and known pitfalls. The existing PageFree stack is remarkably well-suited for this addition: React Flow and dagre are already installed for dependency visualization, PostgreSQL with Prisma handles graph relations efficiently via self-referential models and recursive CTEs, and Zod provides schema validation for compliance standards.

The critical architectural shift is moving from "Alert → Team → Escalation Policy" to "Alert → Service (via routing_key) → Team → Escalation Policy." This change must be implemented with backward compatibility as the top priority—forcing all alerts to require a Service will break existing integrations during production emergencies. The biggest risks are the big bang migration trap (addressed by maintaining fallback routing), circular dependency graphs (addressed by cycle detection on creation), and N+1 query performance (addressed by batch loading and caching strategies).

The recommended approach is incremental: build the Service model with optional ownership first, add service-based routing as an enhancement layer over existing team routing, implement dependency tracking with cycle detection from day one, and progressively add advanced features like compliance scorecards and cascade notifications. This approach delivers value quickly while avoiding the common pitfall of breaking existing functionality during migration.

## Key Findings

### Recommended Stack

**No major additions needed** — the existing PageFree stack already includes the critical technologies for Service Catalog. The only change required is upgrading `dagre@0.8.5` to the actively maintained `@dagrejs/dagre@2.0.0` fork.

**Core technologies:**
- **React Flow (@xyflow/react 12.10.0)**: Already installed — industry standard for dependency graph visualization (4.1M weekly downloads, used by Stripe/Zapier)
- **@dagrejs/dagre 2.0.0**: Upgrade from dagre 0.8.5 — provides hierarchical graph layout with active maintenance
- **PostgreSQL + Prisma 6.0**: Already installed — self-referential relations handle service dependencies without requiring a graph database; recursive CTEs efficiently traverse graphs up to ~10k services
- **Zod 4.3.0**: Already installed — TypeScript-first validation framework ideal for composable service compliance standards
- **BullMQ 5.67.3**: Already installed — background job processing for cascade status calculations when dependencies change
- **Socket.io 4.8.3**: Already installed — real-time status propagation for dependency graph updates

**Critical decision: No graph database needed.** Research confirms PostgreSQL handles service catalog scale efficiently. Neo4j or graph extensions would add operational complexity without meaningful benefit at expected scale (100s to low 1000s of services). Recursive CTEs provide sub-200ms graph traversal for 1000+ service graphs with proper indexing.

**What to avoid:**
- Neo4j / Graph databases (operational overhead, not needed at this scale)
- D3-Force layouts (unpredictable positioning confuses users)
- ELK.js for initial implementation (800kb bundle, dagre sufficient)
- Separate graph database (creates dual source-of-truth problem)

### Expected Features

Research shows clear feature tiers based on PagerDuty, Opsgenie, Backstage, and Atlassian Compass patterns.

**Must have (table stakes):**
- Service CRUD with team ownership — users expect basic service registry
- Service directory with search/filter — users need to discover services
- Technical service dependencies (manual) — users expect "depends on" modeling
- Dependency visualization (basic tree/graph) — users expect to see upstream/downstream
- Service-level incident routing — alerts route via service to team's policy
- Service status indicator — show if service has active incidents
- Runbook + communication links — essential context for responders (Slack channels, docs URLs)
- Basic metadata storage — description, tags, external IDs

**Should have (competitive advantage):**
- Business services with status rollup — non-technical users need "Checkout" not "cart-api + payments-api"
- Service standards/compliance dashboard — define "good service" criteria, track conformance (PagerDuty charges extra for this)
- Cascade impact analysis — "If service X fails, these 15 services are affected"
- Cascade notifications — auto-notify owners of dependent services when upstream fails
- Context hub (unified view) — one page with runbooks, channels, recent incidents, on-call
- Service health score — composite metric: incidents/week, MTTR, compliance score

**Defer (v2+):**
- Automated dependency suggestions — ML-based "services that alert together are likely related" (high complexity)
- Auto-populate from integrations — create services from DataDog/NewRelic service names
- Deep status page integration — bidirectional sync between services and status pages
- Service templates — pre-configured types (API, Database, Frontend)

**Anti-features (commonly requested but problematic):**
- Automatic dependency discovery — requires distributed tracing, often inaccurate
- Real-time graph updates — WebSocket complexity for rarely-changing data
- Full CMDB capabilities — scope creep into infrastructure management
- Service versioning — most services don't version this way, adds confusion

### Architecture Approach

Service Catalog is an **additive layer** over existing architecture, not a replacement. The core pattern is service-based routing with team-based fallback.

**Current flow:** Webhook → Integration → Alert → Deduplication → Team (via TeamTag) → Escalation Policy → Incident

**New flow:** Webhook → Integration → Service (via routing_key) → Team → Escalation Policy → Incident (with fallback to TeamTag if no Service match)

**Major components:**

1. **Service Model** — Technical service entity with unique `routingKey`, `owningTeamId`, optional `escalationPolicyId` override. Uses self-referential `ServiceDependency` for graph edges.

2. **BusinessService Model** — Aggregation of technical services for executive view. Status computed from supporting service states.

3. **ServiceRoutingService** — Routes alerts by extracting `routing_key` from payload, matching to Service, falling back to existing TeamTag routing if no match. Ensures backward compatibility.

4. **DependencyGraphService** — Graph traversal using in-memory DFS with visited set for small-scale (100-500 services), recursive CTEs for larger scale. Computes cascade status by checking incidents on critical dependencies.

5. **CascadeNotificationService** — When service has incident, finds all dependent services (max depth 2, critical only), notifies owning teams of potential impact.

**Integration points with existing features:**
- Incidents gain optional `serviceId` FK (nullable for migration)
- Alerts gain optional `serviceId` FK linked during routing
- StatusPageComponent gains `serviceId` FK (keeps legacy `serviceIdentifier` for migration)
- EscalationPolicy gains `services` relation (Service can override Team default)
- Workflows gain service context for filtering triggers by service tier/metadata

**Critical architectural decisions:**
- **Single source of truth:** Service.routingKey is canonical identifier, not name-based matching
- **Fallback routing:** Service routing enhances but never breaks existing TeamTag routing
- **Policy precedence:** Service-level policy > Team default policy (clear, documented)
- **Cycle detection:** Validate on every dependency create/update, reject cycles immediately
- **Depth limits:** Graph traversal max 10 levels to prevent infinite loops
- **Caching strategy:** Cache dependency graphs in Redis with TTL, invalidate on changes (100+ services)

### Critical Pitfalls

Research identified 8 critical pitfalls from Backstage migrations, PagerDuty implementations, and PageFree codebase analysis.

1. **Big Bang Migration of Alert Routing** — Breaking change: forcing all alerts to require a Service breaks existing integrations during production emergencies. **Solution:** Build service routing as optional enhancement layer with fallback to TeamTag routing. Route priority: explicit Service ID > Service name match > TeamTag (legacy) > Integration default.

2. **Circular Service Dependencies** — Service A → B → C → A creates infinite loops in status cascade. **Solution:** Cycle detection with DFS on every dependency create/update, reject relationships that would create cycles, max traversal depth of 10 levels.

3. **N+1 Query Performance on Cascade Status** — Computing status for service with 50 dependencies × 10 subdependencies = 500+ queries. **Solution:** Batch load entire subgraph with recursive CTEs (2-3 queries total), cache computed status in Redis with TTL, background worker updates on incident changes.

4. **Service Sprawl and Orphan Services** — Teams create 500+ services, many without owners or duplicates. **Solution:** Require `owningTeamId` on creation (not optional), lifecycle states (DRAFT/ACTIVE/DEPRECATED/ARCHIVED), usage tracking (incident count), orphan detection job (flag services with no incidents in 90 days).

5. **Standards Compliance Without Enforcement** — Scorecards show 80% non-compliance but no consequences. **Solution:** Graduated enforcement (warnings → soft blocks → hard blocks), actionable requirements (each scorecard item has fix action), compliance in postmortem data, team trend dashboards.

6. **Breaking Existing Escalation Policy References** — Service-level policies conflict with Team policies. **Solution:** Clear precedence (Service policy > Team policy), explicit inheritance flag (`policyInheritance: 'TEAM' | 'SERVICE'`), default new services to inherit Team policy.

7. **Status Page Component-Service Mismatch** — Existing `serviceIdentifier` (string) conflicts with new `serviceId` (FK). **Solution:** Add `serviceId` FK while keeping legacy field, resolution order (check FK first, fall back to string match), migration script to populate FKs, log usage of legacy path with deprecation timeline.

8. **Incident-Service Attribution After Migration** — Historical incidents have no `serviceId`, analytics show artificially low counts. **Solution:** Add `serviceId` as nullable FK, best-effort backfill via `fingerprint` patterns and `metadata.service`, analytics explicitly handle null values, dashboard shows "Unattributed" category.

**Performance traps at scale:**
- Recursive status propagation → use batch load with recursive CTEs (breaks at >50 services with >5 dependencies)
- No index on `serviceId` FK → add composite index `(serviceId, status, createdAt)` (breaks at >10k incidents/service)
- Synchronous status propagation → background job for cascade updates (breaks at >100 dependents)
- Full graph load for visualization → paginated API, load on-demand (breaks at >200 services)

## Implications for Roadmap

Based on combined research, clear phase dependencies emerge from the architecture. Build order must respect these constraints to avoid rework.

### Phase 1: Service Model Foundation

**Rationale:** Service and dependency models are the foundation for everything else. Must exist before routing, status computation, or compliance can reference them. Critical to build with backward compatibility from day one.

**Delivers:**
- Service model with required `owningTeamId`, unique `routingKey`, optional `escalationPolicyId`
- BusinessService model for service grouping
- ServiceDependency model with cycle detection
- Service CRUD API routes with ownership validation
- Lifecycle states (DRAFT/ACTIVE/DEPRECATED/ARCHIVED)
- Migration for nullable `serviceId` on Incident and Alert models

**Addresses (from FEATURES.md):**
- Service CRUD (P1 table stakes)
- Team ownership (P1 table stakes)
- Basic metadata storage (P1 table stakes)

**Avoids (from PITFALLS.md):**
- Service Sprawl (require ownership from day one)
- Incident Attribution (design backfill strategy before migration)
- Escalation Policy Conflicts (define precedence rules in schema)

**Research flag:** Standard patterns, skip deep research. Prisma schema design is well-documented, self-referential relations have clear examples.

### Phase 2: Service Dependencies & Graph

**Rationale:** Dependency tracking must be robust before building status propagation or cascade notifications on top. Cycle detection and performance optimization are critical—cannot be retrofitted later without schema changes.

**Delivers:**
- Dependency API routes (add/remove/list dependencies)
- DependencyGraphService with cycle detection
- Graph traversal with depth limits (getDependents, getDependencies)
- Recursive CTE queries for batch loading
- Dependency visualization UI (React Flow + dagre integration)
- Migration to upgrade dagre → @dagrejs/dagre

**Uses (from STACK.md):**
- @xyflow/react 12.10.0 (already installed)
- @dagrejs/dagre 2.0.0 (upgrade from 0.8.5)
- PostgreSQL recursive CTEs for graph queries
- TanStack Query for caching dependency graphs

**Implements (from ARCHITECTURE.md):**
- DependencyGraphService component
- Cycle detection on relationship creation
- Batch graph loading with recursive CTEs

**Avoids (from PITFALLS.md):**
- Circular Dependencies (cycle detection from day one)
- N+1 Query Performance (batch loading with CTEs)

**Research flag:** May need graph visualization research for optimal UI patterns. React Flow + dagre integration patterns are well-documented, but complex edge routing may need deeper investigation during implementation.

### Phase 3: Service-Based Alert Routing

**Rationale:** Core value proposition—alerts route via services instead of fragile TeamTag matching. Must maintain backward compatibility to avoid breaking existing integrations during production incidents.

**Delivers:**
- ServiceRoutingService with fallback logic
- routing_key extraction from alert payloads (support multiple field names)
- Modified deduplicationService to use service routing
- Service-aware incident creation (link serviceId)
- Integration model enhancement (defaultServiceId)

**Uses (from STACK.md):**
- Existing Prisma models (Alert, Incident, Integration)
- Existing routing.service.ts as fallback

**Implements (from ARCHITECTURE.md):**
- ServiceRoutingService component
- Alert routing flow with service-first, team-fallback logic
- Incident-Service attribution during creation

**Avoids (from PITFALLS.md):**
- Big Bang Migration (fallback routing ensures legacy path works)
- Incident Attribution (serviceId linked during incident creation going forward)

**Research flag:** Standard patterns, skip deep research. Alert routing enhancement follows established patterns from existing code.

### Phase 4: Status Page Integration & Cascade Status

**Rationale:** Status pages and cascade status depend on having services with incidents linked. Business service status rollup requires technical service status computation. Must handle migration from string-based serviceIdentifier to FK-based linking.

**Delivers:**
- StatusPageComponent migration (add serviceId FK, keep legacy field)
- Modified statusComputationService for service-based status
- Cascade status computation (check incidents on dependencies)
- Business service status rollup (compute from technical services)
- Migration script to backfill serviceId from serviceIdentifier

**Uses (from STACK.md):**
- Existing StatusPage models
- DependencyGraphService (from Phase 2)

**Implements (from ARCHITECTURE.md):**
- Modified statusComputationService
- Cascade status computation with dependency awareness

**Avoids (from PITFALLS.md):**
- Status Page Component-Service Mismatch (dual resolution with migration path)
- N+1 Query Performance (leverage Phase 2 batch loading)

**Research flag:** Standard patterns, skip deep research. Status computation patterns exist in current codebase.

### Phase 5: Cascade Notifications & Context Hub

**Rationale:** Advanced features that deliver competitive advantage. Cascade notifications require dependency graph and incident linking (Phases 2-3). Context hub aggregates data from multiple sources, requires all prior phases to be valuable.

**Delivers:**
- CascadeNotificationService (notify dependent service owners)
- Notification templates for dependency impact alerts
- Workflow integration with service context
- Context hub UI (unified service detail page)
- Service detail page showing incidents, dependencies, on-call, runbooks

**Uses (from STACK.md):**
- BullMQ for background cascade notification jobs
- Socket.io for real-time status updates
- Existing Workflow system for notification delivery

**Implements (from ARCHITECTURE.md):**
- CascadeNotificationService component
- Workflow integration with service metadata

**Addresses (from FEATURES.md):**
- Cascade impact analysis (P2 competitive advantage)
- Cascade notifications (P2 competitive advantage)
- Context hub (P2 competitive advantage)

**Research flag:** May need notification UX research. Determining optimal notification frequency and content for cascade alerts requires user feedback.

### Phase 6: Service Standards & Compliance

**Rationale:** Governance features are valuable but not required for core functionality. Can be built incrementally after service catalog is operational. Requires services to have sufficient data for meaningful compliance checks.

**Delivers:**
- ServiceStandard model (define compliance requirements)
- Compliance validation using Zod schemas
- Compliance scorecard computation (background job)
- Compliance dashboard UI
- Enforcement hooks (advisory warnings initially)

**Uses (from STACK.md):**
- Zod 4.3.0 for composable validation schemas
- BullMQ for background compliance checks

**Addresses (from FEATURES.md):**
- Service standards (P2 competitive advantage)
- Compliance dashboard (P2 competitive advantage)
- Service health score (P3 future consideration)

**Avoids (from PITFALLS.md):**
- Standards Without Enforcement (build enforcement hooks from start, even if advisory-only)

**Research flag:** May need compliance framework research. Determining optimal compliance categories and scoring algorithms may benefit from reviewing Backstage Scorecards and PagerDuty Service Standards patterns.

### Phase Ordering Rationale

**Why this order:**
1. **Foundation first (Phase 1)**: Cannot route to services that don't exist. Cannot link incidents without serviceId field.
2. **Dependencies before status (Phase 2 → 4)**: Cascade status computation requires dependency graph. Building status first would require rework.
3. **Routing before notifications (Phase 3 → 5)**: Cascade notifications require incidents linked to services. Building notifications first has no incidents to notify about.
4. **Compliance last (Phase 6)**: Requires operational service catalog with data. Building compliance first has no services to validate.

**How this avoids pitfalls:**
- Building backward compatibility in Phase 1 prevents big bang migration trap
- Cycle detection in Phase 2 prevents circular dependencies from being created
- Batch loading in Phase 2 prevents N+1 queries in Phase 4
- Ownership requirement in Phase 1 prevents service sprawl
- Migration strategy in Phase 4 prevents status page mismatch

**Grouping rationale:**
- Phases 1-3 deliver core service catalog value (routing works, incidents link to services)
- Phases 4-5 deliver advanced features (cascade awareness, notifications)
- Phase 6 delivers governance (compliance, standards)

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Dependencies & Graph)**: Graph visualization UI patterns—React Flow has many layout options, may need research on optimal visualization for service dependencies vs. generic node graphs. **Effort: 1-2 hours** to review React Flow documentation and examples.
- **Phase 5 (Cascade Notifications)**: Notification UX patterns—determining optimal frequency, grouping, and content for cascade alerts. **Effort: 2-3 hours** to review notification best practices and potentially interview users.
- **Phase 6 (Standards & Compliance)**: Compliance framework design—reviewing Backstage Scorecards and PagerDuty Service Standards for optimal category/scoring model. **Effort: 2-3 hours** to analyze competitor compliance features.

**Phases with well-documented patterns (skip research-phase):**
- **Phase 1 (Foundation)**: Prisma self-referential relations are standard, migration patterns are documented
- **Phase 3 (Routing)**: Alert routing enhancement follows existing codebase patterns
- **Phase 4 (Status Integration)**: Status computation patterns exist in current code

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Existing PageFree stack already includes all critical technologies. Only change needed is dagre upgrade. Stack decisions verified against official docs and package.json. |
| Features | **MEDIUM-HIGH** | Feature prioritization based on PagerDuty, Opsgenie, Backstage, Atlassian Compass patterns. MVP features (P1) have high confidence from multiple sources. P2 features have medium confidence—valuable but need user validation. |
| Architecture | **HIGH** | Architecture patterns verified against existing PageFree codebase (schema.prisma, routing.service.ts, deduplication.service.ts). Service-based routing is proven pattern in incident management domain. |
| Pitfalls | **HIGH** | Pitfalls identified from three sources: Backstage migration experiences (documented issues), competitor analysis (PagerDuty/Opsgenie patterns), and PageFree codebase analysis (existing routing fragility, TeamTag string matching). |

**Overall confidence:** **HIGH**

This is a well-trodden domain with clear best practices. The biggest risk is not technical complexity but change management—migrating from team-based to service-based routing without breaking existing workflows.

### Gaps to Address

**Gap: Historical incident backfill accuracy**
- **Issue:** Current incidents route via TeamTag or metadata.service (string matching). Backfilling serviceId requires inferring service from fingerprint patterns or metadata.
- **Mitigation:** Best-effort backfill with manual audit of sample. Accept that some historical incidents will remain unattributed. Dashboard must handle null serviceId gracefully.
- **When to address:** Phase 1 migration—write backfill script, run in staging, audit sample of 100 incidents.

**Gap: Optimal dependency graph visualization**
- **Issue:** React Flow supports multiple layout algorithms (dagre, ELK, D3). Research provides high-level recommendations but specific UI patterns for service dependencies may need experimentation.
- **Mitigation:** Start with dagre hierarchical layout (recommended by research). Add user testing during Phase 2 to validate visualization approach.
- **When to address:** Phase 2 implementation—build basic visualization, gather feedback, iterate if needed.

**Gap: Compliance scorecard weighting**
- **Issue:** Research identifies compliance categories (documentation, alerting, monitoring, security) but optimal weighting for "service health score" requires domain expertise.
- **Mitigation:** Start with equal weighting, make configurable. Gather feedback from users on which compliance checks matter most.
- **When to address:** Phase 6 implementation—build basic scoring, add configuration UI, iterate based on usage.

**Gap: Cascade notification frequency**
- **Issue:** Research shows cascade notifications are valuable but doesn't specify optimal notification strategy (immediate vs. batched, all dependents vs. critical-only).
- **Mitigation:** Start conservative (critical dependencies only, immediate notification to team admins). Add configuration options based on feedback.
- **When to address:** Phase 5 implementation—build basic notification, monitor for alert fatigue, add throttling if needed.

## Sources

### Primary (HIGH confidence)
- **PageFree codebase**: `/Users/tvellore/work/pagefree/prisma/schema.prisma` (existing models, routing patterns, current limitations)
- **PageFree routing logic**: `/Users/tvellore/work/pagefree/src/services/routing.service.ts` (TeamTag matching, fallback logic)
- **PageFree deduplication**: `/Users/tvellore/work/pagefree/src/services/deduplication.service.ts` (incident creation flow)
- **PageFree status computation**: `/Users/tvellore/work/pagefree/src/services/statusComputation.service.ts` (existing patterns for status from incidents)
- **React Flow official docs**: https://reactflow.dev — v12.10.0 features, dagre integration patterns
- **PostgreSQL 16 docs**: Recursive CTE syntax, CYCLE detection
- **Prisma docs**: Self-referential relations, TypedSQL for raw queries
- **Zod 4 official docs**: https://zod.dev — schema composition, TypeScript integration
- **DagreJS GitHub**: v2.0.0 release notes (Nov 2025), ES module support

### Secondary (MEDIUM confidence)
- **PagerDuty Service Directory**: https://support.pagerduty.com/main/docs/service-directory — feature catalog, API patterns
- **PagerDuty Service Profile**: https://support.pagerduty.com/main/docs/service-profile — context hub patterns
- **PagerDuty Business Services**: https://support.pagerduty.com/main/docs/business-services — aggregation model
- **PagerDuty Service Dependencies**: https://support.pagerduty.com/main/docs/service-dependencies — dependency graph patterns
- **PagerDuty Service Standards**: https://support.pagerduty.com/docs/service-standards — compliance scorecard patterns
- **Opsgenie Service API**: https://docs.opsgenie.com/docs/service-api — service-team relationship model
- **Backstage Software Catalog**: https://backstage.io/docs/features/software-catalog/ — entity model, dependsOn relations, ownership patterns
- **Atlassian Compass**: https://www.atlassian.com/software/compass — service catalog patterns, scorecards
- **Cortex Service Catalog**: https://www.cortex.io/products/service-catalog — competitive feature analysis

### Tertiary (LOW confidence)
- **Google SRE Workbook**: https://sre.google/workbook/on-call/ — service ownership principles (general guidance, not product-specific)
- **Grafana OnCall documentation**: https://grafana.com/docs/oncall/latest/configure/integrations/ — integration patterns (useful for reference, different architecture)

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
