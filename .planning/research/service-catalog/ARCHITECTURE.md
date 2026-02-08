# Architecture Research: Service Catalog Integration

**Domain:** Service Catalog for OnCall Platform
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

Service Catalog introduces a service-centric data model that fundamentally changes alert routing from team-based to service-based. The key architectural changes are:

1. **New Data Models:** Services, Business Services, and Service Dependencies
2. **Modified Routing Flow:** Webhook -> Service (via routing key) -> Owning Team -> Escalation Policy
3. **Dependency Graph:** Graph queries for cascade status and impact analysis
4. **Integration Points:** Status pages, workflows, incidents all link to services

## Current Architecture (Baseline)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CURRENT ALERT ROUTING FLOW                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Webhook → Integration → Alert → Deduplication → Routing Service       │
│                                                         │                │
│                                    ┌────────────────────┘                │
│                                    ▼                                     │
│                           determineTeamFromAlert()                       │
│                                    │                                     │
│                  ┌─────────────────┼─────────────────┐                  │
│                  ▼                                   ▼                   │
│         metadata.service               TeamTag (TECHNICAL)              │
│         (string lookup)                    │                            │
│                  │                         ▼                            │
│                  └───────────────► Team Found ───► Escalation Policy    │
│                                         │                               │
│                                         ▼                               │
│                                    Incident Created                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Current Limitations:**
- Team routing via TeamTag is fragile (string matching)
- No explicit service ownership model
- No service dependencies or impact analysis
- Status page components manually linked to teams, not services

## Proposed Architecture (With Service Catalog)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICE CATALOG LAYER                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Business Services                                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │ E-Commerce   │  │ Customer     │  │ Internal     │             │ │
│  │  │ Platform     │  │ Portal       │  │ Tools        │             │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │ │
│  │         │                 │                 │                      │ │
│  │         ▼                 ▼                 ▼                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │                Technical Services (Dependency Graph)          │ │ │
│  │  │                                                               │ │ │
│  │  │    ┌─────────┐     ┌─────────┐     ┌─────────┐               │ │ │
│  │  │    │ Payment │────►│   API   │────►│Database │               │ │ │
│  │  │    │ Service │     │ Gateway │     │ Cluster │               │ │ │
│  │  │    └─────────┘     └────┬────┘     └─────────┘               │ │ │
│  │  │         │               │                                     │ │ │
│  │  │         ▼               ▼                                     │ │ │
│  │  │    ┌─────────┐     ┌─────────┐                               │ │ │
│  │  │    │  Redis  │     │  Auth   │                               │ │ │
│  │  │    │  Cache  │     │ Service │                               │ │ │
│  │  │    └─────────┘     └─────────┘                               │ │ │
│  │  │                                                               │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                     SERVICE-BASED ALERT ROUTING                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Webhook ──► routing_key ──► Service ──► Owning Team ──► Escalation   │
│                                   │                                      │
│                                   ▼                                      │
│                         Dependency Graph Query                           │
│                                   │                                      │
│                                   ▼                                      │
│                         Cascade Notifications                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New/Modified |
|-----------|----------------|--------------|
| **Service** | Technical service entity with routing key, owning team, escalation policy | **NEW** |
| **BusinessService** | Grouping of services for executive view | **NEW** |
| **ServiceDependency** | Directed graph edges between services | **NEW** |
| **ServiceRoutingService** | Route alerts via routing_key to service | **NEW** |
| **DependencyGraphService** | Query dependencies, compute cascade status | **NEW** |
| **routingService** | Fallback to team routing if no service match | **MODIFIED** |
| **statusComputationService** | Compute status from service (not just team) | **MODIFIED** |
| **deduplicationService** | Link incidents to services | **MODIFIED** |
| **StatusPageComponent** | Link to service instead of team | **MODIFIED** |

## Data Model Design

### New Prisma Schema Additions

```prisma
// ============================================================================
// SERVICE CATALOG MODELS
// ============================================================================

model Service {
  id          String  @id @default(cuid())
  name        String  @unique  // Human-readable name (e.g., "Payment API")
  slug        String  @unique  // URL-friendly (e.g., "payment-api")
  description String?

  // Routing - the key field for alert routing
  routingKey  String  @unique  // Matches webhook routing_key (e.g., "payment-api-prod")

  // Ownership
  owningTeamId        String
  owningTeam          Team              @relation(fields: [owningTeamId], references: [id])
  escalationPolicyId  String?           // Override team default
  escalationPolicy    EscalationPolicy? @relation(fields: [escalationPolicyId], references: [id])

  // Hierarchy
  businessServiceId   String?
  businessService     BusinessService?  @relation(fields: [businessServiceId], references: [id])
  tier                Int               @default(3)  // 1=critical, 2=important, 3=standard

  // Metadata
  metadata    Json    @default("{}")  // runbook_url, repo_url, slack_channel, etc.
  isActive    Boolean @default(true)

  // Timestamps
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  // Relations
  incidents               Incident[]
  alerts                  Alert[]
  dependsOn               ServiceDependency[] @relation("DependentService")
  dependedOnBy            ServiceDependency[] @relation("DependencyService")
  statusPageComponents    StatusPageComponent[]

  @@index([routingKey])
  @@index([owningTeamId])
  @@index([businessServiceId])
  @@index([tier])
}

model BusinessService {
  id          String   @id @default(cuid())
  name        String   @unique  // e.g., "E-Commerce Platform"
  description String?
  owner       String?  // Executive owner name/email

  // Relations
  services    Service[]

  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz
}

model ServiceDependency {
  id              String  @id @default(cuid())

  // The service that depends on another
  dependentId     String
  dependent       Service @relation("DependentService", fields: [dependentId], references: [id], onDelete: Cascade)

  // The service being depended upon
  dependencyId    String
  dependency      Service @relation("DependencyService", fields: [dependencyId], references: [id], onDelete: Cascade)

  // Dependency characteristics
  dependencyType  String  @default("runtime")  // runtime, build, data
  isCritical      Boolean @default(false)       // If true, dependent can't function without dependency

  createdAt       DateTime @default(now()) @db.Timestamptz

  @@unique([dependentId, dependencyId])
  @@index([dependentId])
  @@index([dependencyId])
}
```

### Schema Modifications

```prisma
// MODIFIED: Alert - add optional service link
model Alert {
  // ... existing fields ...

  // NEW: Optional service link (for service-routed alerts)
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])

  @@index([serviceId])  // NEW index
}

// MODIFIED: Incident - add optional service link
model Incident {
  // ... existing fields ...

  // NEW: Optional service link (primary service for this incident)
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])

  @@index([serviceId])  // NEW index
}

// MODIFIED: StatusPageComponent - service-based linking
model StatusPageComponent {
  // ... existing fields ...

  // DEPRECATED (keep for migration): teamId, serviceIdentifier
  teamId            String?  // @deprecated: use serviceId
  serviceIdentifier String?  // @deprecated: use serviceId

  // NEW: Direct service link
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])

  @@index([serviceId])  // NEW index
}

// MODIFIED: Integration - optional default service
model Integration {
  // ... existing fields ...

  // NEW: Default service for this integration (if no routing_key in payload)
  defaultServiceId  String?
  defaultService    Service? @relation(fields: [defaultServiceId], references: [id])
}

// MODIFIED: EscalationPolicy - can be service-specific
model EscalationPolicy {
  // ... existing fields ...

  // NEW: Services using this policy as override
  services    Service[]
}
```

## Alert Routing Flow (New)

### Sequence Diagram

```
┌─────────┐  ┌───────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌──────────┐
│ Webhook │  │ Integration│  │ ServiceRouting  │  │RoutingService   │  │ Incident │
│ Receiver│  │            │  │    Service      │  │  (fallback)     │  │          │
└────┬────┘  └─────┬──────┘  └───────┬─────────┘  └───────┬─────────┘  └────┬─────┘
     │             │                 │                    │                 │
     │ POST /webhooks/alerts/:name   │                    │                 │
     ├────────────►│                 │                    │                 │
     │             │                 │                    │                 │
     │ Extract routing_key from payload                   │                 │
     │             ├─────────────────►                    │                 │
     │             │                 │                    │                 │
     │             │  routeByRoutingKey(routing_key)      │                 │
     │             │                 ├────────────────────│                 │
     │             │                 │                    │                 │
     │             │     ┌───────────┴───────────┐        │                 │
     │             │     │ Service found?        │        │                 │
     │             │     └───────────┬───────────┘        │                 │
     │             │                 │                    │                 │
     │             │    YES: Return  │                    │                 │
     │             │    {service, team, policy}           │                 │
     │             │◄────────────────┤                    │                 │
     │             │                 │                    │                 │
     │             │    NO: Fallback to team routing      │                 │
     │             │                 ├───────────────────►│                 │
     │             │                 │                    │                 │
     │             │                 │ routeAlertToTeam() │                 │
     │             │                 │◄───────────────────┤                 │
     │             │                 │                    │                 │
     │             │                 │                    │                 │
     │             │  Create incident with serviceId      │                 │
     │             │─────────────────┼────────────────────┼────────────────►│
     │             │                 │                    │                 │
     │             │  Trigger cascade notifications       │                 │
     │             │─────────────────►                    │                 │
     │             │                 │                    │                 │
└────┴─────┘  └────┴──────┘  └───────┴─────────┘  └───────┴─────────┘  └────┴─────┘
```

### Implementation: ServiceRoutingService

```typescript
// src/services/serviceRouting.service.ts

import { prisma } from '../config/database.js';
import { routingService, type RoutingResult } from './routing.service.js';
import { logger } from '../config/logger.js';

export interface ServiceRoutingResult extends RoutingResult {
  serviceId: string | null;
  serviceName: string | null;
}

class ServiceRoutingService {
  /**
   * Route alert by routing_key to service.
   * Falls back to team-based routing if no service match.
   */
  async routeAlert(
    alert: any,
    integrationId: string
  ): Promise<ServiceRoutingResult> {
    // 1. Extract routing key from alert metadata
    const routingKey = this.extractRoutingKey(alert);

    if (routingKey) {
      // 2. Try service-based routing
      const serviceResult = await this.routeByRoutingKey(routingKey);
      if (serviceResult) {
        logger.info(
          { alertId: alert.id, routingKey, serviceId: serviceResult.serviceId },
          'Alert routed via service'
        );
        return serviceResult;
      }
    }

    // 3. Check integration default service
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      include: { defaultService: true }
    });

    if (integration?.defaultService) {
      const serviceResult = await this.routeByService(integration.defaultService);
      if (serviceResult) {
        logger.info(
          { alertId: alert.id, serviceId: serviceResult.serviceId },
          'Alert routed via integration default service'
        );
        return serviceResult;
      }
    }

    // 4. Fall back to team-based routing
    logger.debug({ alertId: alert.id }, 'No service match, falling back to team routing');
    const teamResult = await routingService.routeAlertToTeam(alert);

    return {
      ...teamResult,
      serviceId: null,
      serviceName: null
    };
  }

  /**
   * Extract routing_key from alert payload.
   * Supports multiple field names for compatibility.
   */
  private extractRoutingKey(alert: any): string | null {
    const metadata = alert.metadata as any;

    return (
      metadata?.routing_key ||
      metadata?.routingKey ||
      metadata?.service_key ||
      metadata?.integration_key ||
      alert.source  // Fallback to source as routing key
    );
  }

  /**
   * Route by routing key to service.
   */
  async routeByRoutingKey(routingKey: string): Promise<ServiceRoutingResult | null> {
    const service = await prisma.service.findUnique({
      where: { routingKey, isActive: true },
      include: {
        owningTeam: true,
        escalationPolicy: {
          include: { levels: { orderBy: { levelNumber: 'asc' } } }
        }
      }
    });

    if (!service) {
      return null;
    }

    return this.routeByService(service);
  }

  /**
   * Build routing result from service.
   */
  private async routeByService(service: any): Promise<ServiceRoutingResult> {
    // Use service-specific escalation policy or team default
    let policy = service.escalationPolicy;

    if (!policy) {
      policy = await prisma.escalationPolicy.findFirst({
        where: { teamId: service.owningTeamId, isDefault: true, isActive: true },
        include: { levels: { orderBy: { levelNumber: 'asc' } } }
      });
    }

    if (!policy || policy.levels.length === 0) {
      throw new Error(`No escalation policy for service ${service.name}`);
    }

    // Resolve initial assignee
    const firstLevel = policy.levels[0];
    const assignedUserId = await routingService.resolveEscalationTarget(
      firstLevel,
      service.owningTeamId
    );

    return {
      teamId: service.owningTeamId,
      escalationPolicyId: policy.id,
      assignedUserId,
      serviceId: service.id,
      serviceName: service.name
    };
  }
}

export const serviceRoutingService = new ServiceRoutingService();
```

## Dependency Graph Service

### Graph Query Patterns

```typescript
// src/services/dependencyGraph.service.ts

import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

interface DependencyNode {
  serviceId: string;
  serviceName: string;
  tier: number;
  depth: number;
  isCritical: boolean;
}

class DependencyGraphService {
  private readonly MAX_DEPTH = 10;  // Prevent infinite loops

  /**
   * Get all services that depend on the given service (downstream impact).
   * When service X fails, which services are affected?
   */
  async getDependents(
    serviceId: string,
    options: { maxDepth?: number; criticalOnly?: boolean } = {}
  ): Promise<DependencyNode[]> {
    const { maxDepth = this.MAX_DEPTH, criticalOnly = false } = options;
    const visited = new Set<string>();
    const result: DependencyNode[] = [];

    await this.traverseDependents(
      serviceId,
      0,
      visited,
      result,
      maxDepth,
      criticalOnly,
      false  // First level is never critical-path (it's the root)
    );

    return result;
  }

  private async traverseDependents(
    serviceId: string,
    depth: number,
    visited: Set<string>,
    result: DependencyNode[],
    maxDepth: number,
    criticalOnly: boolean,
    isCriticalPath: boolean
  ): Promise<void> {
    if (depth >= maxDepth || visited.has(serviceId)) {
      return;
    }

    visited.add(serviceId);

    const dependencies = await prisma.serviceDependency.findMany({
      where: {
        dependencyId: serviceId,
        ...(criticalOnly && { isCritical: true })
      },
      include: {
        dependent: {
          select: { id: true, name: true, tier: true }
        }
      }
    });

    for (const dep of dependencies) {
      const node: DependencyNode = {
        serviceId: dep.dependent.id,
        serviceName: dep.dependent.name,
        tier: dep.dependent.tier,
        depth: depth + 1,
        isCritical: dep.isCritical
      };

      result.push(node);

      // Recursively find services depending on this one
      await this.traverseDependents(
        dep.dependent.id,
        depth + 1,
        visited,
        result,
        maxDepth,
        criticalOnly,
        dep.isCritical
      );
    }
  }

  /**
   * Get all services that this service depends on (upstream dependencies).
   * What services must be healthy for service X to work?
   */
  async getDependencies(
    serviceId: string,
    options: { maxDepth?: number; criticalOnly?: boolean } = {}
  ): Promise<DependencyNode[]> {
    const { maxDepth = this.MAX_DEPTH, criticalOnly = false } = options;
    const visited = new Set<string>();
    const result: DependencyNode[] = [];

    await this.traverseDependencies(
      serviceId,
      0,
      visited,
      result,
      maxDepth,
      criticalOnly
    );

    return result;
  }

  private async traverseDependencies(
    serviceId: string,
    depth: number,
    visited: Set<string>,
    result: DependencyNode[],
    maxDepth: number,
    criticalOnly: boolean
  ): Promise<void> {
    if (depth >= maxDepth || visited.has(serviceId)) {
      return;
    }

    visited.add(serviceId);

    const dependencies = await prisma.serviceDependency.findMany({
      where: {
        dependentId: serviceId,
        ...(criticalOnly && { isCritical: true })
      },
      include: {
        dependency: {
          select: { id: true, name: true, tier: true }
        }
      }
    });

    for (const dep of dependencies) {
      const node: DependencyNode = {
        serviceId: dep.dependency.id,
        serviceName: dep.dependency.name,
        tier: dep.dependency.tier,
        depth: depth + 1,
        isCritical: dep.isCritical
      };

      result.push(node);

      await this.traverseDependencies(
        dep.dependency.id,
        depth + 1,
        visited,
        result,
        maxDepth,
        criticalOnly
      );
    }
  }

  /**
   * Compute cascade status for a service.
   * A service is degraded if any critical dependency is degraded.
   */
  async computeCascadeStatus(serviceId: string): Promise<{
    status: string;
    reason: string | null;
    affectedDependencies: string[];
  }> {
    // Get critical dependencies (services this one depends on)
    const criticalDeps = await this.getDependencies(serviceId, {
      maxDepth: 3,
      criticalOnly: true
    });

    if (criticalDeps.length === 0) {
      return { status: 'OPERATIONAL', reason: null, affectedDependencies: [] };
    }

    // Check for active incidents on critical dependencies
    const depServiceIds = criticalDeps.map(d => d.serviceId);

    const activeIncidents = await prisma.incident.findMany({
      where: {
        serviceId: { in: depServiceIds },
        status: { in: ['OPEN', 'ACKNOWLEDGED'] }
      },
      include: {
        service: { select: { id: true, name: true } }
      },
      orderBy: { priority: 'desc' }  // Worst first
    });

    if (activeIncidents.length === 0) {
      return { status: 'OPERATIONAL', reason: null, affectedDependencies: [] };
    }

    // Determine status based on worst incident
    const worstIncident = activeIncidents[0];
    const priorityToStatus: Record<string, string> = {
      CRITICAL: 'MAJOR_OUTAGE',
      HIGH: 'PARTIAL_OUTAGE',
      MEDIUM: 'DEGRADED_PERFORMANCE',
      LOW: 'OPERATIONAL',
      INFO: 'OPERATIONAL'
    };

    return {
      status: priorityToStatus[worstIncident.priority] || 'DEGRADED_PERFORMANCE',
      reason: `Dependency ${worstIncident.service?.name} has active incident`,
      affectedDependencies: activeIncidents.map(i => i.service?.name || i.serviceId!)
    };
  }

  /**
   * Detect circular dependencies.
   * Used during dependency creation validation.
   */
  async wouldCreateCycle(
    dependentId: string,
    dependencyId: string
  ): Promise<boolean> {
    // Check if dependencyId already depends on dependentId (directly or transitively)
    const dependencies = await this.getDependencies(dependencyId, { maxDepth: 20 });
    return dependencies.some(d => d.serviceId === dependentId);
  }
}

export const dependencyGraphService = new DependencyGraphService();
```

## Integration Points

### 1. Incident Creation (Modified deduplicationService)

```typescript
// MODIFY: src/services/deduplication.service.ts

// In executeTransaction method, after routing:

// Route to service (with team fallback)
const routing = await serviceRoutingService.routeAlert(alert, alert.integrationId);

// Create new incident with service link
const incident = await tx.incident.create({
  data: {
    fingerprint,
    status: 'OPEN',
    priority: alert.severity,
    teamId: routing.teamId,
    escalationPolicyId: routing.escalationPolicyId,
    assignedUserId: routing.assignedUserId,
    serviceId: routing.serviceId,  // NEW: Link to service
    currentLevel: 1,
    currentRepeat: 1,
    alertCount: 1
  }
});

// Link alert to service
await tx.alert.update({
  where: { id: alertId },
  data: {
    incidentId: incident.id,
    serviceId: routing.serviceId  // NEW: Link alert to service
  }
});

// Trigger cascade notifications if service has dependents
if (routing.serviceId) {
  await cascadeNotificationService.notifyDependents(routing.serviceId, incident.id);
}
```

### 2. Status Page Components (Modified statusComputationService)

```typescript
// MODIFY: src/services/statusComputation.service.ts

async computeStatus(componentId: string): Promise<ComponentStatus> {
  const component = await prisma.statusPageComponent.findUnique({
    where: { id: componentId },
    include: {
      maintenanceWindows: {
        where: { status: 'IN_PROGRESS' },
      },
      service: true  // NEW: Include linked service
    },
  });

  if (!component) {
    return 'OPERATIONAL';
  }

  // Check for active maintenance
  const hasActiveMaintenance = component.maintenanceWindows.length > 0;

  // NEW: Service-based status computation
  if (component.serviceId) {
    // Direct incidents on this service
    const directIncidents = await prisma.incident.findMany({
      where: {
        serviceId: component.serviceId,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] }
      }
    });

    // Cascade status from dependencies
    const cascadeStatus = await dependencyGraphService.computeCascadeStatus(
      component.serviceId
    );

    // Compute worst status
    let worstStatus = this.computeWorstFromIncidents(directIncidents);

    // Factor in cascade status
    if (STATUS_SEVERITY_ORDER.indexOf(cascadeStatus.status as ComponentStatus) <
        STATUS_SEVERITY_ORDER.indexOf(worstStatus)) {
      worstStatus = cascadeStatus.status as ComponentStatus;
    }

    if (hasActiveMaintenance && worstStatus === 'OPERATIONAL') {
      return 'UNDER_MAINTENANCE';
    }

    return worstStatus;
  }

  // DEPRECATED: Fall back to team-based computation for migration
  // ... existing team-based logic ...
}
```

### 3. Cascade Notifications (New Service)

```typescript
// src/services/cascadeNotification.service.ts

import { prisma } from '../config/database.js';
import { dependencyGraphService } from './dependencyGraph.service.js';
import { notificationQueue } from '../queues/notification.queue.js';
import { logger } from '../config/logger.js';

class CascadeNotificationService {
  /**
   * Notify teams of services that depend on an affected service.
   * Called when a new incident is created for a service.
   */
  async notifyDependents(
    affectedServiceId: string,
    incidentId: string
  ): Promise<void> {
    // Get services that depend on the affected service
    const dependents = await dependencyGraphService.getDependents(
      affectedServiceId,
      { maxDepth: 2, criticalOnly: true }
    );

    if (dependents.length === 0) {
      return;
    }

    // Get the incident details
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { service: true }
    });

    if (!incident) {
      return;
    }

    // Get unique teams from dependent services
    const dependentServices = await prisma.service.findMany({
      where: {
        id: { in: dependents.map(d => d.serviceId) }
      },
      include: {
        owningTeam: {
          include: {
            members: {
              where: { role: { in: ['TEAM_ADMIN', 'RESPONDER'] } },
              include: { user: true }
            }
          }
        }
      }
    });

    // Group by team to avoid duplicate notifications
    const teamNotifications = new Map<string, {
      teamName: string;
      services: string[];
      members: any[];
    }>();

    for (const service of dependentServices) {
      const existing = teamNotifications.get(service.owningTeamId);
      if (existing) {
        existing.services.push(service.name);
      } else {
        teamNotifications.set(service.owningTeamId, {
          teamName: service.owningTeam.name,
          services: [service.name],
          members: service.owningTeam.members
        });
      }
    }

    // Queue cascade notifications
    for (const [teamId, data] of teamNotifications) {
      logger.info(
        {
          incidentId,
          affectedService: incident.service?.name,
          notifyTeam: teamId,
          dependentServices: data.services
        },
        'Queueing cascade notification'
      );

      // Notify team admins about potential impact
      for (const member of data.members) {
        if (member.role === 'TEAM_ADMIN') {
          await notificationQueue.add('cascade_alert', {
            userId: member.userId,
            incidentId,
            template: 'dependency_impact',
            data: {
              affectedService: incident.service?.name,
              dependentServices: data.services,
              incidentPriority: incident.priority
            }
          });
        }
      }
    }
  }
}

export const cascadeNotificationService = new CascadeNotificationService();
```

### 4. Workflow Integration

```typescript
// MODIFY: src/services/workflow/workflow-integration.ts

// Add service context to workflow triggers:

export async function onIncidentCreated(incident: IncidentContext): Promise<void> {
  // Include service context for workflow conditions
  const fullIncident = await prisma.incident.findUnique({
    where: { id: incident.id },
    include: { service: true }
  });

  const context = {
    ...incident,
    serviceId: fullIncident?.serviceId,
    serviceName: fullIncident?.service?.name,
    serviceTier: fullIncident?.service?.tier,
    serviceMetadata: fullIncident?.service?.metadata
  };

  // Existing workflow trigger logic with enhanced context
  await triggerWorkflows('incident_created', context);
}
```

## New API Routes

### Service Catalog Routes

```typescript
// src/routes/service.routes.ts

// GET  /api/services                    - List services (with filters)
// POST /api/services                    - Create service
// GET  /api/services/:id                - Get service details
// PATCH /api/services/:id               - Update service
// DELETE /api/services/:id              - Delete service (soft)

// GET  /api/services/:id/dependencies   - Get service dependencies
// POST /api/services/:id/dependencies   - Add dependency
// DELETE /api/services/:id/dependencies/:depId - Remove dependency

// GET  /api/services/:id/dependents     - Get services depending on this one
// GET  /api/services/:id/incidents      - Get incidents for this service
// GET  /api/services/:id/status         - Get computed status with cascade

// Business Services
// GET  /api/business-services           - List business services
// POST /api/business-services           - Create business service
// GET  /api/business-services/:id       - Get business service with services
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 services | Single PostgreSQL, in-memory graph traversal |
| 100-1000 services | Add Redis caching for dependency graphs, index optimization |
| 1000+ services | Consider graph database (Neo4j) for dependency queries, or recursive CTE optimization |

### Performance Optimizations

1. **Dependency Graph Caching:**
   ```typescript
   // Cache dependency graphs in Redis with TTL
   const cacheKey = `deps:${serviceId}:${direction}:${depth}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);

   // Invalidate on dependency changes
   await redis.del(`deps:${serviceId}:*`);
   ```

2. **Batch Cascade Status Computation:**
   ```typescript
   // Compute cascade status for multiple services in one query
   async computeCascadeStatusBatch(serviceIds: string[]): Promise<Map<string, CascadeStatus>>
   ```

3. **Materialized View for Hot Paths:**
   ```sql
   -- For frequently accessed service-team-policy lookups
   CREATE MATERIALIZED VIEW service_routing_mv AS
   SELECT s.routing_key, s.id as service_id, s.owning_team_id,
          COALESCE(s.escalation_policy_id, ep.id) as escalation_policy_id
   FROM service s
   LEFT JOIN escalation_policy ep ON ep.team_id = s.owning_team_id AND ep.is_default = true
   WHERE s.is_active = true;

   CREATE UNIQUE INDEX ON service_routing_mv(routing_key);
   ```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Deep Dependency Traversal on Every Request

**What people do:** Query full dependency graph on every status page load
**Why it's wrong:** O(n) database queries, latency spikes
**Do this instead:** Cache dependency graphs, invalidate on changes, use materialized results

### Anti-Pattern 2: Bidirectional Foreign Keys

**What people do:** Add `services[]` to Team model alongside `owningTeamId` on Service
**Why it's wrong:** Data inconsistency risk, ORM confusion
**Do this instead:** Single source of truth (Service.owningTeamId), query with includes

### Anti-Pattern 3: String-Based Service Matching

**What people do:** Match services by name instead of routing_key
**Why it's wrong:** Names change, case sensitivity issues, no uniqueness guarantee
**Do this instead:** Immutable routing_key as the canonical identifier

### Anti-Pattern 4: Circular Dependency Without Limits

**What people do:** Allow arbitrary dependency graphs without cycle detection
**Why it's wrong:** Infinite loops in cascade computation, stack overflow
**Do this instead:** Cycle detection on dependency creation, max traversal depth

## Build Order (Suggested)

Based on dependencies, recommended implementation order:

1. **Phase 1: Data Model** (no dependencies)
   - Service model
   - BusinessService model
   - ServiceDependency model
   - Migration for Alert/Incident serviceId fields

2. **Phase 2: Core Services** (depends on Phase 1)
   - ServiceRoutingService
   - DependencyGraphService
   - CRUD routes for services

3. **Phase 3: Routing Integration** (depends on Phase 2)
   - Modify deduplicationService
   - Modify routing flow
   - Add routing_key extraction

4. **Phase 4: Status Integration** (depends on Phase 2)
   - Modify statusComputationService
   - StatusPageComponent service linking
   - Cascade status computation

5. **Phase 5: Cascade Notifications** (depends on Phase 3)
   - CascadeNotificationService
   - New notification templates
   - Workflow context enhancement

6. **Phase 6: UI/API** (depends on Phases 2-5)
   - Service management UI
   - Dependency visualization
   - Business service dashboard

## Sources

- Existing codebase analysis: `/Users/tvellore/work/pagefree/prisma/schema.prisma`
- Existing routing: `/Users/tvellore/work/pagefree/src/services/routing.service.ts`
- Existing deduplication: `/Users/tvellore/work/pagefree/src/services/deduplication.service.ts`
- Existing status computation: `/Users/tvellore/work/pagefree/src/services/statusComputation.service.ts`
- PagerDuty Service Catalog: https://support.pagerduty.com/docs/services (pattern reference)
- Opsgenie Service Architecture: https://docs.atlassian.com/opsgenie (pattern reference)

---
*Architecture research for: Service Catalog Integration*
*Researched: 2026-02-08*
