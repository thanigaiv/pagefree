# Roadmap: OnCall Platform

## Overview

This roadmap delivers a production-ready incident management platform to replace PagerDuty for 50+ on-call engineers. The journey progresses from foundation (authentication and user management) through alert ingestion and processing, to advanced features like workflow automation and status pages. Each phase builds on previous work, with early phases addressing critical pitfalls around delivery guarantees, timezone handling, and notification reliability identified in research.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & User Management** - Authentication, teams, and audit infrastructure
- [x] **Phase 2: Alert Ingestion & Webhooks** - Receive alerts from monitoring tools
- [x] **Phase 3: Scheduling System** - On-call schedules with rotations and timezone handling
- [x] **Phase 4: Alert Routing & Deduplication** - Process and route alerts to on-call engineers
- [x] **Phase 5: Multi-Channel Notifications** - Deliver alerts via email, SMS, push, phone, Slack
- [ ] **Phase 6: Incident Management Dashboard** - Web and mobile UI for incident response
- [ ] **Phase 7: External Integrations** - DataDog, New Relic, Slack bidirectional sync
- [ ] **Phase 8: Automation & Workflows** - Response plays and runbook automation
- [ ] **Phase 9: Status Pages** - Internal status pages with automatic updates
- [ ] **Phase 10: Postmortems** - Timeline generation and documentation

## Phase Details

### Phase 1: Foundation & User Management
**Goal**: Users can authenticate via Okta SSO, manage teams, and platform has audit infrastructure for all critical operations
**Depends on**: Nothing (first phase)
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05, USER-06, USER-07, USER-08
**Success Criteria** (what must be TRUE):
  1. User can authenticate via Okta SSO (break-glass local auth for emergencies)
  2. User can view profile with name, email, and contact methods (read-only from Okta)
  3. User can set notification preferences for email, push, and SMS
  4. Admin can organize users into teams with flat structure and tags
  5. System maintains audit log showing who performed what action when
**Plans**: 10 plans

Plans:
- [x] 01-01-PLAN.md - Project setup and database schema
- [x] 01-02-PLAN.md - Audit logging infrastructure
- [x] 01-03-PLAN.md - RBAC system (platform + team roles)
- [x] 01-04-PLAN.md - Okta SSO integration
- [x] 01-05-PLAN.md - Break-glass authentication
- [x] 01-06-PLAN.md - SCIM 2.0 user/group provisioning
- [x] 01-07-PLAN.md - User profiles, notification preferences, contact verification, and mobile refresh tokens
- [x] 01-08-PLAN.md - Team management
- [x] 01-09-PLAN.md - Integration testing and verification
- [x] 01-10-PLAN.md - API key infrastructure for external services
- [x] 01-11-PLAN.md - TypeScript compilation fixes (gap closure)

### Phase 2: Alert Ingestion & Webhooks
**Goal**: System reliably receives and stores alerts from external monitoring tools
**Depends on**: Phase 1
**Requirements**: ALERT-01, INT-01, INT-02, INT-03
**Success Criteria** (what must be TRUE):
  1. System receives alerts via webhook API from any monitoring tool
  2. System validates webhook signatures for security
  3. System processes webhooks idempotently (duplicate webhooks don't create duplicate incidents)
  4. System stores all received alerts with complete audit trail
  5. System handles webhook retries and out-of-order delivery correctly
**Plans**: 7 plans

Plans:
- [x] 02-01-PLAN.md - Database schema for alerts, integrations, and webhook delivery tracking
- [x] 02-02-PLAN.md - Signature verification middleware and raw body capture
- [x] 02-03-PLAN.md - Idempotency detection with hybrid duplicate detection
- [x] 02-04-PLAN.md - Alert schema validation and RFC 7807 error formatting
- [x] 02-05-PLAN.md - Integration management service and API
- [x] 02-06-PLAN.md - Generic webhook receiver endpoint
- [x] 02-07-PLAN.md - Integration tests and verification

### Phase 3: Scheduling System
**Goal**: Users can create on-call schedules with correct timezone and DST handling
**Depends on**: Phase 1
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06, SCHED-07, SCHED-08, SCHED-09, SCHED-10
**Success Criteria** (what must be TRUE):
  1. User can create schedules with daily, weekly, or custom rotations
  2. User can set schedule overrides for temporary changes (vacations)
  3. User can swap shifts with another team member
  4. System handles timezones correctly across distributed teams (UTC storage, local display)
  5. System handles DST transitions without schedule gaps or wrong assignments
  6. System integrates with Google Calendar and Outlook Calendar
  7. User can view who is currently on-call for each service at any time
**Plans**: 7 plans

Plans:
- [x] 03-01-PLAN.md - Database schema for schedules (Schedule, ScheduleLayer, ScheduleOverride, CalendarSync)
- [x] 03-02-PLAN.md - Schedule CRUD service with RRULE generation (daily/weekly/custom rotations)
- [x] 03-03-PLAN.md - Schedule layers with priority precedence and restrictions
- [x] 03-04-PLAN.md - Schedule overrides and shift swaps with conflict detection
- [x] 03-05-PLAN.md - Who-is-on-call query service with timezone handling
- [x] 03-06-PLAN.md - Calendar sync (Google Calendar and Outlook)
- [x] 03-07-PLAN.md - DST test fixtures and integration tests

### Phase 4: Alert Routing & Deduplication
**Goal**: Alerts route to correct on-call engineer with deduplication and escalation
**Depends on**: Phase 2, Phase 3
**Requirements**: ALERT-02, ALERT-04, ALERT-05, ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05
**Success Criteria** (what must be TRUE):
  1. System deduplicates alerts automatically using fingerprinting
  2. System routes alerts to appropriate on-call engineer based on service and schedule
  3. System escalates to next person if incident not acknowledged within timeout
  4. System supports multi-level escalation policies with configurable timeouts
  5. User can search and filter alerts in dashboard
  6. System maintains complete alert history with audit trail
**Plans**: 8 plans

Plans:
- [x] 04-01-PLAN.md - Database models for incidents and escalation policies
- [x] 04-02-PLAN.md - BullMQ queue infrastructure for escalation timers
- [x] 04-03-PLAN.md - Escalation policy management service and API
- [x] 04-04-PLAN.md - Alert deduplication and routing services (TDD)
- [x] 04-05-PLAN.md - Incident lifecycle management (acknowledge, resolve, reassign)
- [x] 04-06-PLAN.md - Escalation worker and orchestration service
- [x] 04-07-PLAN.md - Alert search API and webhook pipeline integration
- [x] 04-08-PLAN.md - Integration tests and verification

### Phase 5: Multi-Channel Notifications
**Goal**: Critical alerts reach on-call engineers through multiple reliable channels
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09, NOTIF-10, NOTIF-11
**Success Criteria** (what must be TRUE):
  1. System sends notifications via email, Slack, Teams, push, SMS, and phone call
  2. System implements at-least-once delivery guarantee with retry logic
  3. System tracks notification delivery success/failure with audit trail
  4. System supports multi-provider failover (Twilio primary, AWS SNS fallback)
  5. User can acknowledge incident from Slack (bidirectional sync)
  6. User can resolve incident from Slack (bidirectional sync)
  7. System escalates through different channels on delivery failure (push -> SMS -> voice)
**Plans**: 11 plans

Plans:
- [x] 05-01-PLAN.md - Database schema and type foundation (NotificationLog, MagicLinkToken, connections)
- [x] 05-02-PLAN.md - Email and SMS channel implementations
- [x] 05-03-PLAN.md - Slack channel with Block Kit messages
- [x] 05-04-PLAN.md - Microsoft Teams channel with Adaptive Cards
- [x] 05-05-PLAN.md - Push notifications and voice call channels
- [x] 05-06-PLAN.md - Notification dispatcher and delivery tracking
- [x] 05-07-PLAN.md - Slack bidirectional sync (button interactions and slash commands)
- [x] 05-08-PLAN.md - Magic links and Twilio webhooks (email/SMS/voice interactivity)
- [x] 05-09-PLAN.md - Integration with escalation engine and worker startup
- [x] 05-10-PLAN.md - Multi-provider failover (Twilio to AWS SNS)
- [x] 05-11-PLAN.md - Tests and verification

### Phase 6: Incident Management Dashboard
**Goal**: Users can view, acknowledge, and manage incidents from web and mobile
**Depends on**: Phase 4, Phase 5
**Requirements**: INC-01, INC-02, INC-03, INC-04, INC-05, INC-06, INC-07, MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05, MOBILE-06
**Success Criteria** (what must be TRUE):
  1. User sees dashboard of all active incidents with real-time updates
  2. User can acknowledge incident from web dashboard (stops escalation)
  3. User can resolve incident with resolution notes from web dashboard
  4. User can add notes to incident timeline
  5. System displays complete incident timeline with all events
  6. Mobile PWA works offline and sends push notifications
  7. User can acknowledge and resolve incidents from mobile device
  8. System tracks push token lifecycle and registration
**Plans**: TBD

Plans:
- [ ] 06-01: TBD during phase planning

### Phase 7: External Integrations
**Goal**: Platform integrates seamlessly with DataDog, New Relic, and Slack
**Depends on**: Phase 2, Phase 5
**Requirements**: INT-04, INT-05, INT-06, INT-07
**Success Criteria** (what must be TRUE):
  1. System processes DataDog webhooks and creates incidents automatically
  2. System processes New Relic webhooks and creates incidents automatically
  3. User can configure integration settings via web UI
  4. System maintains bidirectional sync with Slack (notifications and actions)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD during phase planning

### Phase 8: Automation & Workflows
**Goal**: Users can define automated response workflows triggered by incident conditions
**Depends on**: Phase 6
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06, AUTO-07
**Success Criteria** (what must be TRUE):
  1. User can define automated actions triggered by incident conditions (priority, service)
  2. System executes basic actions (create ticket, post to Slack, call webhook)
  3. User can define workflows with conditional logic (if priority = high, then...)
  4. User can create workflows using visual workflow builder
  5. System provides template library for common workflows
  6. User can trigger runbook automation to execute scripts on incident
  7. System logs all automated actions to incident timeline
**Plans**: TBD

Plans:
- [ ] 08-01: TBD during phase planning

### Phase 9: Status Pages
**Goal**: Users can create status pages that automatically reflect incident state
**Depends on**: Phase 6
**Requirements**: STATUS-01, STATUS-02, STATUS-03, STATUS-04
**Success Criteria** (what must be TRUE):
  1. User can create private status pages for internal services
  2. System automatically updates status based on active incidents
  3. User can manually update status for maintenance windows
  4. User can notify subscribers of status changes
**Plans**: TBD

Plans:
- [ ] 09-01: TBD during phase planning

### Phase 10: Postmortems
**Goal**: Users can generate postmortems from incident data with action item tracking
**Depends on**: Phase 6
**Requirements**: POST-01, POST-02, POST-03, POST-04, POST-05
**Success Criteria** (what must be TRUE):
  1. System generates incident timeline automatically for postmortem
  2. User can create postmortem document with editor
  3. User can link incidents to postmortems
  4. User can share postmortems with team
  5. User can track action items from postmortems with completion status
**Plans**: TBD

Plans:
- [ ] 10-01: TBD during phase planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 - 2 - 3 - 4 - 5 - 6 - 7 - 8 - 9 - 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & User Management | 11/11 | Complete | 2026-02-06 |
| 2. Alert Ingestion & Webhooks | 7/7 | Complete | 2026-02-07 |
| 3. Scheduling System | 7/7 | Complete | 2026-02-07 |
| 4. Alert Routing & Deduplication | 8/8 | Complete | 2026-02-08 |
| 5. Multi-Channel Notifications | 11/11 | Complete | 2026-02-08 |
| 6. Incident Management Dashboard | 0/TBD | Not started | - |
| 7. External Integrations | 0/TBD | Not started | - |
| 8. Automation & Workflows | 0/TBD | Not started | - |
| 9. Status Pages | 0/TBD | Not started | - |
| 10. Postmortems | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-06*
*Last updated: 2026-02-08 (Phase 5 complete)*
