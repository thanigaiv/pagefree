# Phase 13: Service-Based Alert Routing - Research

**Researched:** 2026-02-08
**Domain:** Alert routing, webhook handling, incident creation, escalation policy selection
**Confidence:** HIGH

## Summary

Phase 13 implements service-based alert routing to complement the existing TeamTag routing. The core challenge is modifying the routing pipeline to prioritize service routing_key matching while maintaining 100% backward compatibility with existing integrations. The codebase already has all foundational pieces in place from Phases 11-12.

The routing flow becomes: (1) Check for routing_key in alert payload, (2) Look up Service by routing_key, (3) If found, route to service's team using service's escalation policy if configured, (4) If not found or no routing_key, fall back to existing TeamTag routing. This ensures zero breakage for existing integrations.

Key schema changes: Add optional `serviceId` to Incident model for service linking, add optional `defaultServiceId` to Integration model for default service routing (ROUTE-04). The routing service needs extension to handle the new routing logic. Frontend needs updates to show linked service on incident detail page.

**Primary recommendation:** Extend `RoutingService.routeAlertToTeam()` to prioritize service routing_key before falling back to TeamTag. Add serviceId to Incident model. Add defaultServiceId to Integration model. Show service link on incident detail page. All changes are additive with no breaking changes to existing behavior.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^6.0.0 | Database ORM | Already used for all models |
| Zod | ^4.3.0 | Request validation | Already used in all routes |
| Express | ^4.18.0 | HTTP routing | Already used for API |
| @tanstack/react-query | ^5.90.20 | Data fetching | Already used for all frontend data |

### No New Dependencies Required
This phase uses only existing project dependencies. All routing logic is implemented in existing service layer patterns.

## Architecture Patterns

### Current Routing Flow (Understanding the Baseline)
```
1. Webhook received at /webhooks/alerts/:integrationName
2. alert-receiver.ts validates, normalizes, creates Alert
3. generateContentFingerprint() for deduplication
4. deduplicationService.deduplicateAndCreateIncident()
   - Inside: routingService.routeAlertToTeam(alert)
   - Current: Only TeamTag routing via metadata.service field
5. Incident created with teamId, escalationPolicyId
```

### New Routing Flow (Phase 13)
```
1. Webhook received (same as before)
2. Normalize payload, extract routing_key from payload
3. Create Alert (same as before)
4. deduplicationService.deduplicateAndCreateIncident()
   - Inside: routingService.routeAlertToTeam(alert, integration)
   - NEW: Check alert.metadata.routing_key -> Service lookup
   - NEW: If no routing_key, check integration.defaultServiceId
   - If Service found: use service.teamId, service.escalationPolicyId (if set) or team default
   - If no Service: fallback to existing TeamTag routing (ROUTE-02)
5. Incident created with teamId, escalationPolicyId, NEW: serviceId
```

### Recommended Schema Changes

```prisma
// Extend Incident model to link to service
model Incident {
  // ... existing fields ...

  // NEW: Service link for service-routed incidents (ROUTE-03)
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])

  @@index([serviceId])
}

// Extend Integration model for default service (ROUTE-04)
model Integration {
  // ... existing fields ...

  // NEW: Default service for alerts without explicit routing_key
  defaultServiceId String?
  defaultService   Service? @relation(fields: [defaultServiceId], references: [id])
}

// Add Incident relation to Service model
model Service {
  // ... existing fields ...

  incidents        Incident[]
  integrationsDefaulting Integration[]  // Integrations using this as default
}
```

### Recommended API Modifications

```
# Existing integration endpoints - add defaultServiceId
PATCH /api/integrations/:id
  body: { defaultServiceId?: string | null }

# Incident detail now includes service
GET /api/incidents/:id
  response: { incident: { ..., service?: { id, name, routingKey, team } } }

# Service list includes usage count (optional enhancement)
GET /api/services
  response: { services: [{ ..., incidentCount?, integrationsUsingAsDefault? }] }
```

### Recommended Project Structure
```
src/
├── services/
│   └── routing.service.ts      # MODIFY: Add service routing logic
├── webhooks/
│   └── alert-receiver.ts       # MODIFY: Extract routing_key from payload
└── types/
    └── service.ts              # MODIFY: Add incident relation types

frontend/src/
├── components/
│   └── IncidentDetail.tsx      # MODIFY: Show linked service
├── pages/
│   └── IncidentDetailPage.tsx  # MODIFY: Include service in display
└── types/
    └── incident.ts             # MODIFY: Add service field to Incident type
```

### Pattern 1: Extended Routing Service
**What:** Prioritize service routing with TeamTag fallback
**When to use:** All alert routing decisions
**Example:**
```typescript
// Source: Extending existing src/services/routing.service.ts
class RoutingService {
  async routeAlertToTeam(
    alert: any,
    integration?: { defaultServiceId?: string | null }
  ): Promise<RoutingResult> {
    const metadata = alert.metadata as any;

    // 1. Try routing_key from alert payload (ROUTE-01)
    const routingKey = metadata?.routing_key || metadata?.routingKey;

    if (routingKey) {
      const service = await this.findServiceByRoutingKey(routingKey);
      if (service) {
        return this.routeViaService(service);
      }
      // routing_key provided but no match - log warning, fallback
      logger.warn({ routingKey, alertId: alert.id }, 'routing_key not found, falling back');
    }

    // 2. Try integration default service (ROUTE-04)
    if (integration?.defaultServiceId) {
      const service = await this.findServiceById(integration.defaultServiceId);
      if (service) {
        return this.routeViaService(service);
      }
    }

    // 3. Fallback to TeamTag routing (ROUTE-02, existing behavior)
    return this.routeViaTeamTag(alert);
  }

  private async routeViaService(service: ServiceWithPolicy): Promise<RoutingResult> {
    // ROUTE-05: Service escalation policy takes precedence over team default
    const policy = service.escalationPolicyId
      ? await this.getEscalationPolicy(service.escalationPolicyId)
      : await this.getTeamDefaultPolicy(service.teamId);

    const assignedUserId = await this.resolveEscalationTarget(policy.levels[0], service.teamId);

    return {
      teamId: service.teamId,
      escalationPolicyId: policy.id,
      assignedUserId,
      serviceId: service.id  // NEW: Return serviceId for incident linking
    };
  }

  private async routeViaTeamTag(alert: any): Promise<RoutingResult> {
    // Existing TeamTag routing logic - unchanged
    const team = await this.determineTeamFromAlert(alert);
    // ... rest of existing implementation
  }
}
```

### Pattern 2: Incident Service Integration Update
**What:** Include serviceId when creating incident from service routing
**When to use:** deduplicationService.deduplicateAndCreateIncident()
**Example:**
```typescript
// Source: Extending src/services/deduplication.service.ts
private async executeTransaction(...): Promise<DeduplicationResult> {
  // ... existing duplicate check ...

  // Route to team - now returns optional serviceId
  const routing = await routingService.routeAlertToTeam(alert, integration);

  // Create new incident with service link
  const incident = await tx.incident.create({
    data: {
      fingerprint,
      status: 'OPEN',
      priority: alert.severity,
      teamId: routing.teamId,
      escalationPolicyId: routing.escalationPolicyId,
      assignedUserId: routing.assignedUserId,
      serviceId: routing.serviceId,  // NEW: Link service if routed via service (ROUTE-03)
      currentLevel: 1,
      currentRepeat: 1,
      alertCount: 1
    }
  });

  // ... rest unchanged ...
}
```

### Pattern 3: Frontend Service Display
**What:** Show linked service on incident detail page
**When to use:** IncidentDetail component
**Example:**
```typescript
// Source: Extending frontend/src/components/IncidentDetail.tsx
export function IncidentDetail({ incident, ... }: IncidentDetailProps) {
  return (
    <div>
      {/* ... existing content ... */}

      {/* Service info - show if incident was routed via service */}
      {incident.service && (
        <div className="mb-4">
          <span className="text-muted-foreground">Service</span>
          <div className="flex items-center gap-2 mt-1">
            <Link to={`/services?selected=${incident.service.id}`}>
              <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                <Server className="h-3 w-3 mr-1" />
                {incident.service.name}
              </Badge>
            </Link>
            <span className="text-xs text-muted-foreground font-mono">
              {incident.service.routingKey}
            </span>
          </div>
        </div>
      )}

      {/* Team info */}
      <div>
        <span className="text-muted-foreground">Team</span>
        <p className="font-medium">{incident.team.name}</p>
      </div>

      {/* ... rest unchanged ... */}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Breaking existing routing:** Never remove TeamTag routing - it must remain as fallback (ROUTE-02)
- **Ignoring archived services:** Routing should skip ARCHIVED services to prevent routing to inactive services
- **Hard-coding routing_key field names:** Support both `routing_key` and `routingKey` formats from different providers
- **Coupling escalation policy selection:** Keep service escalation override optional - don't require it for service routing

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service lookup by routing key | Custom SQL query | Existing serviceService.getByRoutingKey() | Already implemented in Phase 11 |
| Escalation policy resolution | Custom logic | Existing routingService.getTeamDefaultPolicy() | Existing pattern handles edge cases |
| Incident relation fetching | Separate queries | Prisma include with Service | Avoids N+1 queries |
| WebSocket broadcasting | Custom service update | Existing socketService patterns | Consistency with incident broadcasts |

**Key insight:** Phase 11-12 built exactly the foundation needed. Service.routingKey is already unique-indexed and has getByRoutingKey() method ready for use.

## Common Pitfalls

### Pitfall 1: Routing Key Extraction Varies by Provider
**What goes wrong:** DataDog sends `service_name`, NewRelic sends `labels.service`, generic sends `routing_key`
**Why it happens:** No standard field name across monitoring tools
**How to avoid:** Extract from multiple possible fields in priority order: `routing_key` > `routingKey` > `service` > `service_name` > `serviceName`. Document field mapping per provider.
**Warning signs:** Alerts from specific providers always fall back to TeamTag routing

### Pitfall 2: Archived Service Routing
**What goes wrong:** Alert routes to archived service, team wonders why they got alert for decommissioned service
**Why it happens:** routingKey lookup doesn't filter by status
**How to avoid:** Filter serviceService.getByRoutingKey() to only return ACTIVE or DEPRECATED services. ARCHIVED services should not route alerts.
**Warning signs:** Alerts routing to services marked as archived

### Pitfall 3: Missing Escalation Policy
**What goes wrong:** Service has escalationPolicyId but that policy was deleted, routing fails
**Why it happens:** No cascade handling when escalation policies are deleted
**How to avoid:** If service.escalationPolicyId points to non-existent or inactive policy, fall back to team default. Log warning but don't fail routing.
**Warning signs:** "Escalation policy not found" errors, alerts not being routed

### Pitfall 4: Default Service Deleted
**What goes wrong:** Integration has defaultServiceId but that service was archived/deleted
**Why it happens:** No cascade handling when services are archived
**How to avoid:** Treat archived/deleted defaultService as "no default" - proceed to TeamTag fallback. Consider nullifying defaultServiceId on service archive.
**Warning signs:** Integration using invalid default service, silent routing failures

### Pitfall 5: Transaction Isolation with Service Lookup
**What goes wrong:** Service routing introduces read outside transaction, potential inconsistency
**Why it happens:** routingService query runs outside the Serializable transaction in deduplicationService
**How to avoid:** Service lookup is read-only and service data changes rarely. Acceptable to read outside transaction. If needed, pass service data into transaction as parameter.
**Warning signs:** Very rare edge cases with concurrent service updates during alert processing

### Pitfall 6: No Service on Incident Detail for Legacy Incidents
**What goes wrong:** UI breaks or shows undefined when viewing incidents created before Phase 13
**Why it happens:** serviceId is null for all pre-Phase 13 incidents
**How to avoid:** Frontend must handle `incident.service === null` gracefully. Don't show service section for incidents without service link.
**Warning signs:** UI errors on historical incident pages

## Code Examples

### Backend: Extended RoutingResult Interface
```typescript
// Source: src/services/routing.service.ts
export interface RoutingResult {
  teamId: string;
  escalationPolicyId: string;
  assignedUserId: string | null;
  serviceId?: string;  // NEW: Present when routed via service
}
```

### Backend: Integration Update Schema with Default Service
```typescript
// Source: Extending src/routes/integration.routes.ts
const UpdateIntegrationSchema = z.object({
  name: z.string().optional(),
  // ... existing fields ...

  // NEW: Default service for alerts without routing_key (ROUTE-04)
  defaultServiceId: z.string().nullable().optional()
});
```

### Backend: Incident Query with Service Include
```typescript
// Source: Extending src/services/incident.service.ts
async getById(id: string): Promise<any> {
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      escalationPolicy: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      // NEW: Include service for display on incident detail (ROUTE-03)
      service: {
        select: {
          id: true,
          name: true,
          routingKey: true,
          team: { select: { id: true, name: true } }
        }
      },
      alerts: { ... },
      escalationJobs: { ... }
    }
  });
  // ... rest unchanged
}
```

### Frontend: Extended Incident Type
```typescript
// Source: Extending frontend/src/types/incident.ts
export interface Incident {
  id: string;
  fingerprint: string;
  status: IncidentStatus;
  priority: string;
  alertCount: number;
  teamId: string;
  team: { id: string; name: string };
  // ... existing fields ...

  // NEW: Service link for service-routed incidents (ROUTE-03)
  serviceId?: string;
  service?: {
    id: string;
    name: string;
    routingKey: string;
    team: { id: string; name: string };
  };
}
```

### Frontend: Integration Form with Default Service
```typescript
// Source: Extending frontend/src/pages/IntegrationsPage.tsx
function IntegrationEditDialog({ integration, ... }) {
  const { data: servicesData } = useServices({ status: 'ACTIVE' });
  const services = servicesData?.services || [];

  return (
    <Dialog>
      {/* ... existing fields ... */}

      {/* NEW: Default Service selection (ROUTE-04) */}
      <div className="space-y-2">
        <Label>Default Service</Label>
        <Select
          value={formData.defaultServiceId || 'none'}
          onValueChange={(v) => setFormData({
            ...formData,
            defaultServiceId: v === 'none' ? null : v
          })}
        >
          <SelectTrigger>
            <SelectValue placeholder="No default service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No default service</SelectItem>
            {services.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.team.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Alerts without explicit routing_key will route to this service
        </p>
      </div>
    </Dialog>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TeamTag routing only | Service-first routing with TeamTag fallback | Phase 13 (this phase) | Backward compatible |
| Alert metadata as routing source | Explicit routing_key field | Phase 13 | Cleaner routing contract |
| Team default escalation only | Service escalation override | Phase 11 foundation | Per-service escalation |

**What's changing:**
- Current: All alerts route via TeamTag lookup from metadata.service field
- After Phase 13: Alerts check routing_key first, then integration default, then TeamTag
- Backward compatible: Existing integrations work without changes

## Open Questions

1. **Routing Key Extraction Priority**
   - What we know: Different providers use different field names
   - What's unclear: Should we document exact field mappings per provider?
   - Recommendation: Check in priority order: `routing_key`, `routingKey`, then fall back to existing `service/service_name/serviceName` extraction

2. **Archived Service in Default Service**
   - What we know: Integration can have defaultServiceId
   - What's unclear: What happens if default service gets archived?
   - Recommendation: Treat as "no default" and proceed to TeamTag fallback. Add validation warning in UI.

3. **Service Deletion Impact**
   - What we know: Services can be archived, incidents link to services
   - What's unclear: Should incidents lose service link when service is archived?
   - Recommendation: Keep serviceId on incident (historical record). Service archive doesn't affect existing incidents.

## Sources

### Primary (HIGH confidence)
- `/Users/tvellore/work/pagefree/src/services/routing.service.ts` - Current routing implementation
- `/Users/tvellore/work/pagefree/src/services/deduplication.service.ts` - Incident creation with routing
- `/Users/tvellore/work/pagefree/src/webhooks/alert-receiver.ts` - Webhook processing pipeline
- `/Users/tvellore/work/pagefree/src/services/service.service.ts` - Service lookup including getByRoutingKey()
- `/Users/tvellore/work/pagefree/prisma/schema.prisma` - Current data model

### Secondary (MEDIUM confidence)
- `/Users/tvellore/work/pagefree/.planning/phases/11-service-model-foundation/11-RESEARCH.md` - Service model foundation
- `/Users/tvellore/work/pagefree/.planning/REQUIREMENTS.md` - ROUTE-01 through ROUTE-05 requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using only existing project dependencies
- Architecture: HIGH - Extending existing patterns with minimal changes
- Schema changes: HIGH - Simple additions, no migrations required for existing data
- Routing logic: HIGH - Clear priority chain with explicit fallback
- Pitfalls: MEDIUM - Based on code review and common integration patterns

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (patterns stable, no external API changes expected)
