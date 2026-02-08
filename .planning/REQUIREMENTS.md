# Requirements: OnCall Platform

**Defined:** 2026-02-08
**Core Value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds

## v1.1 Requirements (Service Catalog - Table Stakes)

Requirements for service catalog foundation. Service-based alert routing replaces team-based routing.

### Service Foundation

- [ ] **SVC-01**: User can create technical service with name, description, routing key, and owning team
- [ ] **SVC-02**: User can edit service metadata (name, description, tags)
- [ ] **SVC-03**: User can archive/deprecate services (lifecycle management)
- [ ] **SVC-04**: User can view service directory with search and filter
- [ ] **SVC-05**: Service must have owning team (required on creation)
- [ ] **SVC-06**: Service can have optional escalation policy override (otherwise inherits team default)

### Service Dependencies

- [ ] **DEP-01**: User can add dependency relationship between services
- [ ] **DEP-02**: User can remove dependency relationship
- [ ] **DEP-03**: System prevents circular dependencies (cycle detection on create/update)
- [ ] **DEP-04**: User can view dependency graph visualization for a service
- [ ] **DEP-05**: User can see upstream dependencies (what this service depends on)
- [ ] **DEP-06**: User can see downstream dependents (what depends on this service)

### Alert Routing

- [ ] **ROUTE-01**: Alert routes to service via routing_key from webhook payload
- [ ] **ROUTE-02**: System falls back to TeamTag routing if no service match (backward compatibility)
- [ ] **ROUTE-03**: Incident links to service when created via service routing
- [ ] **ROUTE-04**: Integration can specify default service for alerts
- [ ] **ROUTE-05**: Service routing respects escalation policy precedence (service > team)

## v1.2 Requirements (Deferred)

Advanced service catalog features deferred to next milestone.

### Business Services

- **BIZ-01**: User can create business service grouping multiple technical services
- **BIZ-02**: User can add/remove technical services from business service
- **BIZ-03**: Business service shows aggregated health status from technical services
- **BIZ-04**: Business service appears on status pages with rollup status

### Cascade Status & Notifications

- **CASCADE-01**: Service status shows "degraded" if critical dependency has active incident
- **CASCADE-02**: System computes cascade impact (list of affected dependent services)
- **CASCADE-03**: System notifies owning teams of dependent services when upstream incident occurs
- **CASCADE-04**: Cascade notifications are limited to critical dependencies only

### Context Hub

- **CTX-01**: User can add runbook links to service
- **CTX-02**: User can configure Slack/Teams channel for service
- **CTX-03**: Service detail page shows recent incidents for that service
- **CTX-04**: Service detail page shows current on-call engineer for service's team
- **CTX-05**: Service detail page shows dependency graph
- **CTX-06**: Service detail page shows service standards compliance score

### Service Standards

- **STD-01**: System validates service has required metadata (name, description, team)
- **STD-02**: System validates service has communication channel configured
- **STD-03**: System computes compliance score for each service
- **STD-04**: User can view compliance dashboard showing all services' scores
- **STD-05**: System shows warnings for non-compliant services

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated dependency suggestions | ML-based correlation requires significant incident history |
| Auto-populate services from integrations | DataDog/NewRelic service names don't map cleanly to ownership |
| Service templates | Premature abstraction, let patterns emerge organically |
| Service versioning | Services don't typically version this way, adds confusion |
| Deep status page bidirectional sync | Complex feature, not critical for v1.1 |
| Full CMDB capabilities | Scope creep into infrastructure management |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| *To be filled by roadmapper* | | |

**Coverage:**
- v1.1 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after initial definition*
