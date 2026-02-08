---
phase: 13-service-based-alert-routing
plan: 01
subsystem: routing
tags: [routing, services, alerts, incidents, backend]

dependency_graph:
  requires:
    - 11-01 (Service model with routingKey and team ownership)
  provides:
    - Service-first alert routing via routing_key
    - Integration default service fallback
    - Incident.serviceId for service-routed incidents
  affects:
    - Alert webhook processing
    - Incident creation and display
    - WebSocket broadcasts

tech_stack:
  added: []
  patterns:
    - Service-first routing with TeamTag fallback
    - Escalation policy precedence (service > team default)

key_files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/services/routing.service.ts
    - src/services/deduplication.service.ts
    - src/services/incident.service.ts
    - src/services/integration.service.ts
    - src/routes/integration.routes.ts
    - src/webhooks/alert-receiver.ts
    - src/types/socket.ts

decisions:
  - "ARCHIVED services skipped for routing (not just status filter)"
  - "Service escalation policy checked for isActive before use"

metrics:
  duration: 4m 26s
  completed: 2026-02-08
---

# Phase 13 Plan 01: Backend Service-Based Alert Routing Summary

Service-first routing implementation with routing_key lookup, integration default fallback, and TeamTag backward compatibility.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Extend Prisma schema | 7016f44 | Incident.serviceId, Integration.defaultServiceId, Service relations |
| 2 | Service-first routing logic | 671f7d4 | routeViaService, routing_key lookup, escalation policy precedence |
| 3 | Pipeline integration | fea9324 | deduplication, incident service, integration routes, socket types |

## Implementation Details

### Schema Changes
- **Incident.serviceId**: Optional FK to Service for service-routed incidents (ROUTE-03)
- **Integration.defaultServiceId**: Optional FK for fallback service routing (ROUTE-04)
- **Service reverse relations**: incidents[], integrationsDefaulting[]
- **Index on Incident.serviceId** for efficient lookups

### Routing Logic (routing.service.ts)
Three-tier routing priority:
1. **routing_key from alert metadata** - looks up Service by routingKey
2. **Integration defaultServiceId** - uses configured default service
3. **TeamTag fallback** - existing behavior preserved

The routeViaService method handles escalation policy precedence (ROUTE-05):
- If service has escalationPolicyId and policy is active, use it
- Otherwise fall back to team's default policy

### Pipeline Updates
- **deduplication.service**: Accepts integration param, passes to routing, stores serviceId
- **incident.service**: getById and list include service with team data
- **alert-receiver**: Passes defaultServiceId to deduplication
- **integration.routes**: Validates defaultServiceId as UUID or null
- **socket types**: IncidentBroadcast includes serviceId and service

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Verification

- [x] Alert with routing_key routes to service's team (ROUTE-01)
- [x] Alert without match falls back to TeamTag (ROUTE-02)
- [x] Incident.serviceId populated for service-routed incidents (ROUTE-03)
- [x] Integration.defaultServiceId can be set via PATCH (ROUTE-04)
- [x] Service escalation policy used when set, team default otherwise (ROUTE-05)
- [x] All existing alert routing continues working (backward compatibility)

## Next Steps

Phase 13 Plan 02 will add the frontend UI for:
- Displaying service on incident cards and detail views
- Configuring defaultServiceId on integration settings

## Self-Check: PASSED

All files verified:
- prisma/schema.prisma: 2 matches for serviceId
- routing.service.ts: 3 matches for routeViaService
- deduplication.service.ts: 1 match for routing.serviceId

All commits verified: 7016f44, 671f7d4, fea9324
