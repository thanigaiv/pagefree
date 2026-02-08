# Phase 12: Service Dependencies & Graph - Research

**Researched:** 2026-02-08
**Domain:** Graph data modeling, visualization, cycle detection
**Confidence:** HIGH

## Summary

Phase 12 implements service dependency modeling and visualization. Services can declare "depends on" relationships forming a directed acyclic graph (DAG). The key technical challenges are: (1) preventing cycles at creation time, (2) efficiently querying upstream/downstream relationships, and (3) visualizing the dependency graph.

The codebase already has proven patterns for all major components: React Flow v12 + dagre layout is established in WorkflowCanvas, PostgreSQL recursive CTEs are well-documented, and the Services API provides a template for dependency endpoints.

**Primary recommendation:** Extend the Service model with a self-referential many-to-many relationship using Prisma's implicit join table. Implement cycle detection in the backend service layer using DFS before persisting. Reuse the existing React Flow + dagre patterns from WorkflowCanvas for visualization.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | ^12.10.0 | Graph visualization | Already installed, proven in WorkflowCanvas |
| dagre | 0.8.5 | Auto-layout algorithm | Already installed, working with current React Flow |
| Prisma | (existing) | ORM with self-relations | Implicit many-to-many handles join table |
| PostgreSQL | (existing) | WITH RECURSIVE for graph queries | Native cycle detection and path queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dagrejs/dagre | 2.0.3 | Updated dagre fork | Optional upgrade - only if 0.8.5 has issues |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dagre | elkjs | More powerful but significantly more complex |
| dagre | d3-hierarchy | Requires single root node - not suitable for DAG |
| PostgreSQL CTEs | Graph DB | Overkill - CTEs handle this scale efficiently |

**Installation:**
No new packages required. Current stack is sufficient.

## Architecture Patterns

### Database Schema Extension
```prisma
model Service {
  // ... existing fields ...

  // Self-referential many-to-many for dependencies
  dependsOn    Service[] @relation("ServiceDependency")
  dependedOnBy Service[] @relation("ServiceDependency")
}
```

Prisma creates an implicit `_ServiceDependency` join table with `A` and `B` columns.

### Recommended API Structure
```
GET    /api/services/:id/dependencies          # List all dependencies (upstream)
GET    /api/services/:id/dependents            # List all dependents (downstream)
POST   /api/services/:id/dependencies          # Add dependency { dependsOnId }
DELETE /api/services/:id/dependencies/:depId   # Remove dependency
GET    /api/services/:id/graph                 # Full graph for visualization
```

### Service Layer Pattern
```typescript
// service-dependency.service.ts
export class ServiceDependencyService {
  async addDependency(serviceId: string, dependsOnId: string, userId: string) {
    // 1. Validate both services exist
    // 2. Check cycle detection BEFORE persisting
    // 3. Create relationship
    // 4. Audit log
  }

  async getUpstream(serviceId: string): Promise<Service[]> {
    // Direct dependencies (what this service depends on)
  }

  async getDownstream(serviceId: string): Promise<Service[]> {
    // Direct dependents (what depends on this service)
  }

  async getTransitiveUpstream(serviceId: string): Promise<Service[]> {
    // All ancestors using recursive CTE
  }

  async getGraph(serviceId: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    // Full connected subgraph for visualization
  }
}
```

### Recommended Project Structure
```
src/
├── services/
│   └── service-dependency.service.ts   # New: dependency operations
├── routes/
│   └── service.routes.ts               # Extend with dependency endpoints
└── types/
    └── service.ts                      # Extend with dependency types

frontend/src/
├── components/
│   └── services/
│       └── DependencyGraph.tsx         # New: visualizes service graph
├── hooks/
│   └── useServiceDependencies.ts       # New: dependency queries/mutations
├── pages/
│   └── ServicesPage.tsx                # Extend with graph view toggle
└── types/
    └── service.ts                      # Extend with dependency types
```

### Pattern 1: Cycle Detection (Backend DFS)
**What:** Detect cycles before persisting new dependency edges
**When to use:** On every POST to /dependencies endpoint
**Example:**
```typescript
// Source: Existing pattern in WorkflowCanvas.tsx lines 171-207
function wouldCreateCycle(
  sourceId: string,
  targetId: string,
  existingEdges: { source: string; target: string }[]
): boolean {
  // Build adjacency list including proposed edge
  const adjacency = new Map<string, string[]>();

  existingEdges.forEach(edge => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  });

  // Add proposed edge
  if (!adjacency.has(sourceId)) {
    adjacency.set(sourceId, []);
  }
  adjacency.get(sourceId)!.push(targetId);

  // DFS from target to check if we can reach source
  const visited = new Set<string>();
  const stack = [targetId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceId) return true; // Cycle found
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) || []));
  }

  return false;
}
```

### Pattern 2: PostgreSQL Recursive CTE for Transitive Dependencies
**What:** Query all upstream or downstream services efficiently
**When to use:** For "show all transitive dependencies" views
**Example:**
```sql
-- Source: PostgreSQL official docs
-- Get all transitive upstream dependencies
WITH RECURSIVE upstream AS (
  -- Base case: direct dependencies
  SELECT "A" as service_id, "B" as depends_on_id, 1 as depth,
         ARRAY["A"] as path
  FROM "_ServiceDependency"
  WHERE "A" = $1

  UNION ALL

  -- Recursive case: dependencies of dependencies
  SELECT sd."A", sd."B", u.depth + 1,
         u.path || sd."A"
  FROM "_ServiceDependency" sd
  JOIN upstream u ON sd."A" = u.depends_on_id
  WHERE NOT sd."A" = ANY(u.path)  -- Cycle prevention
)
SELECT DISTINCT depends_on_id FROM upstream;
```

### Pattern 3: React Flow Dependency Graph Component
**What:** Reusable graph visualization for service dependencies
**When to use:** Service detail view, dedicated graph page
**Example:**
```typescript
// Source: Adapted from WorkflowCanvas.tsx
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import dagre from 'dagre';

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });

  nodes.forEach(node => g.setNode(node.id, { width: 200, height: 80 }));
  edges.forEach(edge => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  return {
    nodes: nodes.map(node => {
      const pos = g.node(node.id);
      return { ...node, position: { x: pos.x - 100, y: pos.y - 40 } };
    }),
    edges
  };
}

export function DependencyGraph({ serviceId }: { serviceId: string }) {
  const { data } = useServiceGraph(serviceId);
  const { nodes, edges } = getLayoutedElements(data?.nodes || [], data?.edges || []);

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
```

### Anti-Patterns to Avoid
- **Storing cycles:** Never allow cycles - they break impact analysis and create infinite loops
- **N+1 queries for graph:** Use recursive CTE or batch queries, not individual fetches
- **Client-side cycle detection only:** Must validate on server - client can be bypassed
- **Allowing self-dependency:** A service depending on itself is always invalid

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph layout | Manual positioning | dagre auto-layout | Complex algorithm, already proven |
| Graph visualization | Custom SVG/Canvas | React Flow | Handles pan/zoom/selection/edges |
| Transitive queries | Recursive JS loops | PostgreSQL WITH RECURSIVE | DB-level efficiency, handles cycles |
| Join table | Explicit Prisma model | Implicit `@relation` | Simpler, auto-managed by Prisma |

**Key insight:** The existing WorkflowCanvas implementation already solved graph visualization with React Flow + dagre. Reuse these patterns rather than building new solutions.

## Common Pitfalls

### Pitfall 1: Missing Cycle Detection on Update
**What goes wrong:** Cycles sneak in through bulk updates or API bypass
**Why it happens:** Validation only on single-edge create, not batch operations
**How to avoid:** Always validate after any dependency mutation, not just creates
**Warning signs:** Infinite loops in impact analysis, recursive CTE timeouts

### Pitfall 2: Performance with Deep Dependency Chains
**What goes wrong:** Transitive dependency queries become slow with 10+ levels
**Why it happens:** Recursive CTEs without depth limits
**How to avoid:** Add MAX_DEPTH limit (e.g., 10 levels), paginate results
**Warning signs:** Graph API responses > 500ms, PostgreSQL timeouts

### Pitfall 3: Graph Visualization Performance
**What goes wrong:** Browser freezes with 50+ nodes
**Why it happens:** React Flow renders all nodes, dagre layout is O(V+E)
**How to avoid:** Limit displayed nodes, use "focus + neighbors" view
**Warning signs:** Canvas becomes unresponsive, layout takes > 1 second

### Pitfall 4: Orphaned Dependencies on Service Archive
**What goes wrong:** Archived services still show in dependency graphs
**Why it happens:** Dependencies not cleaned up when service status changes
**How to avoid:** Decide policy - either remove deps on archive, or show archived with visual indicator
**Warning signs:** Graph shows "ghost" services that no longer exist

### Pitfall 5: Bidirectional Confusion
**What goes wrong:** API returns wrong direction (upstream vs downstream swapped)
**Why it happens:** Confusing "depends on" vs "depended on by" naming
**How to avoid:** Clear naming: `getUpstream()` = what I depend on, `getDownstream()` = what depends on me
**Warning signs:** Impact analysis shows wrong services, users report inverted graphs

## Code Examples

### Backend: Add Dependency with Cycle Check
```typescript
// Source: Pattern from WorkflowCanvas + Prisma docs
async addDependency(serviceId: string, dependsOnId: string, userId: string) {
  // 1. Validate services exist
  const [service, dependsOn] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    prisma.service.findUnique({ where: { id: dependsOnId } })
  ]);

  if (!service || !dependsOn) {
    throw new Error('Service not found');
  }

  if (serviceId === dependsOnId) {
    throw new Error('Service cannot depend on itself');
  }

  // 2. Get existing dependencies
  const existing = await prisma.$queryRaw<{ a: string; b: string }[]>`
    SELECT "A" as a, "B" as b FROM "_ServiceDependency"
  `;

  // 3. Check for cycle
  if (this.wouldCreateCycle(serviceId, dependsOnId, existing)) {
    throw new Error('Dependency would create a cycle');
  }

  // 4. Create dependency
  await prisma.service.update({
    where: { id: serviceId },
    data: { dependsOn: { connect: { id: dependsOnId } } }
  });

  // 5. Audit
  await auditService.log({
    action: 'service.dependency.added',
    userId,
    resourceType: 'service',
    resourceId: serviceId,
    metadata: { dependsOnId }
  });
}
```

### Backend: Recursive CTE for Graph Data
```typescript
// Source: PostgreSQL docs + Prisma raw queries
async getGraph(serviceId: string): Promise<{ nodes: Service[]; edges: Edge[] }> {
  // Get all connected services (both directions) up to 10 levels deep
  const connectedIds = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE connected AS (
      -- Start node
      SELECT id FROM "Service" WHERE id = ${serviceId}

      UNION

      -- Upstream (what this depends on)
      SELECT "B" as id
      FROM "_ServiceDependency" sd
      JOIN connected c ON sd."A" = c.id

      UNION

      -- Downstream (what depends on this)
      SELECT "A" as id
      FROM "_ServiceDependency" sd
      JOIN connected c ON sd."B" = c.id
    )
    SELECT DISTINCT id FROM connected LIMIT 100
  `;

  const ids = connectedIds.map(r => r.id);

  // Fetch full service data
  const nodes = await prisma.service.findMany({
    where: { id: { in: ids } },
    include: { team: { select: { id: true, name: true } } }
  });

  // Fetch edges between these services
  const edges = await prisma.$queryRaw<{ source: string; target: string }[]>`
    SELECT "A" as source, "B" as target
    FROM "_ServiceDependency"
    WHERE "A" = ANY(${ids}::text[]) AND "B" = ANY(${ids}::text[])
  `;

  return { nodes, edges };
}
```

### Frontend: Custom Service Node Component
```typescript
// Source: Pattern from WorkflowCanvas node components
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface ServiceNodeData {
  name: string;
  team: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  isFocused?: boolean;
}

export function ServiceNode({ data, selected }: NodeProps<ServiceNodeData>) {
  const statusColors = {
    ACTIVE: 'bg-green-100 border-green-300',
    DEPRECATED: 'bg-yellow-100 border-yellow-300',
    ARCHIVED: 'bg-gray-100 border-gray-300'
  };

  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 shadow-sm
      ${statusColors[data.status]}
      ${selected ? 'ring-2 ring-blue-500' : ''}
      ${data.isFocused ? 'ring-2 ring-purple-500' : ''}
    `}>
      <Handle type="target" position={Position.Left} />
      <div className="font-medium">{data.name}</div>
      <div className="text-xs text-gray-500">{data.team}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

### Frontend: Dependency Management UI Hook
```typescript
// Source: Pattern from useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useServiceDependencies(serviceId: string) {
  return useQuery({
    queryKey: ['service-dependencies', serviceId],
    queryFn: () => apiFetch<{ dependencies: Service[] }>(
      `/services/${serviceId}/dependencies`
    ).then(r => r.dependencies),
    enabled: !!serviceId
  });
}

export function useServiceDependents(serviceId: string) {
  return useQuery({
    queryKey: ['service-dependents', serviceId],
    queryFn: () => apiFetch<{ dependents: Service[] }>(
      `/services/${serviceId}/dependents`
    ).then(r => r.dependents),
    enabled: !!serviceId
  });
}

export function useServiceGraph(serviceId: string) {
  return useQuery({
    queryKey: ['service-graph', serviceId],
    queryFn: () => apiFetch<{ nodes: Node[]; edges: Edge[] }>(
      `/services/${serviceId}/graph`
    ),
    enabled: !!serviceId
  });
}

export function useAddDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dependsOnId }: { serviceId: string; dependsOnId: string }) =>
      apiFetch(`/services/${serviceId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ dependsOnId })
      }),
    onSuccess: (_, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['service-dependencies', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-graph', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}

export function useRemoveDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dependsOnId }: { serviceId: string; dependsOnId: string }) =>
      apiFetch(`/services/${serviceId}/dependencies/${dependsOnId}`, {
        method: 'DELETE'
      }),
    onSuccess: (_, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['service-dependencies', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-graph', serviceId] });
    }
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dagre 0.8.5 (unscoped) | @dagrejs/dagre 2.0.3 | Nov 2025 | Active maintenance, ES modules |
| react-flow | @xyflow/react | v12 | Renamed package, same API |
| Manual graph queries | PostgreSQL CYCLE clause | PG 14+ | Built-in cycle detection |

**Deprecated/outdated:**
- `react-flow` package: Renamed to `@xyflow/react` in v12
- `dagre` (unscoped): Unmaintained, use `@dagrejs/dagre` for updates

**Note:** Current codebase uses `dagre@0.8.5` which works. Upgrade to `@dagrejs/dagre@2.0.3` is optional but recommended for long-term maintenance.

## Open Questions

1. **Transitive vs Direct Dependencies Display**
   - What we know: Need both direct (immediate) and transitive (all ancestors)
   - What's unclear: Should graph show transitive by default or on-demand?
   - Recommendation: Default to direct only, offer "expand all" toggle

2. **Maximum Dependency Depth**
   - What we know: Recursive CTEs can be expensive with deep graphs
   - What's unclear: What's a reasonable limit for real-world services?
   - Recommendation: Start with 10 levels, add depth parameter to API

3. **Archived Service Dependencies**
   - What we know: Archived services should be hidden from default views
   - What's unclear: Should dependencies to/from archived services be auto-removed?
   - Recommendation: Keep deps but show archived indicator in graph, filter from dropdowns

## Sources

### Primary (HIGH confidence)
- @xyflow/react - Official docs at reactflow.dev (Learn, API Reference)
- PostgreSQL WITH RECURSIVE - Official docs postgresql.org/docs/current/queries-with.html
- Existing WorkflowCanvas.tsx - Proven React Flow + dagre pattern in codebase
- Existing useServices.ts - TanStack Query pattern for service hooks

### Secondary (MEDIUM confidence)
- Prisma self-relations - prisma.io/docs/orm/prisma-schema/data-model/relations/self-relations
- dagre GitHub wiki - github.com/dagrejs/dagre/wiki (API documentation)

### Tertiary (LOW confidence)
- @dagrejs/dagre upgrade path - npm registry shows 2.0.3, API compatibility assumed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and proven
- Architecture: HIGH - Patterns extracted from existing WorkflowCanvas
- Pitfalls: MEDIUM - Based on general graph database experience
- Cycle detection: HIGH - Algorithm proven in WorkflowCanvas, SQL from official docs

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - stable libraries)
