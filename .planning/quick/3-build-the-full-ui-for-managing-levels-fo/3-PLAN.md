---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/EscalationPoliciesPage.tsx
  - frontend/src/hooks/useEscalationPolicies.ts
autonomous: true

must_haves:
  truths:
    - "User can add a new escalation level to a policy"
    - "User can edit an existing escalation level"
    - "User can delete an escalation level"
    - "User can select target type (user, schedule, or entire_team)"
    - "User can configure timeout minutes for each level"
  artifacts:
    - path: "frontend/src/pages/EscalationPoliciesPage.tsx"
      provides: "Full level management UI in policy detail dialog"
      min_lines: 400
    - path: "frontend/src/hooks/useEscalationPolicies.ts"
      provides: "useUpdateEscalationLevel hook"
      exports: ["useUpdateEscalationLevel"]
  key_links:
    - from: "EscalationPoliciesPage.tsx"
      to: "/api/escalation-policies/:id/levels"
      via: "useCreateEscalationLevel mutation"
      pattern: "createLevelMutation"
    - from: "EscalationPoliciesPage.tsx"
      to: "/api/escalation-policies/levels/:id"
      via: "useUpdateEscalationLevel mutation"
      pattern: "updateLevelMutation"
---

<objective>
Build the full UI for managing escalation levels within escalation policies.

Purpose: Complete the escalation policy UI that currently has a placeholder saying "Full UI for managing levels is coming soon." Users need to configure who gets notified at each escalation level and after what timeout.

Output: Fully functional level management in the EscalationPoliciesPage policy detail dialog.
</objective>

<execution_context>
@/Users/tvellore/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tvellore/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Existing code
@frontend/src/pages/EscalationPoliciesPage.tsx
@frontend/src/hooks/useEscalationPolicies.ts
@src/routes/escalation-policy.routes.ts
@src/services/escalation-policy.service.ts
@frontend/src/hooks/useTeams.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add useUpdateEscalationLevel hook and useSchedulesByTeam hook</name>
  <files>frontend/src/hooks/useEscalationPolicies.ts</files>
  <action>
Add a new `useUpdateEscalationLevel` mutation hook that calls PATCH /api/escalation-policies/levels/:levelId with { targetType, targetId, timeoutMinutes }. Follow the existing pattern from useCreateEscalationLevel.

Also add a simple `useSchedulesByTeam` query hook that calls GET /api/schedules?teamId=X to fetch available schedules for the target selector dropdown. Return the schedules array.

Update the CreateLevelInput interface to match the backend schema:
- Change `level` to `levelNumber`
- Change `delayMinutes` to `timeoutMinutes`
- Change targets array to single target: `{ targetType, targetId, timeoutMinutes }`

The backend schema uses: levelNumber (int), targetType ('user' | 'schedule' | 'entire_team'), targetId (nullable), timeoutMinutes (default 30).
  </action>
  <verify>TypeScript compiles without errors: `cd frontend && npx tsc --noEmit`</verify>
  <done>useUpdateEscalationLevel and useSchedulesByTeam hooks exported and typed correctly</done>
</task>

<task type="auto">
  <name>Task 2: Build level management UI in policy detail dialog</name>
  <files>frontend/src/pages/EscalationPoliciesPage.tsx</files>
  <action>
Replace the placeholder message in the View Policy Dialog with a full level management UI:

1. **Add Level Form** - A form section with:
   - Level number input (auto-increment based on existing levels, or allow manual entry)
   - Target type dropdown: "User", "Schedule", "Entire Team"
   - Target selector:
     - If "User" selected: dropdown of team members (use useTeamWithMembers hook)
     - If "Schedule" selected: dropdown of team schedules (use new useSchedulesByTeam hook)
     - If "Entire Team": no targetId needed
   - Timeout minutes input (default 30, min 1 for user/schedule, min 3 for entire_team)
   - "Add Level" button

2. **Level List** - Display existing levels with:
   - Level number badge
   - Target type and target name (user name, schedule name, or "Entire Team")
   - Timeout display (e.g., "30 min timeout")
   - Edit button (opens inline edit or edit dialog)
   - Delete button with confirmation

3. **Edit Level** - When editing a level:
   - Allow changing targetType, targetId, and timeoutMinutes
   - Cannot change levelNumber (renumber not supported)
   - Save and Cancel buttons

4. **Delete Level** - Delete with AlertDialog confirmation

Use existing UI patterns from TeamsAdminPage.tsx and RunbooksPage.tsx for consistency. Use sonner toast for success/error messages.

Wire up the mutations:
- createLevelMutation for adding levels
- updateLevelMutation for editing levels (new hook from Task 1)
- deleteLevelMutation for removing levels
  </action>
  <verify>
1. Run `cd frontend && npm run build` - should complete without errors
2. Manual verification: Open the app, go to Admin > Escalation Policies, select a team, click on a policy, verify the level management UI appears
  </verify>
  <done>
Users can:
- Add levels with user/schedule/entire_team targets
- Edit existing levels (change target, timeout)
- Delete levels with confirmation
- See levels displayed with readable target names
  </done>
</task>

</tasks>

<verification>
1. Frontend builds: `cd frontend && npm run build`
2. TypeScript clean: `cd frontend && npx tsc --noEmit`
3. Manual test: Add a level, edit it, delete it - all operations work with toast feedback
</verification>

<success_criteria>
- Level management UI replaces the placeholder message
- Users can add escalation levels with user, schedule, or entire_team targets
- Users can edit level target and timeout
- Users can delete levels with confirmation
- All operations show success/error toasts
- UI follows existing patterns (dialogs, forms, buttons consistent with rest of app)
</success_criteria>

<output>
After completion, create `.planning/quick/3-build-the-full-ui-for-managing-levels-fo/3-SUMMARY.md`
</output>
