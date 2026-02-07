# Requirements: OnCall Platform

**Defined:** 2025-02-06
**Core Value:** Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds

## v1 Requirements

Requirements for initial production deployment. Each maps to roadmap phases.

### Alert Management

- [x] **ALERT-01**: System receives alerts via webhook API from external monitoring tools
- [x] **ALERT-02**: System deduplicates alerts automatically using fingerprinting/alias
- [x] **ALERT-03**: System supports alert priority levels (critical, high, medium, low)
- [x] **ALERT-04**: User can search and filter alerts in dashboard
- [x] **ALERT-05**: System maintains alert history and audit trail

### On-Call Scheduling

- [x] **SCHED-01**: User can create on-call schedules with daily rotations
- [x] **SCHED-02**: User can create on-call schedules with weekly rotations
- [x] **SCHED-03**: User can create on-call schedules with custom rotations
- [x] **SCHED-04**: User can set schedule overrides for temporary changes
- [x] **SCHED-05**: User can swap shifts with another team member
- [x] **SCHED-06**: System handles timezones correctly for distributed teams (UTC-based storage)
- [x] **SCHED-07**: System handles DST transitions without schedule gaps
- [x] **SCHED-08**: System integrates with Google Calendar (sync schedules)
- [x] **SCHED-09**: System integrates with Outlook Calendar (sync schedules)
- [x] **SCHED-10**: User can view who is currently on-call for each service

### Routing & Escalation

- [x] **ROUTE-01**: System routes alerts to appropriate on-call engineer based on service and schedule
- [x] **ROUTE-02**: System supports escalation policies with configurable timeouts
- [x] **ROUTE-03**: System supports multi-level escalation (escalate to next level if not acknowledged)
- [x] **ROUTE-04**: User can manually reassign incident to different responder
- [x] **ROUTE-05**: System stops escalation when incident is acknowledged

### Notifications

- [x] **NOTIF-01**: System sends email notifications for new incidents
- [x] **NOTIF-02**: System sends Slack notifications for new incidents
- [x] **NOTIF-03**: System sends Microsoft Teams notifications for new incidents
- [x] **NOTIF-04**: System sends push notifications to PWA for new incidents
- [x] **NOTIF-05**: System sends SMS notifications for new incidents via Twilio
- [x] **NOTIF-06**: System makes phone call notifications for critical incidents via Twilio
- [x] **NOTIF-07**: System supports multi-provider failover for SMS/voice (Twilio primary, AWS SNS fallback)
- [x] **NOTIF-08**: System tracks notification delivery success/failure with audit trail
- [x] **NOTIF-09**: System implements at-least-once delivery guarantee for notifications
- [x] **NOTIF-10**: User can acknowledge incident from Slack (bidirectional sync)
- [x] **NOTIF-11**: User can resolve incident from Slack (bidirectional sync)

### Incident Management

- [x] **INC-01**: User sees dashboard of all active incidents
- [x] **INC-02**: User can acknowledge incident (stops escalation)
- [x] **INC-03**: User can resolve incident with resolution notes
- [x] **INC-04**: System displays incident timeline with all events (triggered, acknowledged, escalated, resolved)
- [x] **INC-05**: User can add notes to incident timeline
- [x] **INC-06**: System supports incident priority levels
- [x] **INC-07**: User can view incident history (resolved incidents)

### Integrations

- [x] **INT-01**: System provides generic webhook receiver for any monitoring tool
- [x] **INT-02**: System validates webhook signatures for security
- [x] **INT-03**: System processes webhooks idempotently (duplicate webhooks don't create duplicate incidents)
- [x] **INT-04**: System provides DataDog-specific integration
- [x] **INT-05**: System provides New Relic-specific integration
- [x] **INT-06**: System provides Slack bidirectional integration (notifications + actions)
- [x] **INT-07**: User can configure integration settings via web UI

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

- [x] **MOBILE-01**: System provides Progressive Web App (PWA) with push notification support
- [x] **MOBILE-02**: User can acknowledge incidents from mobile PWA
- [x] **MOBILE-03**: User can resolve incidents from mobile PWA
- [x] **MOBILE-04**: User can view incident details and timeline on mobile PWA
- [x] **MOBILE-05**: User receives push notifications on mobile device
- [x] **MOBILE-06**: System tracks push token lifecycle and registration

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
| USER-01 | Phase 1 | Complete |
| USER-02 | Phase 1 | Complete |
| USER-03 | Phase 1 | Complete |
| USER-04 | Phase 1 | Complete |
| USER-05 | Phase 1 | Complete |
| USER-06 | Phase 1 | Complete |
| USER-07 | Phase 1 | Complete |
| USER-08 | Phase 1 | Complete |
| ALERT-01 | Phase 2 | Complete |
| INT-01 | Phase 2 | Complete |
| INT-02 | Phase 2 | Complete |
| INT-03 | Phase 2 | Complete |
| SCHED-01 | Phase 3 | Complete |
| SCHED-02 | Phase 3 | Complete |
| SCHED-03 | Phase 3 | Complete |
| SCHED-04 | Phase 3 | Complete |
| SCHED-05 | Phase 3 | Complete |
| SCHED-06 | Phase 3 | Complete |
| SCHED-07 | Phase 3 | Complete |
| SCHED-08 | Phase 3 | Complete |
| SCHED-09 | Phase 3 | Complete |
| SCHED-10 | Phase 3 | Complete |
| ALERT-02 | Phase 4 | Pending |
| ALERT-03 | Phase 2 | Complete |
| ALERT-04 | Phase 4 | Pending |
| ALERT-05 | Phase 4 | Pending |
| ROUTE-01 | Phase 4 | Pending |
| ROUTE-02 | Phase 4 | Pending |
| ROUTE-03 | Phase 4 | Pending |
| ROUTE-04 | Phase 4 | Pending |
| ROUTE-05 | Phase 4 | Pending |
| NOTIF-01 | Phase 5 | Complete |
| NOTIF-02 | Phase 5 | Complete |
| NOTIF-03 | Phase 5 | Complete |
| NOTIF-04 | Phase 5 | Complete |
| NOTIF-05 | Phase 5 | Complete |
| NOTIF-06 | Phase 5 | Complete |
| NOTIF-07 | Phase 5 | Complete |
| NOTIF-08 | Phase 5 | Complete |
| NOTIF-09 | Phase 5 | Complete |
| NOTIF-10 | Phase 5 | Complete |
| NOTIF-11 | Phase 5 | Complete |
| INC-01 | Phase 6 | Complete |
| INC-02 | Phase 6 | Complete |
| INC-03 | Phase 6 | Complete |
| INC-04 | Phase 6 | Complete |
| INC-05 | Phase 6 | Complete |
| INC-06 | Phase 6 | Complete |
| INC-07 | Phase 6 | Complete |
| MOBILE-01 | Phase 6 | Complete |
| MOBILE-02 | Phase 6 | Complete |
| MOBILE-03 | Phase 6 | Complete |
| MOBILE-04 | Phase 6 | Complete |
| MOBILE-05 | Phase 6 | Complete |
| MOBILE-06 | Phase 6 | Complete |
| INT-04 | Phase 7 | Complete |
| INT-05 | Phase 7 | Complete |
| INT-06 | Phase 7 | Complete |
| INT-07 | Phase 7 | Complete |
| AUTO-01 | Phase 8 | Pending |
| AUTO-02 | Phase 8 | Pending |
| AUTO-03 | Phase 8 | Pending |
| AUTO-04 | Phase 8 | Pending |
| AUTO-05 | Phase 8 | Pending |
| AUTO-06 | Phase 8 | Pending |
| AUTO-07 | Phase 8 | Pending |
| STATUS-01 | Phase 9 | Pending |
| STATUS-02 | Phase 9 | Pending |
| STATUS-03 | Phase 9 | Pending |
| STATUS-04 | Phase 9 | Pending |
| POST-01 | Phase 10 | Pending |
| POST-02 | Phase 10 | Pending |
| POST-03 | Phase 10 | Pending |
| POST-04 | Phase 10 | Pending |
| POST-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 75 total
- Mapped to phases: 75
- Unmapped: 0 ✓

---
*Requirements defined: 2025-02-06*
*Last updated: 2026-02-06 with phase mappings*
