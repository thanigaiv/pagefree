# Phase 8: Automation & Workflows - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Automated response workflows triggered by incident conditions. Users define workflows using a visual builder that execute actions (webhooks, ticket creation) based on incident triggers. Workflow execution is logged to incident timeline with complete audit trail.

</domain>

<decisions>
## Implementation Decisions

### Workflow Authoring Experience
- Visual drag-and-drop builder (node-based like Zapier/n8n) where users connect trigger and action blocks
- Template library on workflow creation start with pre-built workflows users can customize
- Real-time validation feedback highlighting configuration errors and missing required fields
- Test mode with sample data to preview workflow execution before activation
- Both team-scoped and global workflows: teams create their own, platform admins create global workflows
- Grouped timeline entries with visual nesting (workflow entry with collapsible action entries underneath)
- Full branching support with if/else conditional paths within workflows
- Toggle enabled/disabled state without deletion for temporary workflow suspension
- Full version history tracking every workflow edit with rollback capability
- Template organization by categories (Ticketing, Communication, Auto-resolution) with search/filter
- JSON export/import for workflow backup and sharing between teams
- Configurable delays between actions (wait 5 minutes, then send reminder)
- Team admin permissions required to create/edit workflows
- Workflow duplication enabled to create variations by cloning and modifying existing workflows
- Detailed execution analytics showing execution count, success rate, average duration, failure points
- Required name and description fields to force documentation of workflow purpose
- In-flight workflows complete with old version when workflow edited (no mid-execution cancellation)

### Action Catalog and Extensibility
- Built-in actions: HTTP webhook (POST/PUT/PATCH) and ticket creation (Jira, Linear)
- Template variable interpolation using {{incident.title}}, {{incident.priority}}, {{assignee.email}} syntax
- Webhook authentication supports: Bearer token, Basic auth (username/password), OAuth 2.0 client credentials, custom headers
- Ticket creation actions store ticket URL in incident metadata (visible in timeline and details, no two-way sync)

### Trigger Conditions and Matching
- Incident events that trigger workflows: incident created, state changes (acknowledged/resolved/closed), escalation events, manual trigger button
- Simple field matching for conditions (priority = HIGH, service = api-gateway, no AND/OR logic)
- Incident age triggers enabled (run workflow if incident open for >1 hour without acknowledgment)

### Execution Model and Error Handling
- Sequential execution, stop on first error (actions run one at a time in order, failure stops workflow)
- Configurable retry with exponential backoff per action (N retries with increasing delays for transient failures)
- Execution failures communicated via: notification to incident assignee, notification to workflow creator, Slack/Teams alert to team channel
- Configurable timeout per workflow (1min, 5min, 15min options), exceeding timeout cancels execution

### Claude's Discretion
- Mini-map/overview panel for visual builder (add if workflow complexity warrants navigation aid)
- Multiple workflows triggering from one incident (allow all matching workflows to run in parallel)
- Frontend UI component library choice for node-based visual builder
- Webhook action response parsing and storage strategy
- OAuth token storage and refresh mechanism details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for workflow automation patterns

</specifics>

<deferred>
## Deferred Ideas

- Slack/Teams messaging actions (beyond standard notifications) — consider adding in future iteration
- Script execution/runbook automation (bash/python scripts) — deferred to later phase for security review
- Scheduled workflow runs (cron-style) — time-based scheduling beyond incident age triggers
- Advanced condition matching with operators (IN, MATCHES, comparison operators) — start simple, add complexity later
- Bidirectional ticket sync (ticket status updates resolve incidents) — integration complexity deferred
- Workflow marketplace for sharing workflows between organizations — future enhancement

</deferred>

---

*Phase: 08-automation-workflows*
*Context gathered: 2026-02-07*
