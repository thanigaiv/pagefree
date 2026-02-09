# PageFree User Guide

This guide covers all features of PageFree, from day-to-day incident response to administration and integrations.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Incidents Dashboard](#incidents-dashboard)
3. [Incident Detail](#incident-detail)
4. [Workflows](#workflows)
5. [Workflow Builder](#workflow-builder)
6. [Status Pages](#status-pages)
7. [Public Status Pages](#public-status-pages)
8. [Postmortems](#postmortems)
9. [Schedules](#schedules)
10. [Profile & Settings](#profile--settings)
11. [Integrations](#integrations)
12. [Notifications](#notifications)
13. [Mobile & PWA](#mobile--pwa)
14. [API & Webhooks](#api--webhooks)
15. [Authentication](#authentication)
16. [Administration](#administration)

---

## Getting Started

After installation (see [README](../README.md)), open PageFree in your browser at `http://localhost:3001`. You will be prompted to authenticate via Okta. Once logged in, you are taken to the Incidents Dashboard.

The **PageFree** header appears at the top of every screen. On mobile devices, a bottom navigation bar provides quick access to the six main sections: Incidents, Workflows, Status, Postmortems, Schedule, and Profile.

On desktop, the bottom navigation is hidden. Use the top-level links or navigate directly by URL.

---

## Incidents Dashboard

**Route:** `/incidents`

The Incidents Dashboard is the primary screen for on-call engineers. It provides a real-time view of all incidents in the system.

![Incidents Dashboard Overview](screenshots/incidents/dashboard-overview.png)

### Connection Status

A banner at the top indicates your real-time connection status. PageFree uses WebSockets to push incident updates instantly. If the connection drops, the banner will show the reconnection status.

### Metrics Summary

At the top of the dashboard, a metrics bar shows:
- **Open** -- Number of incidents with OPEN status
- **Acknowledged** -- Number of acknowledged incidents
- **Critical** -- Number of critical-priority open or acknowledged incidents

![Dashboard Metrics](screenshots/incidents/dashboard-metrics.png)

### Filtering Incidents

Use the filter controls to narrow down the incident list:

- **Status** -- Filter by OPEN, ACKNOWLEDGED, or RESOLVED
- **Priority** -- Filter by CRITICAL, HIGH, MEDIUM, or LOW
- **Search** -- Free-text search across incident titles and descriptions

![Dashboard Filters](screenshots/incidents/dashboard-filters.png)

### Filter Presets

Save frequently used filter combinations as presets for one-click access. Presets persist across sessions via your user preferences.

### Bulk Actions

Select multiple incidents using the checkboxes and perform bulk operations:
- **Acknowledge** -- Acknowledge all selected incidents at once
- **Resolve** -- Resolve all selected incidents at once

![Bulk Actions](screenshots/incidents/dashboard-bulk-actions.png)

### Expandable Rows

Click on any incident to expand it inline and see additional details without leaving the dashboard.

![Expanded Row](screenshots/incidents/dashboard-expanded-row.png)

### Pagination

The incident list is paginated. Use the page controls at the bottom to navigate between pages.

### Refresh

Click the **Refresh** button to manually fetch the latest data. Incidents also update in real-time via WebSocket.

### PWA Install Prompt

If PageFree detects it can be installed as a Progressive Web App, an install button will appear in the header area.

---

## Incident Detail

**Route:** `/incidents/:id`

Click on an incident title or navigate to its URL to see the full detail view.

![Incident Detail](screenshots/incidents/incident-detail.png)

### Incident Information

- **Title** -- The incident title or alert fingerprint
- **Priority** -- Displayed as a color-coded badge (CRITICAL, HIGH, MEDIUM, LOW)
- **Status** -- Current status (OPEN, ACKNOWLEDGED, RESOLVED)
- **Assigned To** -- The engineer currently assigned to the incident
- **Timeline** -- Chronological log of status changes, assignments, and notes

### Actions

- **Acknowledge** -- Mark the incident as acknowledged (you are aware of it)
- **Resolve** -- Mark the incident as resolved
- **Assign** -- Reassign the incident to a different engineer
- **Back to Incidents** -- Return to the dashboard

![Incident Actions](screenshots/incidents/incident-actions.png)

---

## Workflows

**Route:** `/workflows`

The Workflows page lets you view and manage automated response workflows.

![Workflows List](screenshots/workflows/workflows-list.png)

### My Workflows Tab

Displays all workflows created by your team. Each workflow card shows:
- Workflow name and description
- Enabled/disabled toggle
- Team scope (team-specific or global)
- Last modified timestamp

### Filters

- **Scope** -- All, Team, or Global
- **Status** -- All, Enabled, or Disabled
- **Search** -- Search by workflow name

![Workflow Filters](screenshots/workflows/workflows-filters.png)

### Template Library Tab

Browse pre-built workflow templates organized by category:
- **Ticketing** -- Automatically create tickets in external systems
- **Communication** -- Send notifications to channels or team members
- **Auto-resolution** -- Automatically resolve incidents matching certain criteria

Click a template to create a new workflow based on it.

![Template Library](screenshots/workflows/workflow-template-library.png)

### Creating a Workflow

Click **New Workflow** to open the Workflow Builder with a blank canvas, or select a template to start from a pre-built flow.

### Duplicating a Workflow

Use the duplicate action on any workflow card to create a copy you can modify independently.

---

## Workflow Builder

**Route:** `/workflows/new` or `/workflows/:id`

The visual workflow builder uses a three-column layout:

![Workflow Builder Overview](screenshots/workflows/workflow-builder-overview.png)

### Sidebar (Left)

The sidebar lists available node types that you can drag onto the canvas:
- **Trigger** -- Defines what starts the workflow (e.g., new incident, status change)
- **Action** -- Performs an operation (e.g., send notification, create ticket, update status)
- **Condition** -- Branches the flow based on a condition (e.g., priority level, team)
- **Delay** -- Adds a timed pause before the next step

![Workflow Sidebar](screenshots/workflows/workflow-builder-sidebar.png)

### Canvas (Center)

The drag-and-drop canvas where you arrange and connect nodes. Nodes are automatically laid out using dagre graph layout. Connect nodes by dragging from one node's output handle to another node's input handle.

![Workflow Canvas](screenshots/workflows/workflow-builder-canvas.png)

### Configuration Panel (Right)

Click any node on the canvas to open its configuration panel. Each node type has different configuration options:
- **Trigger nodes** -- Event type, filter conditions
- **Action nodes** -- Action type, target, message template
- **Condition nodes** -- Field, operator, value
- **Delay nodes** -- Duration

![Workflow Configuration](screenshots/workflows/workflow-builder-config.png)

### Workflow Metadata

At the top, set the workflow:
- **Name** (required)
- **Description** (required)
- **Team** -- Which team owns this workflow
- **Scope** -- Team-specific or global

### Saving and Testing

- **Save** -- Save the workflow. Validates that all required fields are filled
- **Test** -- Run the workflow with sample data to verify behavior
- **Export JSON** -- Download the workflow definition as JSON

---

## Status Pages

**Route:** `/status-pages`

Manage public and private status pages that communicate system health to your users and stakeholders.

![Status Pages List](screenshots/status-pages/status-pages-list.png)

### Creating a Status Page

Click **New Status Page** and fill in:
- **Name** -- Display name for the status page
- **Description** -- Brief description
- **Team** -- Owning team
- **Public** -- Toggle whether the page is publicly accessible or requires an access token

For private status pages, an access token is generated on creation. Share this token with authorized viewers.

### Status Page Detail

**Route:** `/status-pages/:id`

From the detail view you can:
- **Add Components** -- Define the systems/services tracked on this page (e.g., "API", "Web App", "Database")
- **View Public URL** -- Copy the public URL to share with stakeholders
- **Open Public Page** -- Preview the page as external users see it

![Status Page Detail](screenshots/status-pages/status-page-detail.png)

### Component Status Levels

Each component has a status:
- **Operational** -- Everything is working normally
- **Degraded Performance** -- The system is slower than normal
- **Partial Outage** -- Some functionality is unavailable
- **Major Outage** -- The system is down
- **Under Maintenance** -- Scheduled maintenance in progress

The overall page status is automatically computed as the worst status among all components.

![Status Page Components](screenshots/status-pages/status-page-components.png)

---

## Public Status Pages

**Route:** `/status/:slug`

This is the externally-facing page your customers or stakeholders see. It does not require authentication.

The page displays:
- **Overall status banner** -- A summary of system health
- **Component list** -- Each tracked component with its current status
- **Recent incidents** -- Incidents from the past 7 days with status updates

For private pages, the URL must include a `?token=<access-token>` query parameter.

![Public Status Page](screenshots/status-pages/public-status-page.png)

---

## Postmortems

**Route:** `/postmortems`

Postmortems document what happened during an incident, why it happened, and what the team will do to prevent recurrence.

![Postmortems List](screenshots/postmortems/postmortems-list.png)

### Postmortem List

The postmortems list shows all postmortems grouped by team. Each card displays:
- Title
- Status (Draft or Published)
- Creation date
- Associated team

Filter by team using the dropdown.

### Creating a Postmortem

Click **New Postmortem** and provide:
- **Title** -- Descriptive title of the incident
- **Incident** -- Link to the incident(s) being documented
- **Team** -- Owning team

### Postmortem Detail

**Route:** `/postmortems/:id`

The detail page has three tabs:

#### Report Tab

A markdown editor for writing the postmortem report. A template is provided with sections for:
- Summary
- Root Cause
- Resolution
- Lessons Learned

The editor supports full Markdown with live preview.

![Postmortem Report](screenshots/postmortems/postmortem-report.png)

#### Timeline Tab

An auto-generated chronological timeline of the incident, showing:
- When alerts fired
- Status changes (open, acknowledged, resolved)
- Assignment changes
- Key actions taken

![Postmortem Timeline](screenshots/postmortems/postmortem-timeline.png)

#### Action Items Tab

Track remediation tasks:
- Add action items with descriptions and assignees
- Mark items as complete
- Track completion progress

![Postmortem Action Items](screenshots/postmortems/postmortem-action-items.png)

### Publishing

Postmortems start in **Draft** status. When the report is finalized and reviewed, click **Publish** to make it visible to the broader team.

---

## Schedules

**Route:** `/schedule`

The Schedule page shows on-call rotations and allows management of:
- Who is currently on call
- Upcoming rotation handoffs
- Schedule overrides (manual swaps)

This integrates with the backend scheduling system which supports:
- Rotation layers with configurable shift patterns
- Calendar sync with Google Calendar and Microsoft Outlook
- Override management for ad-hoc on-call swaps

![Schedules Overview](screenshots/schedules/schedules-overview.png)

---

## Profile & Settings

**Route:** `/profile`

The Profile page has four sections:

### Account

Displays your account information synced from Okta (name, email, role). This information is read-only and managed by your identity provider.

![Profile Account](screenshots/profile/profile-account.png)

### Notification Preferences

Configure how you want to receive alerts:
- **Email** -- Receive alert notifications via email
- **SMS** -- Receive text message alerts
- **Push** -- Browser and mobile push notifications
- **Voice** -- Receive automated phone calls for critical alerts
- **Slack** -- Receive alerts in Slack
- **Microsoft Teams** -- Receive alerts in Teams

![Notification Preferences](screenshots/profile/profile-notifications.png)

### Mobile & Push Settings

Configure mobile-specific settings:
- Enable/disable push notifications
- Test push notification delivery
- Register your device for push alerts

![Mobile & Push Settings](screenshots/profile/profile-mobile.png)

### Security

- **Biometric Authentication** -- Enable Face ID or Touch ID for quick login on supported devices
- **Session Management** -- View and manage active sessions

![Security Settings](screenshots/profile/profile-security.png)

---

## Integrations

**Route:** `/integrations`

> Platform administrators only.

The Integrations page allows admins to configure external monitoring tool connections.

![Integrations List](screenshots/integrations/integrations-list.png)

### Supported Integrations

PageFree can receive alerts from:
- **DataDog**
- **New Relic**
- Other monitoring tools via generic webhooks

### Webhook URL

Each integration receives alerts at:
```
https://your-domain.com/webhooks/alerts/:integrationName
```

Replace `:integrationName` with the name configured for the integration (e.g., `datadog-prod`).

### Integration Management

For each integration you can:
- **Enable/Disable** -- Toggle alert ingestion
- **Test** -- Send a test webhook to verify the connection
- **View Attempts** -- See the history of received webhooks and their processing status

---

## Notifications

PageFree delivers alerts through multiple channels. The notification pipeline works as follows:

1. **Alert Ingested** -- An alert arrives via webhook from a monitoring tool
2. **Routing** -- The alert is matched to an escalation policy based on team and service
3. **Escalation** -- The policy defines who to notify and when to escalate
4. **Delivery** -- Notifications are sent via the configured channels

### Supported Channels

| Channel | Provider | Configuration |
|---------|----------|--------------|
| Email | AWS SES | Set `AWS_SES_FROM_EMAIL` in `.env` |
| SMS | Twilio | Set `TWILIO_*` credentials in `.env` |
| Push | Web Push API | Enabled per-user in Profile settings |
| Voice | Twilio | Uses same Twilio credentials |
| Slack | Slack API | Configure in Integrations page |
| Microsoft Teams | MS Graph | Configure in Integrations page |

### Slack Integration

PageFree supports two-way Slack integration:
- **Incoming** -- Alert notifications posted to Slack channels
- **Interactive** -- Acknowledge or resolve incidents directly from Slack using buttons
- **Slash Commands** -- Use `/oncall` in Slack to check who is on-call

### SMS Replies

On-call engineers can respond to SMS alerts:
- Reply `ACK` to acknowledge an incident
- Reply `ACK <incident-id>` to acknowledge a specific incident

---

## Mobile & PWA

PageFree is built as a Progressive Web App (PWA) and can be installed on mobile devices for a native-like experience.

![Mobile Bottom Navigation](screenshots/mobile/mobile-bottom-nav.png)

### Installing the PWA

1. Open PageFree in your mobile browser (Chrome on Android, Safari on iOS)
2. You may see an automatic install prompt, or use the browser menu
3. On Chrome: tap "Add to Home Screen"
4. On Safari: tap the Share button, then "Add to Home Screen"

![PWA Install Prompt](screenshots/mobile/mobile-pwa-install.png)

### Offline Support

PageFree caches critical resources for offline access. When offline:
- You can view recently loaded incident data
- An offline indicator appears at the bottom of the screen
- Actions are queued and executed when connectivity returns

![Mobile Incidents View](screenshots/mobile/mobile-incidents.png)

### Push Notifications

Enable push notifications in your Profile to receive alerts even when the app is not open. Push notifications work on both mobile and desktop browsers.

---

## API & Webhooks

### REST API

The backend exposes a REST API at `http://localhost:3000/api/`. All authenticated endpoints require a valid session or API key.

Key API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/incidents` | GET | List incidents with filters |
| `/api/incidents/:id` | GET | Get incident detail |
| `/api/incidents/:id` | PATCH | Update incident status |
| `/api/alerts` | POST | Create an alert |
| `/api/teams` | GET | List teams |
| `/api/schedules` | GET | List schedules |
| `/api/workflows` | GET | List workflows |
| `/api/status-pages` | GET | List status pages |
| `/api/postmortems` | GET | List postmortems |

### API Keys

Generate API keys from the backend for programmatic access. API keys are scoped to the creating user's permissions.

### Webhook Receivers

PageFree receives webhooks from:

| Source | Endpoint | Auth Method |
|--------|----------|-------------|
| Monitoring tools | `/webhooks/alerts/:name` | Signature verification |
| Okta | `/webhooks/okta` | Webhook secret |
| Slack | `/webhooks/slack/interactions` | Slack signature |
| Slack | `/webhooks/slack/commands` | Slack signature |
| Twilio | `/webhooks/twilio` | Twilio signature |

### Health Check

```
GET /health
```

Returns the application and database status. Use this for load balancer health checks.

---

## Authentication

PageFree supports multiple authentication methods:

![Okta Login](screenshots/authentication/login-okta.png)

### Okta OAuth (Primary)

The primary authentication method. Users are redirected to Okta for login and provisioned automatically via SCIM.

### Local Accounts (Break-Glass)

For emergency access when Okta is unavailable:
```bash
npm run create-breakglass
```
This creates a local account with username/password authentication.

![Emergency Login](screenshots/authentication/login-emergency.png)

### Magic Links

Passwordless authentication via email. Users receive a one-time login link that expires after use.

### SCIM Provisioning

PageFree supports SCIM 2.0 for automatic user provisioning and deprovisioning from your identity provider.

---

## Administration

### Teams

Teams are the primary organizational unit. Each team has:
- Members with roles (admin, member)
- Schedules
- Escalation policies
- Workflows
- Status pages
- Postmortems

### Escalation Policies

Define how alerts are escalated within a team:
1. Set notification targets (individual users or on-call schedule)
2. Define escalation timeouts (e.g., escalate after 5 minutes of no acknowledgment)
3. Configure multiple escalation levels

### Audit Logging

All actions in PageFree are logged to an audit trail:
- Who performed the action
- What changed
- When it happened
- IP address and session details

Admins can view the audit log via the API at `/api/audit`.

In production, audit logs are automatically cleaned up based on a configurable retention period.

### Background Workers

PageFree runs several background workers that process jobs asynchronously:

| Worker | Purpose |
|--------|---------|
| Escalation Worker | Escalates incidents that haven't been acknowledged |
| Notification Worker | Delivers notifications across all channels |
| Workflow Worker | Executes automated workflow actions |
| Maintenance Worker | Handles scheduled maintenance windows |
| Status Notification Worker | Sends status page update notifications |

Workers require Redis to be running. If Redis is unavailable, the server continues in degraded mode with workers disabled.

### Environment Configuration

All configuration is managed via environment variables. See `.env.example` for the complete list:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `OKTA_DOMAIN`, `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET` | Okta authentication |
| `SESSION_SECRET` | Express session encryption |
| `JWT_SECRET` | Mobile refresh token signing |
| `AWS_SES_FROM_EMAIL` | Email sender address |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS and voice |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar sync |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Microsoft Calendar sync |
