# Stack Research: Service Catalog Additions

**Domain:** Service Catalog for OnCall Platform
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

The existing PageFree stack is well-suited for Service Catalog features with minimal additions needed. The frontend already includes `@xyflow/react` (v12.10.0) and `dagre` (v0.8.5) for dependency graph visualization. The backend uses Prisma with PostgreSQL, which supports self-referential relations for modeling service dependencies without requiring a graph database.

**Key Recommendations:**
- Upgrade `dagre` to `@dagrejs/dagre@2.0.0` (officially maintained fork)
- Use Zod v4 (already at v4.3.0) for service standards validation
- Model dependencies as self-referential relations in PostgreSQL (no graph DB needed)
- Add ELK.js only if complex edge routing becomes necessary (defer)

---

## Recommended Stack Additions

### Graph Visualization (Frontend)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @xyflow/react | 12.10.0 | Interactive dependency graph UI | **Already installed.** Industry standard (4.1M weekly downloads), used by Stripe, Zapier. Provides node-based diagrams with pan/zoom/select. |
| @dagrejs/dagre | 2.0.0 | Automatic graph layout | **Upgrade from dagre@0.8.5.** The @dagrejs org fork is actively maintained (last release Nov 2025). Provides hierarchical layout for directed acyclic graphs. |

### Data Modeling (Backend)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PostgreSQL + Prisma | 6.0.0 | Service registry and dependencies | **Already installed.** Prisma supports self-referential relations for dependency graphs. PostgreSQL recursive CTEs handle graph traversal efficiently (up to ~10k services). |
| Prisma TypedSQL | 5.19.0+ | Complex graph queries | **Already supported.** Use for recursive CTEs to traverse dependencies. Raw SQL via `$queryRaw` handles cascade status calculations. |

### Validation Framework (Backend)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Zod | 4.3.0 | Service standards schema validation | **Already installed.** TypeScript-first, 2kb gzipped, immutable. Ideal for defining and validating service compliance rules. |

---

## Supporting Libraries (Already Installed)

| Library | Version | Purpose | Service Catalog Use |
|---------|---------|---------|---------------------|
| @tanstack/react-query | 5.90.20 | Graph data caching | Cache dependency graph queries, handle optimistic updates when dependencies change. |
| socket.io | 4.8.3 | Real-time status propagation | Broadcast cascade status changes to all viewing clients when a dependency's status changes. |
| date-fns | 4.1.0 | SLA/uptime calculations | Calculate service uptime percentages, last-updated timestamps. |
| BullMQ | 5.67.3 | Background job processing | Queue cascade status recalculations when service status changes. |
| React Router | 7.13.0 | Service detail pages | Route to `/services/:id`, `/services/:id/dependencies`, `/services/:id/compliance`. |

---

## What NOT to Add

### Unnecessary Technologies

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Neo4j / Graph Database | Overkill for service catalog scale (~100s to ~10k services). Adds operational complexity (new DB to manage), requires learning Cypher. PostgreSQL handles this scale with recursive CTEs. | PostgreSQL with self-referential Prisma relations |
| Apache AGE (PostgreSQL graph extension) | Adds complexity without significant benefit at this scale. Requires PostgreSQL extension management. | Native PostgreSQL recursive CTEs |
| D3-Force | Physics-based layouts inappropriate for hierarchical service dependencies. Unpredictable positioning confuses users. | dagre for hierarchical layout |
| ELK.js | Most powerful but largest bundle (~800kb). Only needed for complex edge routing. Dagre sufficient for service graphs. | dagre initially; ELK.js only if complex routing needed later |
| AJV | While excellent, Zod already provides validation with better TypeScript integration. Adding AJV duplicates functionality. | Zod (already in stack) |
| Cytoscape.js | Canvas-based, better for 1000+ nodes but loses React component model benefits. Overkill for service graphs. | @xyflow/react for React-native experience |

### Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Separate graph database | Two sources of truth, sync complexity, operational overhead | Single PostgreSQL source with graph traversal via CTEs |
| Real-time graph computation | O(n^2) cascade calculations on every status change | Pre-computed cascade status, updated via targeted BullMQ jobs |
| Monolithic compliance validator | Rigid, hard to extend for new standards | Composable Zod schemas per compliance category |
| Client-side graph traversal | Performance issues, stale data | Server-side traversal, cache results in TanStack Query |
| Storing graph layout positions | Brittle, breaks when nodes added/removed | Compute layout on-demand with dagre |

---

## Data Modeling Approach

### Service Dependencies in PostgreSQL (Prisma Schema)

```prisma
model Service {
  id                String   @id @default(cuid())
  name              String
  description       String?
  type              String   // "technical" | "business"
  tier              String   // "critical" | "high" | "medium" | "low"
  status            String   @default("operational") // operational | degraded | outage | unknown
  cascadeStatus     String   @default("operational") // Pre-computed considering dependencies

  // Routing key for alert matching
  routingKey        String   @unique

  // Ownership
  teamId            String
  team              Team     @relation(fields: [teamId], references: [id])
  escalationPolicyId String?

  // Self-referential: Services this depends on
  dependencies      ServiceDependency[] @relation("DependsOn")
  // Self-referential: Services that depend on this
  dependents        ServiceDependency[] @relation("DependedOnBy")

  // Context hub
  runbookUrl        String?
  slackChannel      String?
  docsUrl           String?
  dashboardUrl      String?

  // Compliance
  complianceScore   Int?     // 0-100, computed
  lastAuditedAt     DateTime?
  complianceData    Json?    // Detailed compliance check results

  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  @@index([teamId])
  @@index([type])
  @@index([tier])
  @@index([status])
}

model ServiceDependency {
  id              String  @id @default(cuid())

  // The service that has the dependency
  serviceId       String
  service         Service @relation("DependsOn", fields: [serviceId], references: [id], onDelete: Cascade)

  // The service being depended upon
  dependsOnId     String
  dependsOn       Service @relation("DependedOnBy", fields: [dependsOnId], references: [id], onDelete: Cascade)

  // Dependency metadata
  dependencyType  String  // "hard" (blocks) | "soft" (degrades)
  description     String?

  createdAt       DateTime @default(now()) @db.Timestamptz

  @@unique([serviceId, dependsOnId])
  @@index([serviceId])
  @@index([dependsOnId])
}

model BusinessService {
  id              String   @id @default(cuid())
  name            String
  description     String?
  status          String   @default("operational")

  // Business services group technical services
  technicalServiceIds String[]  // Array of Service IDs

  // Business owner (not necessarily on-call)
  ownerEmail      String?
  slackChannel    String?

  // Impact classification
  impactLevel     String   // "revenue" | "customer-facing" | "internal"

  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz

  @@index([status])
}

model ServiceStandard {
  id              String   @id @default(cuid())
  name            String   @unique
  description     String
  category        String   // "documentation" | "alerting" | "monitoring" | "security"
  tier            String[] // Which service tiers this applies to
  schema          Json     // Zod-compatible schema definition
  isRequired      Boolean  @default(false)

  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz
}
```

### Graph Traversal via Recursive CTE

For cascade status calculation (find all affected services when one fails):

```sql
-- Find all services affected when service $1 has an outage
WITH RECURSIVE impact_tree AS (
  -- Base case: the failing service
  SELECT id, name, status, 'source'::text as impact_type, 0 as depth
  FROM "Service"
  WHERE id = $1

  UNION ALL

  -- Recursive case: services that depend on impacted services
  SELECT s.id, s.name, s.status,
    CASE WHEN sd."dependencyType" = 'hard' THEN 'blocked' ELSE 'degraded' END as impact_type,
    it.depth + 1
  FROM "Service" s
  JOIN "ServiceDependency" sd ON sd."serviceId" = s.id
  JOIN impact_tree it ON sd."dependsOnId" = it.id
  WHERE it.depth < 10  -- Prevent infinite loops, limit depth
)
SELECT DISTINCT ON (id) id, name, status, impact_type, depth
FROM impact_tree
ORDER BY id, depth;
```

---

## Compliance Validation Pattern

Use Zod schemas for composable service standards:

```typescript
import { z } from 'zod';

// Base service metadata validation
const baseServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  tier: z.enum(['critical', 'high', 'medium', 'low']),
  teamId: z.string().cuid(),
});

// Documentation compliance
const documentationSchema = z.object({
  runbookUrl: z.string().url(),
  docsUrl: z.string().url().optional(),
});

// Alerting compliance (required for all services)
const alertingSchema = z.object({
  escalationPolicyId: z.string().cuid(),
  slackChannel: z.string().regex(/^#[\w-]+$/),
});

// Monitoring compliance (required for critical/high tier)
const monitoringSchema = z.object({
  dashboardUrl: z.string().url(),
  healthCheckEndpoint: z.string().url().optional(),
});

// Tier-specific compliance requirements
export const complianceByTier = {
  critical: baseServiceSchema
    .merge(documentationSchema)
    .merge(alertingSchema)
    .merge(monitoringSchema),

  high: baseServiceSchema
    .merge(documentationSchema)
    .merge(alertingSchema)
    .merge(monitoringSchema.partial()),

  medium: baseServiceSchema
    .merge(alertingSchema),

  low: baseServiceSchema.partial().merge(
    z.object({ name: z.string(), teamId: z.string().cuid() })
  ),
};

// Validate service and return score with violations
export function validateServiceCompliance(
  service: unknown,
  tier: keyof typeof complianceByTier
): { score: number; violations: string[]; passing: boolean } {
  const schema = complianceByTier[tier];
  const result = schema.safeParse(service);

  if (result.success) {
    return { score: 100, violations: [], passing: true };
  }

  const violations = result.error.issues.map(
    issue => `${issue.path.join('.')}: ${issue.message}`
  );

  // Calculate score: each violation deducts 10 points (minimum 0)
  const score = Math.max(0, 100 - violations.length * 10);
  const passing = score >= 70; // 70% threshold for passing

  return { score, violations, passing };
}
```

---

## Installation Commands

### Frontend: Upgrade dagre to maintained fork

```bash
cd /Users/tvellore/work/pagefree/frontend
npm uninstall dagre @types/dagre
npm install @dagrejs/dagre@^2.0.0
```

Note: `@dagrejs/dagre@2.0.0` includes TypeScript types, no separate `@types` package needed.

### Backend: No new packages needed

All required packages are already in the stack:
- Prisma 6.0.0 (supports self-referential relations)
- Zod 4.3.0 (schema validation)
- BullMQ 5.67.3 (background jobs for cascade calculation)

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| Graph Visualization | @xyflow/react + dagre | Cytoscape.js | When you need canvas-based rendering for 1000+ nodes. ReactFlow is React-native with better DX for < 500 nodes. |
| Graph Layout | dagre | ELK.js | When you need sophisticated edge routing or complex compound node layouts. Dagre sufficient for service dependency trees. |
| Graph Layout | dagre | D3-Hierarchy | When all nodes have uniform dimensions and data is strictly tree-shaped (single root). Service graphs can have multiple roots and cycles. |
| Graph Storage | PostgreSQL self-relations | Neo4j | When graph traversal is the primary operation (social networks, recommendation engines). Service catalogs are CRUD-heavy with occasional traversal. |
| Validation | Zod | AJV + JSON Schema | When you need JSON Schema output for external API consumers. Zod 4 supports `z.fromJSONSchema()` for interop if needed later. |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @xyflow/react@12.10.0 | React 19.2.0 | Verified in existing frontend package.json |
| @dagrejs/dagre@2.0.0 | @xyflow/react@12.x | ES module support, replaces dagre@0.8.5 |
| Prisma@6.0.0 | PostgreSQL 12+ | Recursive CTEs supported in PG 8.4+, all features in PG 12+ |
| Zod@4.3.0 | TypeScript 5.5+ | tsconfig strict mode required |
| BullMQ@5.67.3 | ioredis@5.9.2 | Already working in existing stack |

---

## Performance Considerations

| Concern | At 100 services | At 1k services | At 10k services |
|---------|-----------------|----------------|-----------------|
| Graph render | Instant (<50ms) | Instant (<100ms) | Consider virtualization or canvas renderer |
| Dependency query (CTE) | <10ms | <50ms | <200ms with proper indexing |
| Cascade status calculation | Real-time inline | Queue-based (BullMQ) | Queue-based + Redis caching |
| Layout calculation (dagre) | <50ms | <200ms | Consider server-side layout or ELK.js |
| Compliance validation | Real-time | Real-time | Background job on save |

**Recommended Indexing for Scale:**

```sql
-- Already in schema
CREATE INDEX idx_service_team ON "Service"("teamId");
CREATE INDEX idx_service_status ON "Service"("status");

-- Add for graph queries
CREATE INDEX idx_service_dep_service ON "ServiceDependency"("serviceId");
CREATE INDEX idx_service_dep_depends ON "ServiceDependency"("dependsOnId");
```

---

## Integration Points with Existing Stack

| Existing Feature | Service Catalog Integration |
|------------------|----------------------------|
| **Teams** | Services owned by teams via `teamId` foreign key |
| **Escalation Policies** | Services reference policies for alert routing |
| **Schedules** | On-call for a service determined by service -> team -> schedule |
| **Incidents** | Alerts enriched with service context; service ownership determines routing |
| **Status Pages** | StatusPageComponent can link to Service for automated status sync |
| **Workflows** | Workflow triggers can filter by service tier or service attributes |
| **Slack/Teams** | Service context hub stores channel links; notifications include service info |
| **BullMQ/Redis** | Cascade status jobs queued when dependency status changes |
| **Socket.io** | Real-time graph updates when service status or dependencies change |
| **Audit Events** | Service CRUD operations logged with `resourceType: 'service'` |

---

## Migration Notes

The Service Catalog is **additive** to the existing schema:
1. New tables: `Service`, `ServiceDependency`, `BusinessService`, `ServiceStandard`
2. New FK on `Incident` table: `serviceId` (optional, for service-aware routing)
3. New FK on `StatusPageComponent`: `serviceId` (optional, replaces `serviceIdentifier` string)

No breaking changes to existing tables. Existing team-based routing continues working; service-based routing is opt-in per integration.

---

## Sources

- React Flow official docs (reactflow.dev) - v12.10.0 features, dagre integration patterns [HIGH confidence]
- PostgreSQL 16 docs - Recursive CTE syntax with CYCLE detection [HIGH confidence]
- Prisma docs - Self-referential relations, TypedSQL for raw queries [HIGH confidence]
- Zod 4 official docs (zod.dev) - Schema composition, TypeScript integration [HIGH confidence]
- DagreJS GitHub - v2.0.0 release notes (Nov 2025), ES module support [HIGH confidence]
- Backstage docs - Service catalog patterns (descriptor format, `dependsOn` modeling) [MEDIUM confidence - design patterns]

---

*Stack research for: Service Catalog milestone*
*Researched: 2026-02-08*
