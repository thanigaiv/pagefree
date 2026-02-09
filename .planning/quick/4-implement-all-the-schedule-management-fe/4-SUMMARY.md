---
phase: quick
plan: 4
subsystem: frontend/schedule-management
tags: [schedule, override, swap, on-call, react-query]
dependency-graph:
  requires:
    - Phase 3 Schedule Backend API
    - useTeams hooks
  provides:
    - useSchedules hooks
    - SchedulePage with full CRUD for overrides and swaps
  affects:
    - /schedule route
tech-stack:
  added: []
  patterns:
    - React Query hooks with mutations
    - Dialog-based CRUD forms
    - Responsive card grid
key-files:
  created:
    - frontend/src/hooks/useSchedules.ts
  modified:
    - frontend/src/pages/SchedulePage.tsx
decisions:
  - Show first user in rotation as "current on-call" (accurate RRULE computation is complex)
  - Use native datetime-local inputs for override/swap time selection
  - Mutation hooks take scheduleId as parameter for proper cache invalidation
metrics:
  duration: 3m 19s
  completed: 2026-02-09
---

# Quick Task 4: Schedule Management Frontend Summary

React Query hooks and full SchedulePage UI for viewing schedules, managing overrides, and creating shift swaps.

## What Was Built

### 1. useSchedules Hooks (234 lines)

Created React Query hooks following existing patterns from `useRunbooks.ts`:

| Hook | Purpose |
|------|---------|
| `useSchedules` | List schedules with team/isActive filters |
| `useSchedule` | Single schedule with layers |
| `useScheduleOverrides` | List overrides with time range filter |
| `useCreateOverride` | Create override mutation |
| `useCreateSwap` | Create swap mutation |
| `useDeleteOverride` | Delete override mutation |

All hooks use proper cache invalidation to keep schedule counts and override lists in sync.

### 2. SchedulePage UI (1128 lines)

Replaced placeholder with full implementation:

**Main Page:**
- Schedule card grid (3 cols on lg, 2 on md, 1 on mobile)
- Team filter dropdown
- Loading skeletons during fetch
- Empty state with helpful message

**ScheduleCard Component:**
- Name, description, team badge
- Active/Archived status badge
- Rotation type badge (color-coded: daily=blue, weekly=purple, custom=orange)
- Current on-call indicator with initials avatar and tooltip
- Timezone (short format) and handoff time (12-hour)
- Override count
- Dropdown menu: View Overrides, Create Override, Create Swap, View Details

**ScheduleDetailsDialog:**
- Full schedule info: timezone, handoff, rotation type, start date
- Rotation order list showing user IDs with position badges
- Layers section if present (sorted by priority)
- Note about RRULE computation limitation

**OverridesPanel:**
- List of overrides with user names and time ranges
- OVERRIDE/SWAP type badges
- "Replacing: [user]" for swaps
- Reason display
- Delete button per override

**CreateOverrideDialog:**
- Team member select (fetches from useTeamWithMembers)
- Start/End datetime-local inputs
- Optional reason textarea
- Client-side validation (end after start)

**CreateSwapDialog:**
- Original user and new user selects
- Start/End datetime-local inputs
- Optional reason
- Validation: different users, end after start

**DeleteOverrideDialog:**
- AlertDialog confirmation before deletion

## Key Patterns

1. **Dynamic Mutation Hooks:** Mutations take scheduleId as parameter, allowing proper cache key for invalidation
2. **Dialog State Management:** Each dialog controlled by nullable state (schedule object or null)
3. **Form Reset:** Forms clear on dialog close to prevent stale data
4. **Error Handling:** Toast notifications for success/failure of all mutations

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/hooks/useSchedules.ts` | Created | 234 |
| `frontend/src/pages/SchedulePage.tsx` | Replaced | 1128 |

## Commits

| Hash | Description |
|------|-------------|
| 2cdd414 | feat(quick-4): add useSchedules hooks for schedule data fetching and mutations |
| 453eeba | feat(quick-4): build SchedulePage with schedule list, overrides panel, and swap dialog |
| 5249e36 | feat(quick-4): add current on-call indicator with tooltip and polish UI |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] TypeScript compiles: `cd frontend && npx tsc --noEmit`
- [x] useSchedules.ts exports all 6 hooks
- [x] SchedulePage > 400 lines (1128 lines)
- [x] Schedule grid layout working
- [x] Team filter functional
- [x] Override list dialog
- [x] Create override dialog with team member select
- [x] Create swap dialog
- [x] Delete override confirmation

## Self-Check: PASSED

Verified all files and commits exist:

- FOUND: frontend/src/hooks/useSchedules.ts
- FOUND: frontend/src/pages/SchedulePage.tsx
- FOUND: 2cdd414
- FOUND: 453eeba
- FOUND: 5249e36
