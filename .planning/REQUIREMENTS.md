# Requirements: OnCall Platform

**Defined:** 2025-02-06
**Core Value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds

## v1 Requirements

Requirements for initial production deployment. Each maps to roadmap phases.

### Alert Management

- [ ] **ALERT-01**: System receives alerts via webhook API from external monitoring tools
- [ ] **ALERT-02**: System deduplicates alerts automatically using fingerprinting/alias
- [ ] **ALERT-03**: System supports alert priority levels (critical, high, medium, low)
- [ ] **ALERT-04**: User can search and filter alerts in dashboard
- [ ] **ALERT-05**: System maintains alert history and audit trail

### On-Call Scheduling

- [ ] **SCHED-01**: User can create on-call schedules with daily rotations
- [ ] **SCHED-02**: User can create on-call schedules with weekly rotations
- [ ] **SCHED-03**: User can create on-call schedules with custom rotations
- [ ] **SCHED-04**: User can set schedule overrides for temporary changes
- [ ] **SCHED-05**: User can swap shifts with another team member
- [ ] **SCHED-06**: System handles timezones correctly for distributed teams (UTC-based storage)
- [ ] **SCHED-07**: System handles DST transitions without schedule gaps
- [ ] **SCHED-08**: System integrates with Google Calendar (sync schedules)
- [ ] **SCHED-09**: System integrates with Outlook Calendar (sync schedules)
- [ ] **SCHED-10**: User can view who is currently on-call for each service

### Routing & Escalation

- [ ] **ROUTE-01**: System routes alerts to appropriate on-call engineer based on service and schedule
- [ ] **ROUTE-02**: System supports escalation policies with configurable timeouts
- [ ] **ROUTE-03**: System supports multi-level escalation (escalate to next level if not acknowledged)
- [ ] **ROUTE-04**: User can manually reassign incident to different responder
- [ ] **ROUTE-05**: System stops escalation when incident is acknowledged

### Notifications

- [ ] **NOTIF-01**: System sends email notifications for new incidents
- [ ] **NOTIF-02**: System sends Slack notifications for new incidents
- [ ] **NOTIF-03**: System sends Microsoft Teams notifications for new incidents
- [ ] **NOTIF-04**: System sends push notifications to PWA for new incidents
- [ ] **NOTIF-05**: System sends SMS notifications for new incidents via Twilio
- [ ] **NOTIF-06**: System makes phone call notifications for critical incidents via Twilio
- [ ] **NOTIF-07**: System supports multi-provider failover for SMS/voice (Twilio primary, AWS SNS fallback)
- [ ] **NOTIF-08**: System tracks notification delivery success/failure with audit trail
- [ ] **NOTIF-09**: System implements at-least-once delivery guarantee for notifications
- [ ] **NOTIF-10**: User can acknowledge incident from Slack (bidirectional sync)
- [ ] **NOTIF-11**: User can resolve incident from Slack (bidirectional sync)

### Incident Management

- [ ] **INC-01**: User sees dashboard of all active incidents
- [ ] **INC-02**: User can acknowledge incident (stops escalation)
- [ ] **INC-03**: User can resolve incident with resolution notes
- [ ] **INC-04**: System displays incident timeline with all events (triggered, acknowledged, escalated, resolved)
- [ ] **INC-05**: User can add notes to incident timeline
- [ ] **INC-06**: System supports incident priority levels
- [ ] **INC-07**: User can view incident history (resolved incidents)

### Integrations

- [ ] **INT-01**: System provides generic webhook receiver for any monitoring tool
- [ ] **INT-02**: System validates webhook signatures for security
- [ ] **INT-03**: System processes webhooks idempotently (duplicate webhooks don't create duplicate incidents)
- [ ] **INT-04**: System provides DataDog-specific integration
- [ ] **INT-05**: System provides New Relic-specific integration
- [ ] **INT-06**: System provides Slack bidirectional integration (notifications + actions)
- [ ] **INT-07**: User can configure integration settings via web UI

### Automation & Workflows

- [ ] **AUTO-01**: User can define automated actions triggered by incident conditions
- [ ] **AUTO-02**: System supports basic actions (create ticket, post to Slack, call webhook)
- [ ] **AUTO-03**: User can define workflows with conditional logic (if priority = high, then...)
- [ ] **AUTO-04**: User can create workflows using visual workflow builder (no-code)
- [ ] **AUTO-05**: System provides template library for common workflows
- [ ] **AUTO-06**: User can trigger runbook automation (execute scripts on incident)
- [ ] **AUTO-07**: System logs all automated actions to incident timeline

### Status Pages

- [ ] **STATUS-01**: User can create private status pages for internal services
- [ ] **STATUS-02**: System automatically updates status based on active incidents
- [ ] **STATUS-03**: User can manually update status for maintenance windows
- [ ] **STATUS-04**: User can notify subscribers of status changes

### Postmortems

- [ ] **POST-01**: System generates incident timeline automatically for postmortem
- [ ] **POST-02**: User can create postmortem document with editor
- [ ] **POST-03**: User can link incidents to postmortems
- [ ] **POST-04**: User can share postmortems with team
- [ ] **POST-05**: User can track action items from postmortems

### Mobile & Web

- [ ] **MOBILE-01**: System provides Progressive Web App (PWA) with push notification support
- [ ] **MOBILE-02**: User can acknowledge incidents from mobile PWA
- [ ] **MOBILE-03**: User can resolve incidents from mobile PWA
- [ ] **MOBILE-04**: User can view incident details and timeline on mobile PWA
- [ ] **MOBILE-05**: User receives push notifications on mobile device
- [ ] **MOBILE-06**: System tracks push token lifecycle and registration

### User & Team Management

- [ ] **USER-01**: User can create account and authenticate (email/password)
- [ ] **USER-02**: User can manage profile (name, email, contact methods)
- [ ] **USER-03**: User can set notification preferences (email, push, SMS)
- [ ] **USER-04**: Admin can organize users into teams
- [ ] **USER-05**: System supports role-based access control (admin, responder, observer)
- [ ] **USER-06**: System maintains audit log of user actions
- [ ] **USER-07**: Admin can invite users to platform
- [ ] **USER-08**: User can verify contact methods (email, phone, Slack)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Status Pages

- **STATUS-05**: Public status pages for customer-facing services

### Integrations

- **INT-08**: Microsoft Teams bidirectional integration (notifications + actions)
- **INT-09**: Prometheus/Grafana integration
- **INT-10**: Custom webhook templates for easier integration setup

### Mobile

- **MOBILE-07**: Full offline capability with local data caching

### Automation

- **AUTO-08**: AI-powered automation suggestions based on incident patterns

### Analytics

- **ANALYTICS-01**: Alert fatigue metrics and dashboards
- **ANALYTICS-02**: Team performance and response time analytics
- **ANALYTICS-03**: Service reliability metrics
- **ANALYTICS-04**: ML-based alert noise reduction

### Advanced Features

- **ADV-01**: Incident Command System (ICS) for major incidents
- **ADV-02**: Service dependency mapping
- **ADV-03**: Advanced scheduling features (follow-the-sun rotations)
- **ADV-04**: Multi-language support

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Conference call bridges | Not needed for initial rollout, defer to v2+ |
| Service dependency mapping | Complex feature, not critical for v1 |
| Multi-tenancy | Internal tool, single organization only |
| Native iOS/Android apps | PWA sufficient for mobile needs in v1 |
| Advanced analytics/ML | Basic reporting adequate for v1, requires data accumulation |
| Real-time monitoring (building own monitoring) | Integration with existing tools (DataDog, New Relic) sufficient, avoid scope creep |
| Built-in ticketing system | Integrate with existing systems (Jira, etc) via automation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v1 requirements: 0 total
- Mapped to phases: 0
- Unmapped: 0 ⚠️

---
*Requirements defined: 2025-02-06*
*Last updated: 2025-02-06 after initial definition*
