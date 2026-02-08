# Feature Research: Service Catalog

**Domain:** Service Catalog for OnCall/Incident Management Platform
**Researched:** 2026-02-08
**Confidence:** MEDIUM (verified against PagerDuty, Opsgenie, Backstage, Cortex patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Service CRUD** | Core functionality - must create, view, update, delete services | LOW | Basic model + REST API + UI forms |
| **Team ownership assignment** | Every service needs a responsible team for routing | LOW | Relation to existing Team model, single owner |
| **Service directory/listing** | Users need to discover and browse services | LOW | Filterable table with search, sort by status/team |
| **Basic metadata storage** | Services need description, tags, external IDs | LOW | JSON metadata field + structured tags |
| **Link services to integrations** | Alerts route to services, not just teams | MEDIUM | Update Integration model, alert routing logic |
| **Service-level incident routing** | Alerts for service X go to team Y's escalation policy | MEDIUM | Modify alert ingestion to resolve service -> team -> policy |
| **Technical service dependencies** | Users expect to model "service A depends on B" | MEDIUM | Self-referential relation, many-to-many |
| **Dependency visualization (basic)** | Simple tree/graph showing upstream/downstream | MEDIUM | D3.js or react-flow graph component |
| **Service status indicator** | Show if service has active incidents | LOW | Computed from linked incidents (cache field) |
| **Runbook/documentation links** | Every service needs "how to fix it" pointers | LOW | Array of {label, url} in metadata |
| **Communication channel links** | Link to Slack/Teams channel for the service | LOW | Structured fields for channel URLs |
| **Business services (aggregation)** | Non-technical users need "Checkout" not "cart-api + payments-api" | MEDIUM | Separate ServiceType enum, supporting services relation |
| **Business service status rollup** | Business service shows DEGRADED if any supporting service is down | MEDIUM | Computed status from supporting technical services |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Service standards/compliance dashboard** | Define "what good looks like" and track conformance - PagerDuty charges extra for this | MEDIUM | Standards model, regex matching, scoring algorithm |
| **Automated dependency suggestions** | ML-based: "services that alert together are likely related" | HIGH | Analyze incident correlation patterns, suggest links |
| **Cascade impact analysis** | "If service X goes down, these 15 services are affected" | MEDIUM | Graph traversal from dependency data, UI warning banners |
| **Cascade notifications** | Auto-notify owners of dependent services when upstream fails | MEDIUM | Trigger workflows when dependency has incident |
| **Context hub (unified view)** | One page with runbooks, channels, recent incidents, on-call, metrics links | MEDIUM | Aggregation page pulling from multiple sources |
| **Service health score** | Composite metric: incidents/week, MTTR, standards compliance | MEDIUM | Computed metric with configurable weights |
| **Auto-populate from integrations** | Create services automatically from DataDog/NewRelic service names | MEDIUM | Parse integration payloads, suggest/create services |
| **Service lifecycle management** | Track service states: active, deprecated, sunset | LOW | Enum field + filtering + alerts for deprecated services |
| **Dependency change tracking** | Audit log showing who added/removed dependencies when | LOW | Use existing AuditEvent model |
| **Bulk service operations** | Import/export services via CSV, bulk update ownership | LOW | File upload + validation + batch processing |
| **Service templates** | Pre-configured service types (API, Database, Frontend, etc.) | LOW | JSON templates with default standards, tags |
| **Deep integration with status pages** | StatusPageComponent auto-linked to services, status synced | MEDIUM | Enhance StatusPage models, bidirectional sync |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Automatic dependency discovery** | "We have 500 services, we can't map all manually" | Requires distributed tracing integration, high complexity, inaccurate without proper instrumentation | Manual entry + suggestions from incident correlation + bulk import |
| **Real-time service graph updates** | "Graph should update as services change" | WebSocket complexity for rarely-changing data, performance overhead | Refresh on navigation, cached for 1-5 minutes |
| **Full CMDB capabilities** | "We need to track servers, VMs, K8s pods too" | Scope creep into infrastructure management, different domain entirely | Focus on application/service layer, link to external CMDB via metadata URLs |
| **Automated remediation from catalog** | "Click button to auto-fix common issues" | Security risk, requires deep system integration, unreliable | Link to runbooks with manual steps, integrate with existing Workflow system |
| **Service cost tracking** | "Show cost per service from cloud billing" | Requires complex cloud integration, often inaccurate attribution | Store cost metadata manually, link to external cost tools |
| **Bidirectional sync with external catalogs** | "Sync with Backstage/ServiceNow" | Conflict resolution nightmare, unclear source of truth | One-way import with manual conflict resolution |
| **Granular dependency types** | "We need 'runtime dependency', 'build dependency', 'data dependency'" | Complexity explosion, users don't maintain granular types | Single dependency type with optional description/tags |
| **Service versioning** | "Track v1, v2, v3 of the same service" | Most services don't version this way, adds confusion | Use separate service entries with clear naming, link via metadata |

## Feature Dependencies

```
[Service Model]
    |
    +--requires--> [Team Model] (existing)
    |
    +--enables--> [Service Directory UI]
    |
    +--enables--> [Service-based Alert Routing]
                       |
                       +--requires--> [Integration Model] (existing)
                       |
                       +--requires--> [Alert Model] (existing)

[Service Model]
    |
    +--enables--> [Service Dependencies]
                       |
                       +--enables--> [Dependency Graph Visualization]
                       |
                       +--enables--> [Cascade Impact Analysis]
                       |
                       +--enables--> [Cascade Notifications]
                                          |
                                          +--requires--> [Workflow Model] (existing)

[Business Service Model]
    |
    +--requires--> [Service Model]
    |
    +--enables--> [Status Rollup]
                       |
                       +--enhances--> [StatusPage] (existing)

[Service Standards Model]
    |
    +--requires--> [Service Model]
    |
    +--enables--> [Compliance Dashboard]
    |
    +--enables--> [Service Health Score]

[Context Hub]
    |
    +--requires--> [Service Model]
    +--requires--> [Runbook Links]
    +--requires--> [Communication Links]
    +--requires--> [Incident Model] (existing)
    +--requires--> [Schedule Model] (existing)
```

### Dependency Notes

- **Service Model requires Team Model:** Every service must have exactly one owning team for routing incidents
- **Service-based Alert Routing requires Service Model:** Must create services before routing can reference them
- **Cascade Notifications requires Workflow Model:** Use existing workflow engine to trigger notifications
- **Business Service requires Service Model:** Business services aggregate technical services
- **Context Hub requires multiple features:** Acts as aggregation layer, needs underlying data models
- **Compliance Dashboard requires Service Standards:** Standards define what to measure, dashboard displays it

## MVP Definition

### Launch With (v1)

Minimum viable product - what's needed to validate the concept.

- [x] **Service Model (Technical Services)** - Foundation for everything else
- [x] **Team ownership** - Required for alert routing
- [x] **Service directory UI** - Users must browse/search services
- [x] **Basic metadata** - Description, tags, external links
- [x] **Service dependencies (manual)** - Users can define "depends on" relations
- [x] **Dependency visualization (basic tree)** - Show upstream/downstream visually
- [x] **Service status indicator** - Show active incident count
- [x] **Runbook + communication links** - Essential context for responders
- [x] **Service-based alert routing** - Alerts route via service to team's policy

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Business services** - Add when customers have >50 services and need abstraction
- [ ] **Status rollup** - Enable once business services exist
- [ ] **Service standards** - Add when customers request governance features
- [ ] **Compliance dashboard** - Enable once standards are defined
- [ ] **Cascade impact analysis** - Add when dependency data is populated
- [ ] **Cascade notifications** - Enable when customers want automated alerts

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Automated dependency suggestions** - Requires incident history data
- [ ] **Auto-populate from integrations** - Nice to have, complex parsing
- [ ] **Service health score** - Requires standards + incident metrics
- [ ] **Deep status page integration** - Requires stable both features
- [ ] **Service templates** - Nice for onboarding, not critical

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Service CRUD | HIGH | LOW | P1 |
| Team ownership | HIGH | LOW | P1 |
| Service directory UI | HIGH | LOW | P1 |
| Basic metadata | HIGH | LOW | P1 |
| Service dependencies | HIGH | MEDIUM | P1 |
| Dependency visualization | HIGH | MEDIUM | P1 |
| Service status indicator | HIGH | LOW | P1 |
| Runbook/comm links | HIGH | LOW | P1 |
| Service-based routing | HIGH | MEDIUM | P1 |
| Business services | MEDIUM | MEDIUM | P2 |
| Status rollup | MEDIUM | MEDIUM | P2 |
| Service standards | MEDIUM | MEDIUM | P2 |
| Compliance dashboard | MEDIUM | MEDIUM | P2 |
| Cascade impact analysis | MEDIUM | MEDIUM | P2 |
| Cascade notifications | MEDIUM | MEDIUM | P2 |
| Context hub | MEDIUM | MEDIUM | P2 |
| Dependency suggestions | LOW | HIGH | P3 |
| Auto-populate from integrations | LOW | MEDIUM | P3 |
| Service health score | LOW | MEDIUM | P3 |
| Service templates | LOW | LOW | P3 |
| Bulk operations | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch - core service catalog functionality
- P2: Should have, add when possible - governance and advanced features
- P3: Nice to have, future consideration - polish and automation

## Competitor Feature Analysis

| Feature | PagerDuty | Opsgenie | Backstage | Our Approach |
|---------|-----------|----------|-----------|--------------|
| Service CRUD | Yes | Yes (via API) | Yes (YAML files) | UI + API, like PagerDuty |
| Team ownership | Via escalation policy | Required teamId | Team entity | Direct team relation |
| Service directory | Yes, with search/filter | Limited UI | Yes, catalog view | Full directory with search |
| Dependencies | Yes, manual + suggestions | Not found in docs | Yes (relations in YAML) | Manual first, suggestions later |
| Dependency graph | Service Graph feature | Not found | Plugin-based | D3/react-flow integration |
| Business services | Yes, separate entity | Not found | Not distinct | Separate model with status rollup |
| Service standards | Yes, compliance scores | Not found | Scorecards | Standards model with scoring |
| Context hub | Service profile | Service page | Component page | Unified context page |
| Auto-discovery | ML suggestions | Not found | Integration plugins | Defer to v2+ |

## Integration with Existing v1.0 Features

### Alert Routing Enhancement

**Current flow:** Alert -> Integration -> Team -> Escalation Policy -> Incident

**New flow:** Alert -> Integration -> Service -> Team -> Escalation Policy -> Incident

Changes needed:
1. Add optional `serviceId` to Alert model
2. Modify Integration to optionally map to Service
3. Update alert ingestion to resolve service from payload or integration config
4. Service determines team (and optionally overrides escalation policy)

### Status Page Integration

**Current:** StatusPageComponent manually links to team/serviceIdentifier

**Enhanced:** StatusPageComponent can link directly to Service, inherit status automatically

Changes needed:
1. Add `serviceId` foreign key to StatusPageComponent
2. Status sync: Service.currentStatus -> StatusPageComponent.currentStatus
3. Auto-create StatusPageComponent when creating Business Service

### Workflow Integration

**Cascade notifications via workflows:**
1. New trigger type: `dependency_incident` - fires when upstream service has incident
2. Workflow can notify all dependent service owners
3. Template workflow: "Notify downstream owners when dependency fails"

### Schedule Integration

**On-call context in catalog:**
- Service detail shows current on-call for owning team
- Uses existing Schedule model, no schema changes
- Read-only integration, just display

## Data Model Sketch

### New Models

```prisma
model Service {
  id          String  @id @default(cuid())
  name        String
  description String?
  type        ServiceType @default(TECHNICAL)

  // Ownership
  teamId      String
  team        Team    @relation(fields: [teamId], references: [id])

  // Status (cached, computed from incidents)
  currentStatus String @default("OPERATIONAL")
  statusUpdatedAt DateTime @db.Timestamptz

  // Metadata
  tags         String[]
  externalId   String?  // ID from monitoring tool
  tier         String?  // P1/P2/P3 criticality

  // Context links
  runbooks     Json     @default("[]")  // [{label, url}]
  slackChannel String?
  teamsChannel String?
  dashboardUrl String?
  repoUrl      String?

  // Lifecycle
  lifecycle    String   @default("ACTIVE")  // ACTIVE, DEPRECATED, SUNSET

  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  // Relations
  alerts           Alert[]
  integrations     Integration[]
  dependencies     ServiceDependency[]  @relation("DependentService")
  dependents       ServiceDependency[]  @relation("DependencyService")
  supportedBy      Service[]            @relation("BusinessServiceSupport")
  supports         Service[]            @relation("BusinessServiceSupport")
  standards        ServiceStandardResult[]

  @@index([teamId])
  @@index([type])
  @@index([name])
}

enum ServiceType {
  TECHNICAL   // Application, API, database
  BUSINESS    // Aggregation of technical services
}

model ServiceDependency {
  id              String  @id @default(cuid())
  serviceId       String  // The service that depends on another
  service         Service @relation("DependentService", fields: [serviceId], references: [id])
  dependencyId    String  // The service being depended upon
  dependency      Service @relation("DependencyService", fields: [dependencyId], references: [id])
  description     String? // Optional note about the dependency

  createdAt       DateTime @default(now()) @db.Timestamptz

  @@unique([serviceId, dependencyId])
  @@index([serviceId])
  @@index([dependencyId])
}

model ServiceStandard {
  id           String  @id @default(cuid())
  name         String  @unique
  description  String?
  checkType    String  // FIELD_PRESENT, REGEX_MATCH, TAG_PRESENT
  checkConfig  Json    // {field: "runbooks", minLength: 1} or {pattern: ".*"}
  isActive     Boolean @default(true)

  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  // Relations
  results      ServiceStandardResult[]
}

model ServiceStandardResult {
  id          String @id @default(cuid())
  serviceId   String
  service     Service @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  standardId  String
  standard    ServiceStandard @relation(fields: [standardId], references: [id], onDelete: Cascade)

  passed      Boolean
  checkedAt   DateTime @db.Timestamptz

  @@unique([serviceId, standardId])
  @@index([serviceId])
  @@index([standardId, passed])
}
```

### Model Changes to Existing

```prisma
// Alert model - add serviceId
model Alert {
  // ... existing fields
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])
}

// Integration model - add default service
model Integration {
  // ... existing fields
  defaultServiceId String?
  defaultService   Service? @relation(fields: [defaultServiceId], references: [id])
}

// StatusPageComponent - add service link
model StatusPageComponent {
  // ... existing fields
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])
}

// Team model - add services relation
model Team {
  // ... existing fields
  services    Service[]
}
```

## User Stories by Feature

### Service CRUD (P1)
- As a platform admin, I can create a new service with name, description, and owning team
- As a team admin, I can edit services owned by my team
- As any user, I can view the service directory and see all services
- As a platform admin, I can archive/delete services that are no longer active

### Service Dependencies (P1)
- As a service owner, I can define which services my service depends on
- As a service owner, I can see which services depend on mine (dependents)
- As a responder, I can see a visual graph of upstream/downstream dependencies
- As a responder during an incident, I can see which other services might be impacted

### Service Status (P1)
- As any user, I can see the current status of any service (operational, degraded, outage)
- As a responder, I can see active incident count for each service
- As a team lead, I can filter the service directory by status

### Context Hub (P2)
- As a responder, I can view a service's detail page with all context in one place
- As a responder, I can quickly access runbooks, Slack channels, and dashboards
- As a responder, I can see who is currently on-call for this service
- As a responder, I can see recent incidents for this service

### Business Services (P2)
- As a platform admin, I can create a business service that groups technical services
- As a stakeholder, I can see business service status without technical details
- As a stakeholder, I can subscribe to status updates for business services

### Service Standards (P2)
- As a platform admin, I can define standards all services should meet
- As a team admin, I can see a compliance score for my team's services
- As a platform admin, I can view a dashboard showing compliance across all services
- As a team member, I can see remediation guidance for failed standards

## Sources

- PagerDuty Service Directory: https://support.pagerduty.com/main/docs/service-directory (HIGH confidence)
- PagerDuty Service Profile: https://support.pagerduty.com/main/docs/service-profile (HIGH confidence)
- PagerDuty Business Services: https://support.pagerduty.com/main/docs/business-services (HIGH confidence)
- PagerDuty Service Dependencies: https://support.pagerduty.com/main/docs/service-dependencies (HIGH confidence)
- PagerDuty Service Standards: https://support.pagerduty.com/docs/service-standards (HIGH confidence)
- Opsgenie Service API: https://docs.opsgenie.com/docs/service-api (MEDIUM confidence)
- Atlassian Compass: https://www.atlassian.com/software/compass (MEDIUM confidence)
- Backstage Software Catalog: https://backstage.io/docs/features/software-catalog/ (MEDIUM confidence)
- Cortex Service Catalog: https://www.cortex.io/products/service-catalog (MEDIUM confidence)

---
*Feature research for: Service Catalog for OnCall Platform*
*Researched: 2026-02-08*
