# Phase 10: Postmortems - Research

**Researched:** 2026-02-08
**Domain:** Incident postmortem documentation and action item tracking
**Confidence:** HIGH

## Summary

Phase 10 implements postmortem functionality that builds directly on existing Phase 6 incident timeline infrastructure. The core insight is that incident timelines are already built from audit events (established in 04-05), so "auto-generating timeline for postmortem" means querying and formatting existing AuditEvent data - no new data collection needed.

The system requires a new `Postmortem` model with linked `ActionItem` tracking. The existing MarkdownEditor component from Phase 6 provides the foundation for the postmortem document editor. Sharing uses existing team-based access patterns from Phase 1 RBAC - "share with team" means team members can view based on TeamRole permissions.

**Primary recommendation:** Use existing audit timeline infrastructure for timeline generation, extend MarkdownEditor for postmortem content, implement action items as first-class tracked entities with completion state machine.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^6.0.0 | Database ORM | Already used throughout project |
| @tanstack/react-query | ^5.90.20 | Server state management | Existing pattern for all data fetching |
| react-markdown | ^10.1.0 | Markdown rendering | Already used in MarkdownEditor |
| date-fns | ^4.1.0 | Date formatting | Already used for timeline formatting |
| zod | ^4.3.0 | Schema validation | Already used for API validation |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^2.0.7 | Toast notifications | User feedback on actions |
| lucide-react | ^0.563.0 | Icons | UI consistency |
| @radix-ui/* | Various | UI primitives | Existing shadcn/ui patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Markdown (existing) | TipTap/Slate rich editor | More features but adds complexity and bundle size; existing MarkdownEditor sufficient per user notes pattern |
| New timeline table | Audit events (existing) | Audit events already capture all incident history; no duplication needed |
| Separate share permissions | Team-based RBAC (existing) | Full visibility model already allows cross-team viewing; team-scoped postmortems natural fit |

**Installation:**
```bash
# No new dependencies required - all needed libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   └── postmortem.service.ts    # CRUD, timeline generation, sharing
├── routes/
│   └── postmortem.routes.ts     # REST API endpoints
└── types/
    └── postmortem.ts            # TypeScript interfaces

frontend/src/
├── hooks/
│   └── usePostmortems.ts        # React Query hooks
├── pages/
│   ├── PostmortemsPage.tsx      # List view
│   └── PostmortemDetailPage.tsx # Create/edit view
└── components/
    ├── PostmortemEditor.tsx     # Content editor (extends MarkdownEditor)
    ├── PostmortemTimeline.tsx   # Auto-generated timeline view
    └── ActionItemList.tsx       # Action item tracker
```

### Pattern 1: Timeline Generation from Audit Events
**What:** Query existing AuditEvent records for incident timeline data
**When to use:** When user creates postmortem or views auto-generated timeline
**Example:**
```typescript
// Source: Existing pattern from src/services/incident.service.ts (getTimeline method)
async getPostmortemTimeline(incidentIds: string[]): Promise<TimelineEvent[]> {
  // Re-use existing audit event query pattern from incident.service.ts
  const events = await prisma.auditEvent.findMany({
    where: {
      resourceType: 'incident',
      resourceId: { in: incidentIds }
    },
    orderBy: { timestamp: 'asc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  // Add incident context for multi-incident postmortems
  return events.map(e => ({
    ...e,
    incidentId: e.resourceId,
    formattedAction: formatAction(e.action) // existing helper
  }));
}
```

### Pattern 2: Action Item State Machine
**What:** Track action items with clear status progression
**When to use:** For all action item status transitions
**Example:**
```typescript
// Action item statuses follow simple linear progression
type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';

// Status transitions
const VALID_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]> = {
  OPEN: ['IN_PROGRESS', 'COMPLETED'],
  IN_PROGRESS: ['COMPLETED', 'OPEN'], // Can reopen if blocked
  COMPLETED: ['OPEN'] // Can reopen if follow-up needed
};
```

### Pattern 3: Team-Scoped Postmortems with Full Visibility
**What:** Postmortems owned by team, viewable by all per existing RBAC
**When to use:** For all postmortem access control
**Example:**
```typescript
// Source: Existing pattern from src/services/permission.service.ts
// "Full visibility - all teams can see other teams' incidents" applies to postmortems
canViewPostmortem(_user: AuthenticatedUser, _postmortemId: string): PermissionResult {
  return { allowed: true }; // Any authenticated user can view
}

canEditPostmortem(user: AuthenticatedUser, teamId: string): PermissionResult {
  // Only team members with RESPONDER+ role can edit
  return this.hasMinimumTeamRole(user, teamId, 'RESPONDER')
    ? { allowed: true }
    : { allowed: false, reason: 'Only team responders can edit postmortems' };
}
```

### Anti-Patterns to Avoid
- **Duplicating timeline data:** Don't create separate timeline storage; audit events ARE the timeline
- **Over-complex rich text:** Don't add TipTap/Slate when existing MarkdownEditor meets requirements
- **Separate permission system:** Don't create postmortem-specific RBAC; reuse existing team role checks
- **Action items without owners:** Every action item needs an assignee for accountability

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timeline display | Custom timeline component | Existing TimelineEventCard from Phase 6 | Already handles all audit event types |
| Markdown editing | New rich text editor | Existing MarkdownEditor component | Same editor used for incident notes |
| Access control | Custom permission checks | Existing permissionService | Team-based RBAC already implemented |
| Date formatting | Custom date helpers | date-fns with existing patterns | formatDistanceToNow, format already in use |
| Form state | Custom form handling | useState pattern from StatusPagesPage | Consistent with existing form patterns |

**Key insight:** Phase 10 primarily composes existing components and patterns rather than building new infrastructure.

## Common Pitfalls

### Pitfall 1: Timeline Data Duplication
**What goes wrong:** Creating separate postmortem_events table duplicating audit events
**Why it happens:** Instinct to "own" postmortem data separately
**How to avoid:** Query AuditEvent directly; postmortem stores incidentIds reference only
**Warning signs:** Schema design includes timeline fields beyond incident references

### Pitfall 2: Action Item Orphans
**What goes wrong:** Action items without clear ownership or due dates become forgotten
**Why it happens:** Making assignee/dueDate optional "for flexibility"
**How to avoid:** Require assigneeId on creation; dueDate optional but prominently displayed when missing
**Warning signs:** High percentage of action items with no assignee or stale dates

### Pitfall 3: Permission Complexity
**What goes wrong:** Building separate share/permission system for postmortems
**Why it happens:** "Share with team" sounds like new functionality
**How to avoid:** Postmortem has teamId; use existing canViewTeam (full visibility) and team role checks
**Warning signs:** New permission tables or complex share logic

### Pitfall 4: Rich Text Scope Creep
**What goes wrong:** Adding TipTap/Slate for "proper" postmortem editing
**Why it happens:** Markdown feels "limited" for formal documents
**How to avoid:** Stick with existing MarkdownEditor; markdown handles 90% of use cases (headers, lists, code blocks, links)
**Warning signs:** Discussions about WYSIWYG, collaborative editing, or image embedding

### Pitfall 5: Multi-Incident Complexity
**What goes wrong:** Over-engineering for complex multi-incident postmortems
**Why it happens:** Major incidents span multiple related incidents
**How to avoid:** Simple array of incident IDs; timeline merges events chronologically
**Warning signs:** Complex incident relationship modeling beyond simple references

## Code Examples

Verified patterns from existing codebase:

### Postmortem Service Pattern
```typescript
// Follow existing service singleton pattern (src/services/incident.service.ts)
class PostmortemService {
  async create(data: CreatePostmortemInput, userId: string): Promise<Postmortem> {
    const postmortem = await prisma.postmortem.create({
      data: {
        title: data.title,
        content: data.content || '',
        incidentIds: data.incidentIds,
        teamId: data.teamId,
        createdById: userId,
        status: 'DRAFT'
      }
    });

    // Audit log following existing pattern
    await auditService.log({
      action: 'postmortem.created',
      userId,
      teamId: data.teamId,
      resourceType: 'postmortem',
      resourceId: postmortem.id,
      severity: 'INFO'
    });

    return postmortem;
  }
}

export const postmortemService = new PostmortemService();
```

### Action Item Completion Pattern
```typescript
// Follow existing status update pattern (src/services/incident.service.ts)
async updateActionItemStatus(
  actionItemId: string,
  status: ActionItemStatus,
  userId: string
): Promise<ActionItem> {
  const item = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    include: { postmortem: true }
  });

  if (!item) throw new Error('Action item not found');

  // Validate state transition
  if (!VALID_TRANSITIONS[item.status].includes(status)) {
    throw new Error(`Cannot transition from ${item.status} to ${status}`);
  }

  const updated = await prisma.actionItem.update({
    where: { id: actionItemId },
    data: {
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null
    }
  });

  await auditService.log({
    action: 'postmortem.action_item.updated',
    userId,
    teamId: item.postmortem.teamId,
    resourceType: 'action_item',
    resourceId: actionItemId,
    severity: 'INFO',
    metadata: { previousStatus: item.status, newStatus: status }
  });

  return updated;
}
```

### Frontend Hook Pattern
```typescript
// Follow existing pattern from frontend/src/hooks/useStatusPages.ts
export function usePostmortems(teamId?: string) {
  return useQuery({
    queryKey: ['postmortems', { teamId }],
    queryFn: () => apiFetch<Postmortem[]>(`/postmortems${teamId ? `?teamId=${teamId}` : ''}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePostmortemInput) =>
      apiFetch<Postmortem>('/postmortems', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    },
  });
}
```

### PostmortemEditor Component Pattern
```typescript
// Extend existing MarkdownEditor pattern
export function PostmortemEditor({ postmortem, onSave }: PostmortemEditorProps) {
  const [content, setContent] = useState(postmortem.content);
  const [title, setTitle] = useState(postmortem.title);
  const updateMutation = useUpdatePostmortem(postmortem.id);

  const handleSave = () => {
    updateMutation.mutate({ title, content });
  };

  return (
    <div className="space-y-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Postmortem title"
      />
      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="Write your postmortem analysis..."
        minRows={10}
      />
      <Button onClick={handleSave} disabled={updateMutation.isPending}>
        {updateMutation.isPending ? <Loader2 className="animate-spin" /> : null}
        Save
      </Button>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate timeline tables | Timeline from audit events | Phase 4 (04-05) | Single source of truth for incident history |
| Complex WYSIWYG editors | Markdown with preview | Industry trend | Simpler, faster, sufficient for documentation |
| Per-document sharing | Team-based access | Phase 1 RBAC | Consistent access model across platform |

**Deprecated/outdated:**
- Rich text editors with complex toolbar: Markdown sufficient for postmortems
- Separate notification system for sharing: Existing team visibility covers access

## Open Questions

1. **Template system for postmortems?**
   - What we know: Users may want standard sections (Summary, Timeline, Root Cause, Action Items)
   - What's unclear: Should templates be enforced or suggested?
   - Recommendation: Start with suggested template (default content), don't enforce structure

2. **Export format?**
   - What we know: Teams may want to export postmortems for external sharing
   - What's unclear: PDF, HTML, or markdown export?
   - Recommendation: Markdown export first (simplest), defer PDF to future

3. **Action item notifications?**
   - What we know: Assignees should know about their action items
   - What's unclear: Should notifications use existing notification system or just in-app?
   - Recommendation: In-app only for v1; action items visible on user's dashboard

## Sources

### Primary (HIGH confidence)
- `/Users/tvellore/work/pd/src/services/incident.service.ts` - Timeline implementation (getTimeline method, addNote method)
- `/Users/tvellore/work/pd/src/services/audit.service.ts` - Audit event patterns
- `/Users/tvellore/work/pd/src/services/permission.service.ts` - Team-based RBAC patterns
- `/Users/tvellore/work/pd/frontend/src/components/MarkdownEditor.tsx` - Existing markdown editor
- `/Users/tvellore/work/pd/frontend/src/components/TimelineEvent.tsx` - Timeline display patterns
- `/Users/tvellore/work/pd/prisma/schema.prisma` - Existing data models

### Secondary (MEDIUM confidence)
- `/Users/tvellore/work/pd/.planning/STATE.md` - Prior decisions documentation
- `/Users/tvellore/work/pd/.planning/REQUIREMENTS.md` - POST-01 through POST-05 requirements

### Tertiary (LOW confidence)
- None - all research based on existing codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using only existing dependencies
- Architecture: HIGH - extending proven patterns from Phase 4-6
- Pitfalls: HIGH - derived from actual codebase analysis

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - stable domain)
