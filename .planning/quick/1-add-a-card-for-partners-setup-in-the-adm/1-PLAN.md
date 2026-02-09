---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/AdminPage.tsx
  - frontend/src/components/MobileLayout.tsx
autonomous: true
must_haves:
  truths:
    - "Admin page shows Partners Setup card"
    - "Header navigation includes Runbooks link on desktop"
  artifacts:
    - path: "frontend/src/pages/AdminPage.tsx"
      provides: "Partners Setup card in admin sections"
      contains: "Partners"
    - path: "frontend/src/components/MobileLayout.tsx"
      provides: "Runbooks header navigation item"
      contains: "Runbooks"
  key_links:
    - from: "AdminPage.tsx Partners card"
      to: "/admin/partners"
      via: "Link component"
    - from: "MobileLayout.tsx Runbooks nav item"
      to: "/workflows"
      via: "NavLink component"
---

<objective>
Add a Partners Setup card to the Admin page and add Runbooks navigation link to the desktop header.

Purpose: Improve admin discoverability for partner management and provide quick access to runbook/workflow functionality from the main navigation.
Output: Updated AdminPage.tsx with Partners card, updated MobileLayout.tsx with Runbooks nav item.
</objective>

<execution_context>
@/Users/tvellore/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tvellore/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/pages/AdminPage.tsx
@frontend/src/components/MobileLayout.tsx
@frontend/src/pages/admin/PartnersPage.tsx (for reference - route is /admin/partners)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Partners Setup card to AdminPage</name>
  <files>frontend/src/pages/AdminPage.tsx</files>
  <action>
Add a new card to the adminSections array in AdminPage.tsx for Partners Setup:
- title: "Partners"
- description: "Manage partner access to status pages"
- icon: Use "Users2" from lucide-react (add import) - different from Users to distinguish
- link: "/admin/partners"
- color: "text-indigo-500"
- bgColor: "bg-indigo-50"

Position it after Status Pages card and before Users card (logical grouping - external access management).
  </action>
  <verify>
Visit http://localhost:5173/admin and confirm:
1. Partners card appears in the grid
2. Card has indigo styling
3. Clicking card navigates to /admin/partners
  </verify>
  <done>Partners Setup card visible on Admin page with correct styling and link.</done>
</task>

<task type="auto">
  <name>Task 2: Add Runbooks link to desktop header navigation</name>
  <files>frontend/src/components/MobileLayout.tsx</files>
  <action>
Add a Runbooks navigation item to the desktopNavItems array in MobileLayout.tsx:
- to: "/workflows" (existing workflow builder handles runbooks)
- icon: Use "BookOpen" from lucide-react (add import) - represents runbook/documentation
- label: "Runbooks"

Position it after Workflows item for logical grouping. Note: The workflow builder at /workflows already supports runbook creation via the sidebar, so linking to /workflows is correct.
  </action>
  <verify>
Visit http://localhost:5173/incidents and verify desktop view shows:
1. Runbooks link appears in header navigation
2. BookOpen icon is displayed
3. Clicking navigates to /workflows page
  </verify>
  <done>Runbooks navigation link visible in desktop header between Workflows and Status items.</done>
</task>

</tasks>

<verification>
1. `npm run typecheck` passes in frontend directory
2. Admin page displays Partners card that links to /admin/partners
3. Desktop header shows Runbooks link that navigates to /workflows
</verification>

<success_criteria>
- Partners card visible on Admin page with indigo styling
- Runbooks link visible in desktop header navigation
- Both links navigate to correct routes
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-add-a-card-for-partners-setup-in-the-adm/1-SUMMARY.md`
</output>
