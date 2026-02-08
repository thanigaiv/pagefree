# Phase 11: Service Model Foundation - Research

**Researched:** 2026-02-08
**Domain:** Service Catalog / Technical Service Management
**Confidence:** HIGH

## Summary

Phase 11 introduces a Service model as the foundation for service-based alert routing. The requirements are straightforward CRUD operations with team ownership, lifecycle management, and optional escalation policy overrides. The existing codebase patterns (Team, EscalationPolicy, Postmortem) provide excellent templates to follow.

The key insight from industry research (Backstage, PagerDuty patterns) is that services should be lightweight entities with clear ownership and routing capabilities. The roadmap decision to keep PostgreSQL for dependency graphs (Phase 12) and use React Flow for visualization (already installed) simplifies this phase significantly.

**Primary recommendation:** Follow existing Team/EscalationPolicy service patterns exactly. Service model is simpler than Team (no membership, simpler lifecycle). Focus on: (1) Prisma schema with ServiceStatus enum, (2) service.service.ts following team.service.ts pattern, (3) REST routes with Zod validation, (4) React Query hooks + directory page with search/filter.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^6.0.0 | Database ORM | Already used for all models |
| Zod | ^4.3.0 | Request validation | Already used in all routes |
| Express | ^4.18.0 | HTTP routing | Already used for API |
| @tanstack/react-query | ^5.90.20 | Data fetching/mutations | Already used for all frontend data |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^2.0.7 | Toast notifications | Success/error feedback |
| lucide-react | ^0.563.0 | Icons | UI icons |
| @radix-ui/* | various | UI primitives | Dialogs, dropdowns, badges |

### No New Dependencies Required
This phase uses only existing project dependencies. No new libraries needed.

## Architecture Patterns

### Recommended Project Structure (Following Existing Patterns)
```
src/
├── services/
│   └── service.service.ts      # New: ServiceService class
├── routes/
│   └── service.routes.ts       # New: REST endpoints with Zod
├── types/
│   └── service.ts              # New: TypeScript interfaces
prisma/
└── schema.prisma               # Add: Service model, ServiceStatus enum

frontend/src/
├── hooks/
│   └── useServices.ts          # New: React Query hooks
├── pages/
│   └── ServicesPage.tsx        # New: Directory page
├── types/
│   └── service.ts              # New: Frontend types
└── App.tsx                     # Add: Routes
```

### Pattern 1: Service Model (Prisma Schema)
**What:** Lightweight service entity with team ownership and lifecycle state
**When to use:** Core entity pattern for all Phase 11 requirements
**Example:**
```prisma
// Based on Backstage lifecycle + existing codebase patterns
enum ServiceStatus {
  ACTIVE       // Normal operating state
  DEPRECATED   // Soft notice: will be removed
  ARCHIVED     // Inactive, hidden from default views
}

model Service {
  id                  String        @id @default(cuid())
  name                String
  description         String?
  routingKey          String        @unique  // For alert routing (Phase 13)

  // Ownership (required per SVC-05)
  teamId              String
  team                Team          @relation(fields: [teamId], references: [id])

  // Optional escalation override (SVC-06)
  escalationPolicyId  String?
  escalationPolicy    EscalationPolicy? @relation(fields: [escalationPolicyId], references: [id])

  // Lifecycle (SVC-03)
  status              ServiceStatus @default(ACTIVE)

  // Metadata (SVC-02)
  tags                String[]      @default([])

  createdAt           DateTime      @default(now()) @db.Timestamptz
  updatedAt           DateTime      @updatedAt @db.Timestamptz

  @@index([teamId])
  @@index([status])
  @@index([routingKey])
  @@index([name])
}
```

### Pattern 2: Service Class (Following team.service.ts)
**What:** Business logic encapsulated in service class with audit logging
**When to use:** All CRUD operations
**Example:**
```typescript
// Source: Existing pattern from src/services/team.service.ts
class ServiceService {
  async create(input: CreateServiceInput, userId: string): Promise<ServiceWithTeam> {
    const service = await prisma.service.create({
      data: {
        name: input.name,
        description: input.description,
        routingKey: input.routingKey,
        teamId: input.teamId,
        escalationPolicyId: input.escalationPolicyId,
        tags: input.tags || [],
      },
      include: { team: true, escalationPolicy: true }
    });

    await auditService.log({
      action: 'service.created',
      userId,
      teamId: input.teamId,
      resourceType: 'service',
      resourceId: service.id,
      metadata: { name: service.name }
    });

    return service;
  }

  // list(), get(), update(), archive(), updateStatus()...
}

export const serviceService = new ServiceService();
```

### Pattern 3: REST Routes with Zod (Following team.routes.ts)
**What:** Express routes with Zod validation schemas
**When to use:** All API endpoints
**Example:**
```typescript
// Source: Existing pattern from src/routes/team.routes.ts
const CreateServiceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  routingKey: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  teamId: z.string().min(1),  // Required per SVC-05
  escalationPolicyId: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
});

serviceRouter.post('/', requireAuth, async (req, res) => {
  try {
    const input = CreateServiceSchema.parse(req.body);
    const service = await serviceService.create(input, (req.user as any).id);
    return res.status(201).json(service);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid service data', details: error.errors });
    }
    return res.status(500).json({ error: 'Failed to create service' });
  }
});
```

### Pattern 4: React Query Hooks (Following usePostmortems.ts)
**What:** Queries and mutations with cache invalidation
**When to use:** All frontend data operations
**Example:**
```typescript
// Source: Existing pattern from frontend/src/hooks/usePostmortems.ts
export function useServices(params?: { teamId?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['services', params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params?.teamId) query.set('teamId', params.teamId);
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      const response = await apiFetch<{ services: Service[]; total: number }>(
        `/services?${query.toString()}`
      );
      return response;
    }
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServiceInput) =>
      apiFetch<{ service: Service }>('/services', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}
```

### Anti-Patterns to Avoid
- **Service without team:** SVC-05 requires owning team. Make teamId required in schema and validation.
- **Hard delete:** Use status=ARCHIVED for soft delete. Services may have historical incidents.
- **Custom validation logic:** Use Zod for all validation. Don't duplicate in service layer.
- **Direct Prisma calls in routes:** Always go through service layer for audit logging.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Routing key generation | Custom UUID generator | cuid() default in Prisma or user-provided slug | cuid is already used throughout, routing keys should be human-readable |
| Search/filter | Custom SQL queries | Prisma where clauses with mode: 'insensitive' | Prisma handles SQL injection, pagination |
| State machine | Custom lifecycle manager | Simple status enum + validation | Three states (active/deprecated/archived) don't need full FSM |
| Form validation | Custom validators | Zod schemas (backend) + inline validation (frontend) | Consistent with existing patterns |
| Cache invalidation | Manual cache busting | React Query invalidateQueries | Already handles this correctly |

**Key insight:** The service model is simpler than Team (no membership complexity) and simpler than EscalationPolicy (no levels). Follow the simpler pattern.

## Common Pitfalls

### Pitfall 1: Orphaned Services When Team is Archived
**What goes wrong:** Team gets archived, services still reference it, queries fail or show inconsistent state
**Why it happens:** No cascade logic or validation on team archive
**How to avoid:** When listing services, join with team and filter by team.isActive=true. When archiving a team, warn if services exist.
**Warning signs:** "Team not found" errors when viewing service

### Pitfall 2: Routing Key Collisions
**What goes wrong:** Two services have same routing key, alerts route to wrong service
**Why it happens:** routingKey not unique, or user edits existing key to conflict
**How to avoid:** @unique constraint on routingKey, validate uniqueness in create/update
**Warning signs:** Alerts going to wrong team

### Pitfall 3: Missing Team Selection in Create Form
**What goes wrong:** User creates service without team, validation fails with cryptic error
**Why it happens:** teamId field not clearly required in UI
**How to avoid:** Pre-populate team dropdown from user's teams, mark as required, validate before submit
**Warning signs:** "teamId is required" errors

### Pitfall 4: Status Filter Default Hides All Services
**What goes wrong:** New user sees empty service directory
**Why it happens:** Default filter set to status=ACTIVE but no services created yet, or all services archived
**How to avoid:** Show "No services found" empty state with clear "Create Service" CTA. Default to showing ACTIVE services only.
**Warning signs:** Empty list with no explanation

### Pitfall 5: Escalation Policy Deleted While Service References It
**What goes wrong:** Service has escalationPolicyId pointing to deleted policy
**Why it happens:** Escalation policy hard-deleted, service.escalationPolicyId now dangling
**How to avoid:** escalationPolicyId is nullable (optional override). When policy deleted, null out references or prevent deletion.
**Warning signs:** "Policy not found" errors when viewing service

## Code Examples

### Service Directory Page (Following TeamsAdminPage.tsx)
```typescript
// Source: Existing pattern from frontend/src/pages/TeamsAdminPage.tsx
export default function ServicesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [teamFilter, setTeamFilter] = useState<string | undefined>();

  const { data, isLoading } = useServices({
    search: search || undefined,
    status: statusFilter || undefined,
    teamId: teamFilter
  });

  // Dialog state for create/edit/archive (same pattern as TeamsAdminPage)

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Service Directory</h1>
          <p className="text-muted-foreground mt-1">
            Manage technical services and their routing
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Service
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          {/* ACTIVE, DEPRECATED, ARCHIVED, all */}
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          {/* Team filter from useTeams() */}
        </Select>
      </div>

      {/* Service cards grid - same pattern as TeamsAdminPage */}
    </div>
  );
}
```

### Backend Service List with Search/Filter
```typescript
// Source: Based on existing team.service.ts list() pattern
async list(params: {
  teamId?: string;
  status?: ServiceStatus;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.ServiceWhereInput = {};

  // Filter by team
  if (params.teamId) {
    where.teamId = params.teamId;
  }

  // Filter by status (default: show only active if not specified)
  if (params.status) {
    where.status = params.status;
  }

  // Search by name (case insensitive)
  if (params.search) {
    where.name = { contains: params.search, mode: 'insensitive' };
  }

  // Only include services from active teams
  where.team = { isActive: true };

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } }
      },
      skip: params.offset || 0,
      take: params.limit || 50,
      orderBy: { name: 'asc' }
    }),
    prisma.service.count({ where })
  ]);

  return { services, total };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Team-based routing (TeamTag) | Service-based routing (routing_key) | v1.1 (this phase) | Backward compatible, services optional |
| N/A (no service model) | Service entity with lifecycle | v1.1 (this phase) | Foundation for dependency graph (Phase 12) |

**What's changing:**
- Current: Alerts route via TeamTag matching
- After Phase 13: Alerts route via Service.routingKey, falling back to TeamTag
- This phase: Builds the Service model foundation, routing happens in Phase 13

## Open Questions

1. **Routing key format and validation**
   - What we know: Must be unique, used for alert routing
   - What's unclear: Should it be auto-generated, user-provided, or both?
   - Recommendation: User-provided with validation (alphanumeric + dash/underscore), optionally auto-generate from name slug

2. **Tag taxonomy**
   - What we know: Services can have tags for filtering (SVC-02)
   - What's unclear: Free-form tags or predefined taxonomy like TeamTag?
   - Recommendation: Free-form string array initially. Can add predefined taxonomy later if needed.

3. **Permissions model**
   - What we know: Services belong to teams
   - What's unclear: Who can create/edit services? Team admins only? Any team member?
   - Recommendation: Follow existing pattern - platform admin can create any service, team admin can edit their team's services

## Sources

### Primary (HIGH confidence)
- `/Users/tvellore/work/pagefree/prisma/schema.prisma` - Existing data model patterns
- `/Users/tvellore/work/pagefree/src/services/team.service.ts` - Service layer pattern
- `/Users/tvellore/work/pagefree/src/routes/team.routes.ts` - REST route pattern
- `/Users/tvellore/work/pagefree/frontend/src/hooks/usePostmortems.ts` - React Query pattern
- `/Users/tvellore/work/pagefree/frontend/src/pages/TeamsAdminPage.tsx` - Page component pattern

### Secondary (MEDIUM confidence)
- Backstage Software Catalog descriptor format - Lifecycle states (experimental/production/deprecated)
- Prisma documentation - Model definition best practices

### Tertiary (LOW confidence)
- PagerDuty service model concepts (could not access direct documentation, based on general knowledge)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using only existing project dependencies
- Architecture: HIGH - Following existing codebase patterns exactly
- Pitfalls: MEDIUM - Based on common patterns, team-specific edge cases may exist

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (patterns stable, no external API changes expected)
