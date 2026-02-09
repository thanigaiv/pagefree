---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/RunbooksPage.tsx
  - frontend/src/hooks/useRunbooks.ts
  - frontend/src/App.tsx
  - frontend/src/components/MobileLayout.tsx
autonomous: true

must_haves:
  truths:
    - "User can navigate to /runbooks and see list of runbooks"
    - "User can filter runbooks by team and approval status"
    - "User can create new runbook via dialog/modal"
    - "User can edit existing runbook"
    - "User can view execution history for each runbook"
  artifacts:
    - path: "frontend/src/pages/RunbooksPage.tsx"
      provides: "Runbook list page with filters and CRUD"
      min_lines: 200
    - path: "frontend/src/hooks/useRunbooks.ts"
      provides: "Extended hooks for full CRUD operations"
      exports: ["useRunbooks", "useRunbook", "useCreateRunbook", "useUpdateRunbook", "useDeleteRunbook", "useRunbookExecutions"]
  key_links:
    - from: "frontend/src/pages/RunbooksPage.tsx"
      to: "/api/runbooks"
      via: "useRunbooks hook"
      pattern: "useRunbooks|useCreateRunbook|useUpdateRunbook"
    - from: "frontend/src/App.tsx"
      to: "RunbooksPage"
      via: "Route element"
      pattern: "path.*runbooks.*element.*RunbooksPage"
---

<objective>
Create a dedicated RunbooksPage at /runbooks route with list, filters, create/edit capabilities, and execution history.

Purpose: Provide a management interface for runbooks separate from the incident context, allowing users to view, create, edit, and monitor runbook executions.

Output: Working RunbooksPage accessible from header navigation with full CRUD support.
</objective>

<execution_context>
@/Users/tvellore/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tvellore/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/pages/WorkflowsPage.tsx (pattern reference for list page with filters)
@frontend/src/hooks/useRunbooks.ts (existing hooks to extend)
@src/routes/runbook.routes.ts (backend API routes - already exist)
@frontend/src/App.tsx (add route)
@frontend/src/components/MobileLayout.tsx (fix runbooks nav link)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend useRunbooks hooks with full CRUD operations</name>
  <files>frontend/src/hooks/useRunbooks.ts</files>
  <action>
Add the following hooks to the existing useRunbooks.ts file:

1. `useRunbooks(filters)` - List runbooks with pagination and filters
   - Query params: teamId, approvalStatus, page, limit
   - Query key: ['runbooks', filters]
   - Returns: { runbooks, total, page, limit }

2. `useCreateRunbook()` - Create new runbook mutation
   - POST to /runbooks
   - Body: { name, description, teamId?, webhookUrl, webhookMethod, webhookHeaders?, webhookAuth?, parameters, payloadTemplate, timeoutSeconds }
   - Invalidates ['runbooks'] on success

3. `useUpdateRunbook()` - Update runbook mutation
   - PUT to /runbooks/:id
   - Body: same as create + changeNote?
   - Invalidates ['runbooks'] and ['runbook', id] on success

4. `useDeleteRunbook()` - Delete runbook mutation
   - DELETE to /runbooks/:id
   - Invalidates ['runbooks'] on success

5. `useRunbookExecutions(runbookId)` - Fetch execution history for a runbook
   - GET /runbooks/:id/executions
   - Query key: ['runbook', id, 'executions']
   - Returns: { executions }

6. `useApproveRunbook()` - Approve runbook (platform admin)
   - POST /runbooks/:id/approve
   - Invalidates runbook queries

7. `useDeprecateRunbook()` - Deprecate runbook (platform admin)
   - POST /runbooks/:id/deprecate
   - Body: { reason? }
   - Invalidates runbook queries

Also add types for RunbookFilters, CreateRunbookInput, UpdateRunbookInput.
  </action>
  <verify>TypeScript compiles without errors: `cd frontend && npx tsc --noEmit`</verify>
  <done>useRunbooks.ts exports all CRUD hooks with proper typing</done>
</task>

<task type="auto">
  <name>Task 2: Create RunbooksPage component</name>
  <files>frontend/src/pages/RunbooksPage.tsx</files>
  <action>
Create RunbooksPage following WorkflowsPage patterns. Include:

**Header:**
- Title "Runbooks" with BookOpen icon
- "Create Runbook" button (opens create dialog)

**Filters bar:**
- Search input (client-side filter by name/description)
- Team filter dropdown (select from user's teams + "All Teams")
- Approval Status filter: All, DRAFT, APPROVED, DEPRECATED
- Reset filters button when filters active

**List view:**
- Grid of RunbookCards (3 cols lg, 2 cols md, 1 col sm)
- Each card shows:
  - Name, description (truncated)
  - Approval status badge (color-coded: DRAFT=yellow, APPROVED=green, DEPRECATED=red)
  - Team name or "Global" badge
  - Version number
  - Last execution status (if any)
  - Actions dropdown: Edit, View History, Delete (with confirmation dialog)
  - For DRAFT: "Request Approval" indicator
  - For APPROVED: Quick execute button (with parameter modal)

**Empty state:**
- Icon, "No runbooks yet" message
- CTA to create first runbook

**Pagination:**
- Page controls (Previous/Next) when total > limit
- Show "Page X of Y"

**Create/Edit Dialog (same component, mode prop):**
- Form fields: name, description, team (dropdown or Global), webhookUrl, webhookMethod (GET/POST/PUT/PATCH), parameters (JSON editor or simple key-value pairs), payloadTemplate (textarea), timeoutSeconds
- Save/Cancel buttons
- Validation: name required, webhookUrl required, valid URL

**Execution History Panel:**
- Triggered by "View History" on card
- Shows list of executions: timestamp, status badge, triggered by, incident link (if any), duration
- Collapsible result/error details

Use shadcn components: Card, Button, Input, Select, Badge, Dialog, AlertDialog, Skeleton, Alert.
Use lucide icons: BookOpen, Plus, Search, Filter, Play, History, Edit, Trash2, ExternalLink.
  </action>
  <verify>Component renders without errors: `cd frontend && npm run build` succeeds</verify>
  <done>RunbooksPage.tsx exists with list, filters, create/edit dialog, and execution history panel</done>
</task>

<task type="auto">
  <name>Task 3: Wire up routing and navigation</name>
  <files>frontend/src/App.tsx, frontend/src/components/MobileLayout.tsx</files>
  <action>
**App.tsx:**
1. Import RunbooksPage: `import RunbooksPage from './pages/RunbooksPage';`
2. Add route inside MobileLayout Routes block (after workflows routes):
   ```tsx
   {/* Runbook routes */}
   <Route path="/runbooks" element={<RunbooksPage />} />
   ```

**MobileLayout.tsx:**
1. Update the desktopNavItems array - change Runbooks item from:
   ```tsx
   { to: '/workflows', icon: BookOpen, label: 'Runbooks' },
   ```
   to:
   ```tsx
   { to: '/runbooks', icon: BookOpen, label: 'Runbooks' },
   ```
  </action>
  <verify>Navigate to /runbooks in browser shows RunbooksPage; header Runbooks link points to /runbooks</verify>
  <done>Route /runbooks renders RunbooksPage; navigation link updated</done>
</task>

</tasks>

<verification>
1. `cd frontend && npm run build` - builds without errors
2. Navigate to /runbooks - shows runbook list page
3. Filters work - team and status dropdowns filter the list
4. Create runbook - dialog opens, can save new runbook
5. Edit runbook - can modify existing runbook
6. View history - shows execution history for runbook
7. Header navigation - Runbooks link goes to /runbooks (not /workflows)
</verification>

<success_criteria>
- RunbooksPage accessible at /runbooks
- List displays runbooks with proper cards and status badges
- Filters by team and approval status work
- Create/Edit dialog allows CRUD operations
- Execution history viewable per runbook
- Navigation header link points to /runbooks
</success_criteria>

<output>
After completion, create `.planning/quick/2-create-a-dedicated-runbookspage-with-lis/2-SUMMARY.md`
</output>
