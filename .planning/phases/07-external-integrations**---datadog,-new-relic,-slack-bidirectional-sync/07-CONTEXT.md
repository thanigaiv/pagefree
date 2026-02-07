# Phase 7: External Integrations - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Seamless integration with DataDog, New Relic, and Slack for alert ingestion and bidirectional sync. This phase adds UI configuration for integrations, payload mapping for specific monitoring tools, and enhanced Slack commands. The webhook infrastructure (Phase 2) and notification system (Phase 5) are already built - this phase focuses on making them easy to configure and extend for specific external tools.

</domain>

<decisions>
## Implementation Decisions

### Integration UI and configuration
- Platform-level settings (admin only) - single integration per monitoring tool configured by platform admins
- Minimal setup fields (just enable/disable) - use existing Integration table with secrets, add UI to enable DataDog/New Relic types
- One-page form with test button - single form with all fields, test webhook button to verify before saving
- Status cards with health indicators - card for each integration type showing enabled/disabled, last webhook received, error count

### Webhook payload mapping
- Map provider-specific fields to metadata JSON - store DataDog-specific fields (tags, monitors, snapshots) in alert metadata field, preserve everything
- Direct severity mapping with defaults - map known levels (P1→CRITICAL, P2→HIGH, etc), unknown defaults to MEDIUM like Phase 2
- Store unknown fields in metadata, ignore - preserve in metadata JSON for debugging, don't surface in UI
- Use tags for service routing - look for service tag in alert tags/labels to route via metadata.service like Phase 4 (e.g., service:api, team:platform)

### Slack bidirectional sync details
- Nothing new (use existing Phase 5 Slack implementation) - no additional channel configuration needed
- Add `/oncall integrations` slash command - show integration status and health from Slack
- Integration name in header - add '[DataDog]' or '[New Relic]' prefix to Slack message title

### Testing and verification approach
- Both test webhook button and setup instructions - test button for quick validation + instructions for real-world testing from DataDog/New Relic UI
- Detailed validation results - show parsed fields, severity mapping, routing decision in a dialog
- Show recent webhook attempts - display last 10 webhook deliveries with success/failure and error messages for troubleshooting
- Auto-resolve test alerts after 5 minutes - test webhooks create real alerts that auto-resolve to prevent clutter

### Claude's Discretion
- Exact layout and spacing for integration cards
- Error message wording for failed webhook tests
- Mock webhook payload structure for test button
- Webhook attempt log retention policy

</decisions>

<specifics>
## Specific Ideas

- Integration cards should show health indicators like "Last webhook: 2 minutes ago" and "Error count: 0 in last 24h"
- Test webhook button should create a realistic alert that goes through full pipeline (routing, deduplication) but auto-resolves
- Validation results dialog should help debug issues: "✓ Severity mapped to CRITICAL, ✓ Routed to team Platform via service:api tag"

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 07-external-integrations*
*Context gathered: 2026-02-07*
