# OnCall Platform

## What This Is

A Digital Operations Reliability Platform that orchestrates incident response for large engineering teams. Handles alert routing, on-call scheduling, escalation policies, integrations with monitoring tools, mobile notifications, automated response workflows, status pages, and postmortem documentation. Built as a cost-effective PagerDuty replacement with enhanced automation capabilities and simpler integration setup.

## Core Value

Reliable alert delivery and escalation - ensuring critical alerts reach the right on-call engineer within seconds, with clear escalation paths. If alerts don't reach the right person at the right time, nothing else matters.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Alert Routing & Escalation:**
- [ ] Receive alerts via webhook API from monitoring tools
- [ ] Route alerts to appropriate on-call engineer based on service and schedule
- [ ] Escalate to next person if not acknowledged within timeout
- [ ] Support multi-level escalation policies
- [ ] Deduplicate and group related alerts

**On-Call Management:**
- [ ] Create and manage on-call schedules with rotations
- [ ] Support multiple rotation types (daily, weekly, custom)
- [ ] Allow schedule overrides and shift swaps
- [ ] Calendar integration (sync with Google/Outlook calendars)
- [ ] Time zone handling for distributed teams

**Integrations:**
- [ ] DataDog integration for receiving alerts
- [ ] New Relic integration for receiving alerts
- [ ] Generic webhook receiver for any monitoring tool
- [ ] Slack notifications and incident channels
- [ ] Microsoft Teams notifications and incident channels
- [ ] Bidirectional sync (acknowledge in Slack = acknowledge in platform)

**Incident Management:**
- [ ] Web dashboard showing active incidents
- [ ] Acknowledge incidents (stops escalation)
- [ ] Resolve incidents with resolution notes
- [ ] Reassign incidents to different responders
- [ ] Add notes and timeline to incidents
- [ ] Incident priority levels

**Automation & Workflows:**
- [ ] Define response plays triggered by incident conditions
- [ ] Automated actions (create ticket, post to Slack, call webhook)
- [ ] Runbook automation (execute scripts on incident trigger)
- [ ] Conditional workflow logic (if priority = high, then...)
- [ ] Template library for common workflows

**Status Pages:**
- [ ] Create public status pages for services
- [ ] Create private status pages for internal services
- [ ] Automatic status updates based on incidents
- [ ] Manual status updates and maintenance windows
- [ ] Subscriber notifications for status changes

**Postmortems:**
- [ ] Generate incident timeline from incident data
- [ ] Postmortem template and editor
- [ ] Link incidents to postmortems
- [ ] Share postmortems with team
- [ ] Track action items from postmortems

**Mobile & Notifications:**
- [ ] Progressive Web App (PWA) for mobile access
- [ ] Push notifications for new incidents
- [ ] Acknowledge/resolve from mobile
- [ ] View incident details and timeline on mobile
- [ ] Push notification reliability and delivery tracking

**User & Team Management:**
- [ ] User authentication and profiles
- [ ] Team structure (organize users into teams)
- [ ] Role-based access control (admin, responder, observer)
- [ ] User notification preferences (push, email, SMS)
- [ ] Audit log of user actions

### Out of Scope

- Conference call bridges — Not needed for initial rollout, defer to future
- Service dependency mapping — Complex feature, not critical for v1
- Multi-tenancy — Internal tool, single organization only
- Native iOS/Android apps — PWA sufficient for mobile needs
- Advanced analytics/ML — Basic reporting adequate for v1

## Context

**Current Situation:**
- Replacing PagerDuty due to cost at scale (50+ on-call engineers)
- Team currently uses full PagerDuty feature set extensively
- Multiple teams with different on-call rotations and services
- Heavy integration with DataDog/New Relic, Slack/Teams

**Pain Points to Address:**
- PagerDuty's automation/response plays are limited and difficult to configure
- Integration setup is cumbersome, especially for custom tools
- Cost scales linearly with user count, unsustainable

**Migration Strategy:**
- Phased rollout - migrate team by team to de-risk
- Must coexist with PagerDuty during transition period
- Success measured by: each team fully migrated, PagerDuty turned off by contract renewal

## Constraints

- **Infrastructure**: AWS — leverage RDS, SES, SNS, Lambda for core services
- **Tech Stack**: React/Node.js/TypeScript — modern web stack, strong hiring pool
- **Timeline**: PagerDuty contract renewal creates deadline pressure for first production deployment
- **Mobile**: Progressive Web App (PWA) — one codebase, mobile-optimized, push notification support
- **Scale**: Must support 50+ on-call engineers, high incident volume, 24/7 reliability
- **Migration**: Must allow gradual rollout, team-by-team migration without disrupting operations
- **Integrations**: Must support DataDog, New Relic, Slack, Teams at minimum for first production team

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PWA over native mobile apps | One codebase, faster development, still gets push notifications and offline capability | — Pending |
| Modern web stack (React/Node.js/TypeScript) | Industry standard, good developer experience, strong ecosystem | — Pending |
| AWS infrastructure | Team already on AWS, leverage managed services (RDS, SES, SNS), reduce operational burden | — Pending |
| Phased migration approach | De-risk by migrating one team at a time, iterate based on real usage feedback | — Pending |
| Enhanced automation as differentiator | Address key PagerDuty pain point, provide competitive advantage over rebuild | — Pending |

---
*Last updated: 2025-02-06 after initialization*
