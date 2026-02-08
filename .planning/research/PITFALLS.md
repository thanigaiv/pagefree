# Pitfalls Research: Service Catalog for Incident Management

**Domain:** Service Catalog Addition to Existing OnCall Platform
**Researched:** 2026-02-08
**Confidence:** MEDIUM-HIGH

---

## Critical Pitfalls

### Pitfall 1: Big Bang Migration of Alert Routing

**What goes wrong:**
Forcing all existing alerts to require a Service before routing, breaking existing integrations and escalation policies that route via TeamTags or metadata. Legacy alerts fail to route, creating a backlog of unprocessed incidents during production emergencies.

**Why it happens:**
Teams want the "clean" Service-centric model immediately. The current system routes alerts using `metadata.service` matched to `TeamTag` values (see `routing.service.ts:57-73`). A direct replacement breaks the fallback path (`return null` on line 78), causing all alerts without Service assignments to fail routing.

**How to avoid:**
- **Phase 1:** Add Service model as optional, route falls back to existing TeamTag logic
- **Phase 2:** Introduce Service-to-Team mapping with auto-migration
- **Phase 3:** Deprecation warnings for alerts routing via legacy path
- **Phase 4:** Require Service assignment with grace period

Implement routing priority order:
```typescript
// Correct migration order
1. explicit Service ID in alert -> use Service's escalation policy
2. Service name match from metadata -> use matched Service
3. TeamTag match from metadata -> use Team's default policy (legacy)
4. Integration default team -> fallback (current behavior)
```

**Warning signs:**
- Routing failures spike after deployment
- Alerts stuck in "pending routing" state
- Teams reporting missed notifications for legacy integrations
- `No team found for alert routing` errors in logs

**Phase to address:**
Phase 1 (Service Model Foundation) - Build with backward compatibility from day one

---

### Pitfall 2: Circular Service Dependencies

**What goes wrong:**
Service A depends on Service B, which depends on Service C, which depends on Service A. Status cascade algorithms enter infinite loops, cascade status computations never complete, or the system crashes with stack overflow. Dependency graphs become impossible to visualize or reason about.

**Why it happens:**
No validation when creating dependency relationships. The Backstage catalog model allows `dependsOn`/`dependencyOf` relations without cycle detection. Developers model actual runtime dependencies without considering status propagation implications.

**How to avoid:**
- Validate dependency graph on every relationship create/update
- Implement cycle detection using DFS with visited set
- Reject relationships that would create cycles (fail fast)
- Provide UI visualization showing potential cycle before save
- Maximum dependency depth limit (e.g., 10 levels)

```typescript
// Cycle detection on relationship creation
async validateDependency(fromServiceId: string, toServiceId: string): Promise<boolean> {
  const visited = new Set<string>();
  const stack = [toServiceId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromServiceId) {
      throw new Error(`Circular dependency detected`);
    }
    if (!visited.has(current)) {
      visited.add(current);
      const deps = await this.getDependencies(current);
      stack.push(...deps.map(d => d.id));
    }
  }
  return true;
}
```

**Warning signs:**
- Status computation requests timing out
- Memory usage spiking during status updates
- Dependency graph visualization "hangs"
- "Maximum call stack exceeded" errors

**Phase to address:**
Phase 2 (Service Dependencies) - Build cycle detection into the dependency relationship API from the start

---

### Pitfall 3: N+1 Query Performance on Cascade Status

**What goes wrong:**
Computing a Service's status requires checking all dependent services. Each dependent service check triggers its own database query. For a service with 50 dependencies, each with 10 subdependencies, you execute 500+ queries per status request. Status pages load in 30+ seconds. API timeouts during incident storms.

**Why it happens:**
Naive recursive status computation without query batching. Current `statusComputation.service.ts` already shows this pattern for component status. Developers implement the obvious recursive algorithm without considering database impact.

**How to avoid:**
- **Batch loading:** Load entire dependency subgraph in 2-3 queries using recursive CTEs
- **Materialized status cache:** Store computed status with TTL, invalidate on incident changes
- **Async status propagation:** Background worker updates cached status when incidents change
- **Limit cascade depth:** Don't propagate status beyond N levels

```sql
-- Recursive CTE to load entire dependency graph in one query
WITH RECURSIVE dependency_tree AS (
  SELECT id, name, 1 as depth
  FROM services
  WHERE id = $1  -- Root service

  UNION ALL

  SELECT s.id, s.name, dt.depth + 1
  FROM services s
  JOIN service_dependencies sd ON s.id = sd.depends_on_id
  JOIN dependency_tree dt ON sd.service_id = dt.id
  WHERE dt.depth < 10  -- Depth limit
)
SELECT DISTINCT * FROM dependency_tree;
```

**Warning signs:**
- Status page load times >5 seconds
- Database connection pool exhaustion during status requests
- `statusComputationService.recomputeForIncident` execution time >1s
- CPU spikes during incident state changes

**Phase to address:**
Phase 2 (Service Dependencies) - Design efficient query patterns before building dependency graph

---

### Pitfall 4: Service Sprawl and Orphan Services

**What goes wrong:**
Teams create services for every microservice, library, and endpoint. 500+ services exist, most without owners, many duplicates (e.g., "user-service", "UserService", "user-svc"). Nobody knows which services matter. Alerts route to wrong services. Incident responders waste time determining which service owns an issue.

**Why it happens:**
No governance on service creation. Auto-discovery imports everything from infrastructure (K8s namespaces, AWS services, repos). No ownership requirement on creation. No cleanup process for unused services.

**How to avoid:**
- **Require owner on creation:** Every Service must have a Team owner (not optional)
- **Service lifecycle states:** ACTIVE, DEPRECATED, ARCHIVED with visibility rules
- **Usage tracking:** Count incidents, alerts, API calls per service last 30/60/90 days
- **Orphan detection job:** Flag services with no incidents in 90 days for review
- **Naming conventions:** Enforce unique names, slug-based identifiers, no special characters
- **Import review:** Auto-discovered services start as DRAFT, require human approval

```typescript
// Service lifecycle validation
interface ServiceLifecycle {
  state: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  ownerTeamId: string;  // Required, not optional
  lastIncidentAt: Date | null;
  incidentCount30d: number;
  deprecationDate?: Date;
  archiveDate?: Date;
}

// Orphan detection query
const orphanServices = await prisma.service.findMany({
  where: {
    state: 'ACTIVE',
    incidents: { none: { createdAt: { gte: ninetyDaysAgo } } },
  }
});
```

**Warning signs:**
- Service list exceeds 200+ entries
- Multiple services with similar names
- Services with `ownerTeamId: null`
- Teams complaining "I don't know which service to select"
- Alert routing to wrong service

**Phase to address:**
Phase 1 (Service Model Foundation) - Build ownership and lifecycle into the model from day one

---

### Pitfall 5: Standards Compliance Without Enforcement

**What goes wrong:**
Service scorecards show 80% of services are "non-compliant" with runbook, monitoring, and on-call requirements. Teams ignore scorecards because there are no consequences. Compliance reports are generated but never acted upon. The scorecard becomes a vanity metric rather than a tool for improvement.

**Why it happens:**
Scorecards are advisory-only. No integration with incident routing or operational workflows. Compliance data is visible but not actionable. Leadership doesn't see compliance reports in their normal workflow.

**How to avoid:**
- **Graduated enforcement:** Start with warnings, progress to blocks
  - Level 1: Warning in UI when creating incidents for non-compliant services
  - Level 2: Escalation notifications include compliance status
  - Level 3: Block routing to services below minimum compliance score
- **Actionable requirements:** Each scorecard item has a clear fix action
- **Ownership gates:** Non-compliant services can't be assigned to incidents (optional policy)
- **Compliance in postmortems:** Auto-include compliance status in postmortem data
- **Team dashboards:** Show compliance trend, not just current status

```typescript
// Compliance enforcement levels
enum ComplianceEnforcement {
  ADVISORY = 'advisory',      // Show warnings only
  SOFT_BLOCK = 'soft_block',  // Require override to route
  HARD_BLOCK = 'hard_block',  // Cannot route to non-compliant
}

interface ServiceScorecard {
  serviceId: string;
  score: number;  // 0-100
  requirements: {
    hasRunbook: boolean;
    hasMonitoring: boolean;
    hasOnCall: boolean;
    hasRecentPostmortem: boolean;
    meetsSLO: boolean;
  };
  enforcementLevel: ComplianceEnforcement;
}
```

**Warning signs:**
- Compliance scores stay static month-over-month
- Teams don't view scorecard pages
- Services with 0% compliance still receive incidents
- No correlation between compliance and incident metrics

**Phase to address:**
Phase 3 (Standards & Compliance) - Build enforcement hooks into routing from the start, even if initially advisory-only

---

### Pitfall 6: Breaking Existing Escalation Policy References

**What goes wrong:**
Existing escalation policies reference Teams (via `teamId`). Adding Service-level escalation policies creates confusion: which policy takes precedence? Incidents created through legacy path use Team policy, incidents through Service use Service policy. On-call engineers get conflicting notifications.

**Why it happens:**
Current schema has `EscalationPolicy.teamId` as the foreign key (schema.prisma:508). Adding `serviceId` creates ambiguity. The `routingService.routeAlertToTeam()` assumes team-based routing.

**How to avoid:**
- **Clear precedence rules:** Service policy > Team policy (documented, enforced in code)
- **Explicit policy assignment:** Services can either inherit Team policy or override
- **Migration path:**
  1. Add `serviceId` as optional FK to EscalationPolicy
  2. Add `policyInheritance: 'TEAM' | 'SERVICE' | 'CUSTOM'` to Service model
  3. Default new Services to `TEAM` (inherit existing behavior)
  4. Allow explicit Service-level policy assignment

```typescript
// Escalation policy resolution with Service awareness
async resolveEscalationPolicy(serviceId: string | null, teamId: string): Promise<EscalationPolicy> {
  // Priority 1: Service-specific policy
  if (serviceId) {
    const servicePolicy = await prisma.escalationPolicy.findFirst({
      where: { serviceId, isActive: true }
    });
    if (servicePolicy) return servicePolicy;
  }

  // Priority 2: Team default policy (inheritance)
  return await prisma.escalationPolicy.findFirst({
    where: { teamId, isDefault: true, isActive: true }
  });
}
```

**Warning signs:**
- Engineers paged multiple times for same incident
- Incidents showing conflicting escalation paths in timeline
- `escalationPolicyId` foreign key violations
- Teams asking "which policy applies to my service?"

**Phase to address:**
Phase 1 (Service Model Foundation) - Define precedence rules before adding Service FK to EscalationPolicy

---

### Pitfall 7: Status Page Component-Service Mismatch

**What goes wrong:**
Existing StatusPageComponent model has `serviceIdentifier` (string field, schema.prisma:844) for matching alerts to components. Adding proper Service entities creates two separate mappings: the legacy string match and the new Service FK. Status pages show incorrect status because one mapping updates but the other doesn't.

**Why it happens:**
Current implementation uses loose string matching (`serviceIdentifier` matches `alert.metadata.service`). Adding proper Service references requires migrating existing components while maintaining backward compatibility with string-based matching.

**How to avoid:**
- **Add proper FK while keeping legacy field:** `serviceId` (FK to Service) + `serviceIdentifier` (legacy string)
- **Resolution order:** Check `serviceId` first, fall back to `serviceIdentifier` match
- **Migration script:** For each StatusPageComponent with `serviceIdentifier`, find or create matching Service, populate `serviceId`
- **Deprecation timeline:** Log usage of `serviceIdentifier` path, remove after 6 months

```typescript
// Component-to-Service resolution with backward compatibility
async resolveComponentService(component: StatusPageComponent): Promise<Service | null> {
  // New path: direct Service reference
  if (component.serviceId) {
    return prisma.service.findUnique({ where: { id: component.serviceId } });
  }

  // Legacy path: string identifier match
  if (component.serviceIdentifier) {
    logger.warn({ componentId: component.id }, 'Using legacy serviceIdentifier match');
    return prisma.service.findFirst({
      where: { name: component.serviceIdentifier }
    });
  }

  return null;
}
```

**Warning signs:**
- Status page shows "Operational" while incidents are open
- Component status doesn't update when linked Service has incident
- Duplicate status entries (one from legacy match, one from FK)
- `serviceIdentifier` and `serviceId` point to different Services

**Phase to address:**
Phase 4 (Status Page Integration) - Plan migration strategy before touching StatusPageComponent model

---

### Pitfall 8: Incident-Service Attribution After Migration

**What goes wrong:**
Historical incidents have no `serviceId` (field doesn't exist yet). After adding Service Catalog, analytics queries return incomplete data. MTTR-by-service reports show artificially low incident counts. Service-level dashboards appear to have no history.

**Why it happens:**
The current Incident model doesn't have a `serviceId` field (schema.prisma:543-583). It routes via `teamId` and `fingerprint`. Adding `serviceId` leaves historical data with null values. Backfill is complex because the original alert metadata may not have clear service attribution.

**How to avoid:**
- **Add `serviceId` as nullable FK:** Don't break existing incidents
- **Best-effort backfill script:** Match historical incidents to Services via:
  1. `fingerprint` patterns (e.g., `datadog:api-service:*`)
  2. `metadata.service` field from linked alerts
  3. TeamTag inference (if team owns only one service)
- **Analytics filtering:** Explicitly handle `serviceId IS NULL` in queries
- **Dashboard UX:** Show "Unattributed" category in service-level analytics
- **Forward-only requirement:** New incidents must have serviceId

```typescript
// Backfill strategy
async backfillIncidentServices(): Promise<void> {
  const incidents = await prisma.incident.findMany({
    where: { serviceId: null },
    include: { alerts: true }
  });

  for (const incident of incidents) {
    // Try to infer service from alerts
    const serviceName = incident.alerts[0]?.metadata?.service
      || extractServiceFromFingerprint(incident.fingerprint);

    if (serviceName) {
      const service = await prisma.service.findFirst({
        where: { name: serviceName }
      });
      if (service) {
        await prisma.incident.update({
          where: { id: incident.id },
          data: { serviceId: service.id }
        });
      }
    }
  }
}
```

**Warning signs:**
- Service dashboards show "No incidents" for established services
- MTTR analytics show sudden improvement (missing historical data)
- High percentage of incidents with `serviceId: null`
- Analytics queries returning unexpected results

**Phase to address:**
Phase 1 (Service Model Foundation) - Design backfill strategy before schema migration

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| String-based service matching | Quick implementation, no migrations | Typos break routing, no referential integrity, duplicate services | Never for new code; legacy support only |
| Denormalizing service data onto incidents | Faster queries, simpler joins | Data inconsistency when service updated, storage bloat | Acceptable for read-heavy analytics with clear update triggers |
| Computing status synchronously | Simpler code, immediate consistency | API latency, N+1 queries, timeouts during storms | Only for services with <10 dependencies |
| Optional ownership | Faster service creation, lower friction | Orphan services, unclear responsibility, compliance gaps | Only for DRAFT services awaiting review |
| Flat dependency model (no hierarchy) | Simple data model, easy queries | Can't model Service -> Component -> Resource, limited blast radius | Acceptable for MVP, but design for extension |

## Integration Gotchas

Common mistakes when connecting Service Catalog to existing features.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Alert Routing | Requiring Service ID immediately, breaking legacy webhooks | Add Service as optional enrichment, fall back to TeamTag routing |
| Escalation Policies | Duplicating policies at Service and Team level | Single policy model with Service or Team ownership, clear precedence |
| Status Pages | Dual status computation (from Service and from Component mapping) | Service is source of truth, Component inherits from Service |
| Workflows | Filtering workflows by Team but not Service | Add `serviceId` filter to WorkflowTrigger, scope workflows to Service or Team |
| Postmortems | Not linking postmortems to affected Services | Add `serviceIds[]` to Postmortem model (already has `incidentIds[]`) |
| Audit Events | Generic service logs without serviceId context | Add `serviceId` to AuditEvent for service-specific audit trails |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recursive dependency status | Status page loads >5s | Batch load with recursive CTE, cache computed status | >50 services with >5 avg dependencies |
| No index on `serviceId` FK | Slow incident list by service | Add composite index `(serviceId, status, createdAt)` | >10k incidents per service |
| Synchronous status propagation | Incident state change >1s | Background job for cascade status updates | >100 dependent services |
| Full graph load for visualization | OOM on dependency graph render | Paginated graph API, load on-demand | >200 services with dependencies |
| Compliance scorecard computation | Dashboard timeout | Pre-compute scores, update on schema change | >500 services with >10 checks each |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Service visibility ignoring team boundaries | Users see services they shouldn't | Add `visibility: PUBLIC/TEAM/PRIVATE` with team-based access control |
| Dependency graph reveals architecture | Attackers map internal systems | Restrict dependency view to authenticated users with team membership |
| Compliance data in error messages | Leak security posture | Generic "compliance check failed", detailed data in audit log only |
| Service API keys shared across services | Blast radius expansion | Per-service API keys with service-scoped permissions |

## UX Pitfalls

Common user experience mistakes in service catalog implementations.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Service picker with 500+ options | Users can't find their service | Default to user's team services, search with fuzzy match, recently-used list |
| Mandatory service assignment on alert creation | Delays incident response | Auto-suggest service from alert metadata, allow "Unassigned" with follow-up |
| Dependency graph as primary navigation | Confusing for non-visual users | List view as default, graph as optional visualization |
| Compliance score without explanation | Users don't know how to improve | Each score component links to fix action |
| Service creation wizard with 20 fields | Users abandon halfway | Progressive disclosure: required fields first, optional fields in tabs |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Service Model:** Often missing lifecycle state (DRAFT/ACTIVE/DEPRECATED/ARCHIVED) - verify state machine is implemented
- [ ] **Dependency Graph:** Often missing cycle detection - verify circular references are rejected
- [ ] **Status Propagation:** Often missing depth limit - verify cascades don't exceed 10 levels
- [ ] **Ownership:** Often missing ownership transfer flow - verify services can be reassigned
- [ ] **Alert Routing:** Often missing fallback path - verify legacy routing still works
- [ ] **Compliance Scorecard:** Often missing update triggers - verify scores recalculate on schema changes
- [ ] **Service Deletion:** Often missing orphan handling - verify dependent services are notified/blocked
- [ ] **Analytics:** Often missing null serviceId handling - verify queries account for unattributed incidents

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Circular dependencies created | LOW | Run detection query, identify cycles, admin UI to break cycles |
| Service sprawl (500+ services) | MEDIUM | Usage audit, archive unused, merge duplicates (redirect FKs) |
| N+1 query performance | MEDIUM | Add recursive CTE queries, introduce caching layer, may need schema changes |
| Broken alert routing | HIGH | Emergency fallback to team routing, audit affected incidents, reprocess alerts |
| Historical incident attribution wrong | HIGH | Re-run backfill with corrected logic, may need to manually audit sample |
| Escalation policy conflicts | MEDIUM | Clear precedence in code, migration to canonical policy, notify affected teams |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Big Bang Migration | Phase 1 (Foundation) | Legacy routing tests pass, fallback path exercises |
| Circular Dependencies | Phase 2 (Dependencies) | Unit tests for cycle detection, property-based tests |
| N+1 Query Performance | Phase 2 (Dependencies) | Load test with 100+ services, status computation <500ms |
| Service Sprawl | Phase 1 (Foundation) | Ownership required on create, lifecycle states in UI |
| Standards Without Enforcement | Phase 3 (Compliance) | Enforcement hooks in routing, warning logs visible |
| Escalation Policy Conflicts | Phase 1 (Foundation) | Precedence rules documented, tests for each path |
| Status Page Mismatch | Phase 4 (Status Pages) | Both FK and string paths tested, migration script verified |
| Incident Attribution | Phase 1 (Foundation) | Backfill script runs in staging, analytics queries verified |

## Sources

### High Confidence
- **Backstage Software Catalog documentation:** Entity model, relationships, ownership patterns - https://backstage.io/docs/features/software-catalog/
- **Opsgenie Service API:** Service-team relationship model, API structure - https://docs.opsgenie.com/docs/service-api
- **Atlassian Compass:** Service catalog patterns, scorecards, dependency tracking - https://www.atlassian.com/software/compass
- **Existing PageFree codebase:** schema.prisma, routing.service.ts, incident.service.ts, statusComputation.service.ts

### Medium Confidence
- **Google SRE Workbook:** Service ownership principles, on-call organization - https://sre.google/workbook/on-call/
- **Grafana OnCall documentation:** Integration and routing patterns - https://grafana.com/docs/oncall/latest/configure/integrations/

### Inferred from Domain Experience
- Circular dependency detection patterns (standard graph algorithm)
- N+1 query optimization with recursive CTEs (PostgreSQL best practice)
- Service lifecycle state machines (common in service catalog implementations)
- Compliance enforcement gradients (learned from governance systems)

---
*Pitfalls research for: Service Catalog Addition to OnCall Platform*
*Researched: 2026-02-08*
