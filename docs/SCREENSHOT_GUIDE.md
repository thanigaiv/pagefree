# Screenshot Capture Guide

This guide explains what screenshots to capture for the USER_GUIDE.md documentation.

## Prerequisites

1. Start the application:
   ```bash
   # Terminal 1 - Backend
   npm run dev

   # Terminal 2 - Frontend
   cd frontend && npm run dev
   ```

2. Open http://localhost:3001 in your browser
3. Log in using your admin credentials

## Screenshot Guidelines

- **Resolution**: Use a desktop viewport (1920x1080 recommended)
- **Format**: Save as PNG for better quality
- **Browser**: Chrome or Firefox recommended for consistency
- **Zoom**: Use 100% browser zoom
- **Clean state**: Remove personal information, use example data
- **Naming**: Use descriptive names as specified below

---

## Screenshots to Capture

### 1. Incidents Dashboard (`docs/screenshots/incidents/`)

#### `dashboard-overview.png`
- Navigate to: http://localhost:3001/incidents
- Capture: Full dashboard showing the connection status banner, metrics summary, filters, and incident list
- Notes: Should show at least 5-10 incidents with various statuses and priorities

#### `dashboard-filters.png`
- Navigate to: http://localhost:3001/incidents
- Capture: Focus on the filter controls section (status, priority, search)
- Notes: Optionally have some filters active to show the UI state

#### `dashboard-bulk-actions.png`
- Navigate to: http://localhost:3001/incidents
- Capture: Dashboard with multiple incidents selected (checkboxes checked) and bulk action buttons visible
- Notes: Select 3-4 incidents to show the feature in action

#### `dashboard-expanded-row.png`
- Navigate to: http://localhost:3001/incidents
- Capture: Dashboard with one incident row expanded showing additional details
- Notes: The expanded section should be clearly visible

#### `dashboard-metrics.png`
- Navigate to: http://localhost:3001/incidents
- Capture: Close-up of the metrics summary bar at the top (Open, Acknowledged, Critical counts)

### 2. Incident Detail (`docs/screenshots/incidents/`)

#### `incident-detail.png`
- Navigate to: http://localhost:3001/incidents/:id (replace :id with an actual incident ID)
- Capture: Full incident detail view showing title, priority badge, status, assigned user, and timeline
- Notes: Timeline should show several events

#### `incident-actions.png`
- Navigate to: http://localhost:3001/incidents/:id
- Capture: Focus on the action buttons area (Acknowledge, Resolve, Assign, Back)

### 3. Workflows (`docs/screenshots/workflows/`)

#### `workflows-list.png`
- Navigate to: http://localhost:3001/workflows
- Capture: The workflows list page showing multiple workflow cards
- Notes: Should show both enabled and disabled workflows

#### `workflows-filters.png`
- Navigate to: http://localhost:3001/workflows
- Capture: Focus on the filter controls (Scope, Status, Search)

#### `workflow-template-library.png`
- Navigate to: http://localhost:3001/workflows
- Click: "Template Library" tab
- Capture: The template library view showing pre-built templates organized by category

### 4. Workflow Builder (`docs/screenshots/workflows/`)

#### `workflow-builder-overview.png`
- Navigate to: http://localhost:3001/workflows/new
- Capture: Full workflow builder with all three panels visible (sidebar, canvas, configuration)
- Notes: Add a few nodes to the canvas to demonstrate the layout

#### `workflow-builder-sidebar.png`
- Navigate to: http://localhost:3001/workflows/new
- Capture: Close-up of the left sidebar showing available node types (Trigger, Action, Condition, Delay)

#### `workflow-builder-canvas.png`
- Navigate to: http://localhost:3001/workflows/new
- Capture: The center canvas area with a sample workflow (5-7 nodes connected)
- Notes: Show a realistic workflow with trigger → condition → actions

#### `workflow-builder-config.png`
- Navigate to: http://localhost:3001/workflows/new
- Click: On a node to open its configuration
- Capture: The right configuration panel showing node settings

### 5. Status Pages (`docs/screenshots/status-pages/`)

#### `status-pages-list.png`
- Navigate to: http://localhost:3001/status-pages
- Capture: Status pages list showing multiple status page cards

#### `status-page-detail.png`
- Navigate to: http://localhost:3001/status-pages/:id
- Capture: Status page detail view showing components and their statuses

#### `status-page-components.png`
- Navigate to: http://localhost:3001/status-pages/:id
- Capture: Close-up of the components list with various status levels

#### `public-status-page.png`
- Navigate to: http://localhost:3001/status/:slug
- Capture: The public-facing status page view
- Notes: This is what external users see

### 6. Postmortems (`docs/screenshots/postmortems/`)

#### `postmortems-list.png`
- Navigate to: http://localhost:3001/postmortems
- Capture: Postmortems list page showing multiple postmortem cards

#### `postmortem-report.png`
- Navigate to: http://localhost:3001/postmortems/:id
- Tab: Report tab (should be default)
- Capture: The markdown editor with some sample content

#### `postmortem-timeline.png`
- Navigate to: http://localhost:3001/postmortems/:id
- Tab: Timeline tab
- Capture: The auto-generated incident timeline

#### `postmortem-action-items.png`
- Navigate to: http://localhost:3001/postmortems/:id
- Tab: Action Items tab
- Capture: The action items list with some completed and pending items

### 7. Schedules (`docs/screenshots/schedules/`)

#### `schedules-overview.png`
- Navigate to: http://localhost:3001/schedule
- Capture: The schedules page showing on-call rotations and current on-call status

### 8. Profile & Settings (`docs/screenshots/profile/`)

#### `profile-account.png`
- Navigate to: http://localhost:3001/profile
- Tab: Account (should be default)
- Capture: Account information section

#### `profile-notifications.png`
- Navigate to: http://localhost:3001/profile
- Tab: Notification Preferences
- Capture: Notification preferences settings with various channels (Email, SMS, Push, etc.)

#### `profile-mobile.png`
- Navigate to: http://localhost:3001/profile
- Tab: Mobile & Push Settings
- Capture: Mobile-specific settings section

#### `profile-security.png`
- Navigate to: http://localhost:3001/profile
- Tab: Security
- Capture: Security settings including biometric auth and session management

### 9. Integrations (`docs/screenshots/integrations/`)

#### `integrations-list.png`
- Navigate to: http://localhost:3001/integrations
- Capture: Integrations page showing available monitoring tool integrations
- Notes: Requires platform admin role

### 10. Authentication (`docs/screenshots/authentication/`)

#### `login-okta.png`
- Navigate to: http://localhost:3001 (logged out)
- Capture: The initial Okta login screen or redirect page

#### `login-emergency.png`
- Navigate to: http://localhost:3001/auth/emergency
- Capture: The emergency/break-glass login page with email and password fields

### 11. Mobile Views (`docs/screenshots/mobile/`)

#### `mobile-bottom-nav.png`
- Device: Use browser DevTools to simulate mobile device (iPhone 14 Pro or similar)
- Navigate to: http://localhost:3001/incidents
- Capture: Mobile view showing the bottom navigation bar

#### `mobile-incidents.png`
- Device: Mobile viewport
- Navigate to: http://localhost:3001/incidents
- Capture: Incidents dashboard in mobile view

#### `mobile-pwa-install.png`
- Device: Mobile viewport
- Navigate to: http://localhost:3001/incidents
- Capture: PWA install prompt if visible

---

## After Capturing Screenshots

Once you've captured all screenshots:

1. Save them to the appropriate directories as specified above
2. Verify all files are saved as PNG format
3. The USER_GUIDE.md will automatically reference these screenshots
4. Check the guide to ensure all images display correctly

## Optional Enhancements

Consider capturing additional screenshots for:
- Error states (connection lost, form validation errors)
- Loading states
- Empty states (no incidents, no workflows)
- Success notifications
- Modal dialogs
