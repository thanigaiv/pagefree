---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/hooks/useSchedules.ts
  - frontend/src/pages/SchedulePage.tsx
autonomous: true

must_haves:
  truths:
    - "User can view list of schedules by team"
    - "User can see who is currently on-call for each schedule"
    - "User can create and manage schedule overrides"
    - "User can create shift swaps between users"
  artifacts:
    - path: "frontend/src/hooks/useSchedules.ts"
      provides: "Schedule data fetching and mutations"
      exports: ["useSchedules", "useSchedule", "useCreateOverride", "useCreateSwap", "useDeleteOverride"]
    - path: "frontend/src/pages/SchedulePage.tsx"
      provides: "Schedule management UI"
      min_lines: 400
  key_links:
    - from: "frontend/src/pages/SchedulePage.tsx"
      to: "/api/schedules"
      via: "fetch via useSchedules hooks"
      pattern: "apiFetch.*schedules"
---

<objective>
Implement the schedule management frontend for viewing on-call schedules, creating overrides, and swapping shifts.

Purpose: Replace the placeholder SchedulePage with a fully functional schedule management interface that leverages the existing backend API (Phase 3).

Output: Complete SchedulePage.tsx with hooks for schedule CRUD, override management, and shift swaps.
</objective>

<execution_context>
@/Users/tvellore/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tvellore/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Backend API references:
@src/routes/schedule.routes.ts - GET/POST/PATCH/DELETE /api/schedules, nested layer/override routes
@src/routes/scheduleOverride.routes.ts - POST /api/schedules/:id/overrides, POST /api/schedules/:id/swaps
@src/types/schedule.ts - Schedule, Override, Swap types with Zod schemas

Existing patterns to follow:
@frontend/src/hooks/useRunbooks.ts - React Query hook patterns with mutations
@frontend/src/pages/RunbooksPage.tsx - Page layout, cards, filters, dialogs pattern
@frontend/src/hooks/useTeams.ts - Simple team fetching pattern
@frontend/src/lib/api.ts - apiFetch utility
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create useSchedules hooks for data fetching and mutations</name>
  <files>frontend/src/hooks/useSchedules.ts</files>
  <action>
Create React Query hooks following the useRunbooks.ts pattern:

**Types (at top of file):**
```typescript
interface Schedule {
  id: string;
  teamId: string;
  team: { id: string; name: string };
  name: string;
  description: string | null;
  timezone: string;
  startDate: string;
  endDate: string | null;
  handoffTime: string;
  rotationType: 'daily' | 'weekly' | 'custom';
  rotationIntervalDays: number;
  rotationUserIds: string[];
  isActive: boolean;
  layers?: ScheduleLayer[];
  _count?: { overrides: number };
}

interface ScheduleLayer { ... } // from backend types
interface ScheduleOverride { ... } // with user relations

interface CreateOverrideInput {
  userId: string;
  startTime: string; // ISO datetime
  endTime: string;
  reason?: string;
}

interface CreateSwapInput {
  originalUserId: string;
  newUserId: string;
  startTime: string;
  endTime: string;
  reason?: string;
}
```

**Hooks to implement:**
1. `useSchedules(filters?: { teamId?: string; isActive?: boolean })` - List schedules
2. `useSchedule(id: string | undefined)` - Single schedule with layers and override count
3. `useScheduleOverrides(scheduleId: string | undefined, query?: { startAfter?: string; endBefore?: string })` - List overrides
4. `useCreateOverride(scheduleId: string)` - Create override mutation
5. `useCreateSwap(scheduleId: string)` - Create swap mutation
6. `useDeleteOverride(scheduleId: string)` - Delete override mutation

Follow apiFetch pattern with proper error handling. Use queryKey arrays like `['schedules'], ['schedule', id], ['schedule', id, 'overrides']`. Invalidate related queries on mutations.
  </action>
  <verify>TypeScript compiles without errors: `cd frontend && npx tsc --noEmit`</verify>
  <done>useSchedules.ts exports all 6 hooks with proper TypeScript types</done>
</task>

<task type="auto">
  <name>Task 2: Build SchedulePage with schedule list, overrides panel, and swap dialog</name>
  <files>frontend/src/pages/SchedulePage.tsx</files>
  <action>
Replace placeholder with full implementation following RunbooksPage.tsx patterns:

**Page Structure:**
1. Header with Calendar icon and "Schedules" title
2. Team filter dropdown (reuse useTeams hook)
3. Grid of ScheduleCards (3 cols on lg, 2 on md, 1 on mobile)

**ScheduleCard Component:**
- Card header: schedule name, team badge, active/archived badge
- Body: timezone, rotation type badge (daily/weekly/custom), handoff time
- Footer: "X overrides" count, "View Details" button, dropdown menu (View Overrides, Create Override, Create Swap)

**ScheduleDetailsDialog:**
- Shows schedule details: name, description, timezone, rotation info
- Lists rotation users (fetch user names via rotationUserIds - can show IDs initially, enhance later)
- Shows layers if present with priority ordering
- Tab or section for "Current On-Call" (placeholder - computing who's on call is complex, show rotation order for now)

**OverridesPanel (Dialog):**
- Lists overrides for a schedule with user names, time range, reason
- Each override row has delete button (if user has permission)
- Loading skeleton while fetching

**CreateOverrideDialog:**
- Form fields: User select (team members), Start datetime, End datetime, Reason (optional)
- Date pickers for start/end times (use native datetime-local input for simplicity)
- Validation: end must be after start
- Submit calls useCreateOverride mutation

**CreateSwapDialog:**
- Form fields: Original User, New User, Start datetime, End datetime, Reason
- Validation: users must be different, end after start
- Submit calls useCreateSwap mutation

**Empty state:** Show when no schedules exist with CTA to create via admin

**UI Components to use:**
- Card, Badge, Button, Dialog, Select, Input, Label, Skeleton, Alert
- DropdownMenu for card actions
- AlertDialog for delete confirmation
- useToast for success/error notifications

Follow existing error handling pattern: try/catch with toast notifications.
  </action>
  <verify>Page renders without errors: start frontend dev server, navigate to /schedule, verify schedule list loads</verify>
  <done>SchedulePage shows schedule grid with team filter, override management dialogs functional</done>
</task>

<task type="auto">
  <name>Task 3: Add current on-call indicator and polish UI details</name>
  <files>frontend/src/pages/SchedulePage.tsx</files>
  <action>
Enhance the SchedulePage with additional polish:

**Current On-Call Indicator:**
- Add a simple "Current On-Call" section in ScheduleCard that shows first user in rotationUserIds as a basic indicator (accurate on-call computation requires RRULE evaluation which is complex)
- Add user avatar or initials badge for the current user
- Add tooltip explaining "Based on rotation order"

**Additional Polish:**
1. Add loading skeletons for schedule cards (similar to RunbookCardSkeleton)
2. Add "No schedules" empty state with helpful message
3. Format dates using date-fns formatDistanceToNow for relative times
4. Format handoff time nicely (e.g., "9:00 AM" instead of "09:00")
5. Add timezone display with short format (e.g., "EST" from "America/New_York")
6. Color-code rotation types: daily=blue, weekly=purple, custom=orange badges
7. Show override time ranges in a readable format

**Responsive Design:**
- Ensure cards stack properly on mobile
- Dialog max-width and scroll on mobile
- Touch-friendly button sizes

Test the complete flow: view schedules, filter by team, view overrides, create override, create swap, delete override.
  </action>
  <verify>Manual verification: all dialogs open/close, mutations work, responsive on mobile</verify>
  <done>SchedulePage is production-ready with polished UI and working override/swap management</done>
</task>

</tasks>

<verification>
- [ ] TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [ ] Schedule list loads from backend API
- [ ] Team filter works correctly
- [ ] Override list shows for each schedule
- [ ] Create override dialog submits successfully
- [ ] Create swap dialog submits successfully
- [ ] Delete override works
- [ ] Empty states render correctly
- [ ] Mobile responsive layout works
</verification>

<success_criteria>
SchedulePage displays schedules with team filter, users can view/create/delete overrides, and create shift swaps. The UI follows existing shadcn/ui patterns and integrates with the Phase 3 backend API.
</success_criteria>

<output>
After completion, create `.planning/quick/4-implement-all-the-schedule-management-fe/4-SUMMARY.md`
</output>
