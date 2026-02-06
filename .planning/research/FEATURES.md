# Feature Research

**Domain:** Incident Management Platform
**Researched:** 2026-02-06
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Alert Ingestion & Routing | Core purpose of platform - accept alerts from monitoring tools and route to right person | MEDIUM | Requires webhook handling, alert parsing, routing rules engine. Must support multiple formats (Datadog, New Relic, etc.) |
| On-Call Scheduling | Teams need predictable rotation management | MEDIUM | Needs calendar views, rotation patterns (daily/weekly/custom), timezone handling, schedule layers, overrides |
| Escalation Policies | Alerts must reach someone who can help | MEDIUM | Multi-level escalation, timeout configuration, fallback contacts, repeat escalation logic |
| Multi-Channel Notifications | People need alerts on their preferred channel | HIGH | Push notifications, SMS, phone calls, email, Slack, Teams. Each has different delivery guarantees and complexity |
| Incident Acknowledgment | Responders must signal they're working on it | LOW | Simple state machine: triggered → acknowledged → resolved |
| Mobile App (or PWA) | On-call responders aren't always at desk | HIGH | Native features (push notifications, calling), offline capability, full incident management from mobile |
| Alert De-duplication | Same issue shouldn't create 100 alerts | MEDIUM | Fingerprinting algorithm, time-window grouping, configurable grouping rules |
| Basic Integrations | Must work with existing monitoring stack | HIGH | Each integration requires custom logic. Start with DataDog, New Relic, Slack, Teams per requirements |
| Incident Timeline/Audit Log | Need to know what happened when | LOW | Event logging with timestamps, state changes, who did what |
| User Management & Teams | Multi-tenant with team boundaries | MEDIUM | User roles, team assignment, permission model, authentication |
| Incident Dashboard | Central view of active incidents | LOW | List view with filters, severity indicators, assignment status |
| Alert Customization | Teams want different fields/priorities | MEDIUM | Custom fields, severity mapping, alert enrichment from source data |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Advanced Workflow Automation | **Pain point addressed**: PagerDuty automation is "limited and hard to configure" | HIGH | Visual workflow builder, conditional logic, auto-remediation, runbook execution. This is your competitive advantage. |
| Intelligent Alert Noise Reduction | ML-based grouping and suppression reduces fatigue | HIGH | Requires historical data, clustering algorithms, pattern recognition. PagerDuty has this - consider table stakes for mature platforms |
| Easy Integration Setup | **Pain point addressed**: "integration setup is cumbersome" | MEDIUM | One-click integrations, auto-discovery, guided configuration, integration templates |
| Incident Command System (ICS) | Google SRE model with defined roles (IC, Ops Lead, Comms Lead) | MEDIUM | Role assignment UI, role-specific views, handoff procedures. Most platforms lack this structure |
| Post-Incident Analytics | Beyond basic metrics - insights on patterns, team performance, MTTR trends | MEDIUM | Data warehouse, custom reports, trend analysis, cost-of-incidents tracking |
| Status Page Integration | Automated public communication during incidents | MEDIUM | Template-based updates, subscriber management, automatic status changes from incident state |
| Postmortem Automation | Auto-generate postmortem from incident timeline with AI assistance | MEDIUM | Template generation, timeline export, action item extraction, searchable archive |
| Responder Recommendations | ML suggests best responder based on incident type and historical resolution | MEDIUM | Requires incident categorization, resolution tracking, expertise modeling |
| Custom Alert Enrichment | Add context from external sources (AWS, K8s, logs) automatically | HIGH | Query external APIs, cache mechanisms, configurable enrichment rules |
| Multi-Service Dependencies | Model service relationships to understand blast radius | MEDIUM | Service catalog, dependency graph, impact prediction |
| Stakeholder Communication | Keep non-technical people informed without alert noise | LOW | Filtered views, plain-english summaries, scheduled updates |
| Conference Bridge Automation | Auto-create war room with phone bridge and video link | LOW | Integration with Zoom/Meet/Teams, automatic invites |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time Everything | Seems modern and responsive | Creates complexity - polling intervals are fine for most use cases. Real-time adds websocket infrastructure, connection management, offline state handling | Use 30-60s polling for dashboards, push notifications for critical state changes only |
| Custom Alert Sources Without Templates | "I want to send any JSON" | Becomes unmaintainable - every team's alerts are different formats | Provide integration templates with schema validation. Custom sources must map to standard fields |
| Unlimited Alert Retention | Historical analysis sounds valuable | Storage costs explode, queries slow down, GDPR complications | 90-day retention with aggregated metrics for longer periods. Archive to S3 for compliance |
| Alert Snoozing Without Escalation | "Let me snooze for 4 hours" | Incidents get forgotten, no escalation if original person doesn't return | Snooze must reassign or escalate, not just delay. Max snooze time 30min |
| Role-Based Access Control (RBAC) for Everything | Security team wants granular permissions | Over-engineering for 50-person team, slows development | Start with team-based access (you can see/manage your team's incidents). Add RBAC later if needed |
| Built-in Monitoring | "Why integrate when you could monitor directly?" | Scope creep - you're building incident management, not Datadog | Focus on best-in-class integration with existing monitoring tools |
| Incident Severity Auto-Classification | "AI should determine if it's P1 or P3" | ML is unreliable for new incident types, false positives create alert fatigue | Let source system set severity, allow manual override, suggest severity based on patterns |
| Chat Platform in the Product | "We need incident chat" | Building Slack is not your business | Deep integration with Slack/Teams where people already are. Auto-create incident channels |
| Complex On-Call Compensation Tracking | "Track who was on-call for payroll" | HR/payroll integration scope creep, timezone complexity, labor law variations | Export schedule data as CSV, let HR tools handle compensation |

## Feature Dependencies

```
Core Platform Foundation
    └──requires──> User Management & Auth
    └──requires──> Team Management
    └──requires──> Database & API Layer

Alert Ingestion & Routing
    └──requires──> Core Platform Foundation
    └──requires──> Notification System (to route to)
    └──requires──> On-Call Scheduling (to know who to route to)
    └──enhances──> Alert De-duplication
    └──enhances──> Alert Enrichment

On-Call Scheduling
    └──requires──> Core Platform Foundation
    └──requires──> User Management & Teams

Escalation Policies
    └──requires──> On-Call Scheduling
    └──requires──> Notification System
    └──requires──> Alert Routing

Notification System
    └──requires──> Core Platform Foundation
    └──requires──> Third-party services (Twilio, Push, SMTP)

Mobile App/PWA
    └──requires──> API Layer
    └──requires──> Push Notification Infrastructure
    └──requires──> Authentication

Integrations (Datadog, New Relic, etc.)
    └──requires──> Alert Ingestion & Routing
    └──requires──> Webhook Infrastructure
    └──enhances──> Alert Enrichment

Workflow Automation
    └──requires──> Alert Routing
    └──requires──> Incident State Machine
    └──requires──> Integration API Layer
    └──enhances──> Auto-remediation

Status Pages
    └──requires──> Incident Management Core
    └──requires──> Public Web Infrastructure
    └──enhances──> Stakeholder Communication

Postmortems
    └──requires──> Incident Timeline/Audit Log
    └──requires──> Incident Resolution
    └──enhances──> Analytics

Analytics & Reporting
    └──requires──> Incident History
    └──requires──> Resolution Data
    └──requires──> Team/User Activity Logs

ICS (Incident Command System)
    └──requires──> Incident Management Core
    └──requires──> Role Assignment
    └──conflicts──> Simple Incident Model (adds complexity)
```

### Dependency Notes

- **Alert Ingestion requires On-Call Scheduling:** Can't route alerts without knowing who's on-call
- **Escalation requires Notification System:** Must be able to notify before escalating
- **Mobile App requires Push Infrastructure:** PWA can work without native push, but user experience suffers
- **Workflow Automation requires stable integration layer:** Automations call external systems, need reliable API
- **ICS conflicts with simple model:** Adding IC/Ops/Comms roles increases complexity. Good for large incidents (10+ people), overkill for 2-person response
- **Postmortems enhance Analytics:** Rich postmortem data feeds better insights
- **Status Pages require public infrastructure:** Different security/scaling concerns than internal app

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed for 50-person team to replace PagerDuty.

- [ ] **Alert Ingestion** — Webhooks for Datadog, New Relic (integration sources listed in requirements)
- [ ] **Alert Routing** — Rule-based routing to teams and individuals
- [ ] **On-Call Scheduling** — Weekly/daily rotations with timezone support, overrides
- [ ] **Escalation Policies** — Multi-level escalation with timeout configuration
- [ ] **Basic Notifications** — Email, Slack, Teams (start with these before SMS/phone)
- [ ] **Mobile PWA** — Web app that works on mobile, progressive enhancement
- [ ] **Incident State Management** — Trigger, acknowledge, resolve workflow
- [ ] **Incident Dashboard** — View active/recent incidents, filter by team/status
- [ ] **User & Team Management** — Team boundaries, role assignment (admin vs responder)
- [ ] **Alert De-duplication** — Time-window grouping to prevent spam
- [ ] **Audit Log** — Who did what when for each incident

**Why these for MVP:**
- Covers core on-call workflow: alert arrives → routes to on-call person → they acknowledge → they resolve
- Addresses known requirements: integrations (Datadog/New Relic/Slack/Teams), scheduling, escalation, mobile
- Enables team to stop using PagerDuty immediately after launch
- Defers complex features (automation, analytics, status pages) until core is proven

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **SMS & Phone Notifications** — After Slack/email proven, add critical notification channels (requires Twilio integration)
- [ ] **Basic Workflow Automation** — Simple if-then rules before visual builder (addresses pain point but starts simple)
- [ ] **Alert Enrichment** — Add context from AWS/K8s metadata to alerts
- [ ] **Incident Timeline** — Detailed event log with all state changes, comments, actions
- [ ] **Native Mobile App** — After PWA validated, build iOS/Android for better push notifications
- [ ] **Status Page** — Public incident communication (addressed in requirements but not MVP-critical)
- [ ] **Postmortem Templates** — Basic postmortem generation from timeline
- [ ] **Basic Analytics** — MTTR, MTTA, incident counts by team/service
- [ ] **Maintenance Windows** — Suppress alerts during planned maintenance
- [ ] **Integration Marketplace** — Expand beyond initial Datadog/New Relic/Slack/Teams

**Trigger for adding:** When team successfully responds to 50+ incidents on MVP platform, indicating core workflow is solid.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Advanced Workflow Builder** — Visual automation designer (competitive advantage but complex)
- [ ] **ML-based Noise Reduction** — Requires significant historical data (6+ months)
- [ ] **Incident Command System** — Role-based incident management for major incidents
- [ ] **Responder Recommendations** — ML-suggested best responder for incident type
- [ ] **Service Catalog & Dependencies** — Service modeling for blast radius analysis
- [ ] **Advanced Analytics** — Cost-of-incidents, trend prediction, team optimization
- [ ] **Conference Bridge Automation** — Auto-create war rooms with video/phone
- [ ] **Multi-Region Deployment** — For high availability (can start single-region)
- [ ] **Custom Mobile App Themes** — Team branding (nice-to-have)
- [ ] **API Rate Limiting & Quotas** — Needed for multi-tenant SaaS, not internal tool

**Why defer:**
- ML features require historical data you don't have yet
- Advanced features add complexity before core is proven
- Internal tool for 50 people doesn't need enterprise features (rate limiting, multi-tenancy at scale)
- Focus on addressing PagerDuty pain points (automation, easy integrations) before adding novel features

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Alert Ingestion (Datadog/NewRelic) | HIGH | MEDIUM | P1 |
| On-Call Scheduling | HIGH | MEDIUM | P1 |
| Escalation Policies | HIGH | MEDIUM | P1 |
| Slack/Teams Notifications | HIGH | LOW | P1 |
| Mobile PWA | HIGH | MEDIUM | P1 |
| Alert De-duplication | HIGH | MEDIUM | P1 |
| Incident Dashboard | HIGH | LOW | P1 |
| User/Team Management | HIGH | LOW | P1 |
| Incident State Management | HIGH | LOW | P1 |
| Audit Log | MEDIUM | LOW | P1 |
| Email Notifications | MEDIUM | LOW | P1 |
| Alert Routing Rules | HIGH | MEDIUM | P1 |
| SMS/Phone Notifications | HIGH | MEDIUM | P2 |
| Basic Workflow Automation | HIGH | HIGH | P2 |
| Alert Enrichment | MEDIUM | MEDIUM | P2 |
| Status Page | MEDIUM | MEDIUM | P2 |
| Postmortem Templates | MEDIUM | MEDIUM | P2 |
| Basic Analytics (MTTR/MTTA) | MEDIUM | LOW | P2 |
| Native Mobile Apps | MEDIUM | HIGH | P2 |
| Maintenance Windows | MEDIUM | LOW | P2 |
| Advanced Workflow Builder | HIGH | HIGH | P3 |
| ML Noise Reduction | MEDIUM | HIGH | P3 |
| Incident Command System | MEDIUM | MEDIUM | P3 |
| Responder Recommendations | LOW | HIGH | P3 |
| Service Dependencies | LOW | MEDIUM | P3 |
| Advanced Analytics | LOW | MEDIUM | P3 |
| Conference Bridge Automation | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (MVP)
- P2: Should have, add in first 6 months after launch
- P3: Nice to have, future consideration

**Note on "Advanced Workflow Automation" (P3):**
While this addresses a key pain point ("PagerDuty's automation is limited"), the *advanced* visual builder is P3. Basic automation (P2) ships first to validate the approach, then iterate to advanced builder once patterns are clear.

## Competitor Feature Analysis

| Feature | PagerDuty | Opsgenie | Splunk On-Call | Our Approach |
|---------|-----------|----------|----------------|--------------|
| Alert Routing | Rule-based, complex config | Service-based routing with filters | Expertise-based routing | Start simple (team + schedule), add complexity progressively |
| Workflow Automation | Event Orchestration (limited per pain point) | Custom actions, API-based | Rules engine with runbooks | Visual builder + code (best of both) - P3 feature |
| Integrations | 700+ integrations | Native Atlassian suite + 200+ | Multi-platform (unspecified count) | Start with required 4 (Datadog/NewRelic/Slack/Teams), expand based on demand |
| Mobile Experience | Native iOS/Android apps | Native apps | Native apps with full functionality | Start PWA (P1), upgrade to native (P2) |
| Notifications | Multi-channel (phone/SMS/push/email) | Multiple channels + custom actions | Device-agnostic with metadata | Email/Slack/Teams (P1), SMS/phone (P2) |
| Scheduling | Complex layers and rotations | On-call schedules with reminders | Automated rotation creation | Match PagerDuty capability - teams need this |
| Analytics | Advanced with ML insights | Operational efficiency + productivity | MTTA/MTTR + historical insights | Basic metrics (P2), advanced (P3) |
| Status Pages | Separate Statuspage product | Stakeholder notifications | Not mentioned | Integrated status page (P2) |
| Postmortems | Post-incident reviews | Post-incident analysis reports | Streamlined retrospectives | Auto-generated from timeline (P2) |
| Noise Reduction | ML-based AIOps | Alert clustering | ML recommendations | Basic dedup (P1), ML clustering (P3) |
| Incident Command | Not explicitly mentioned | Incident Command Center | War room automation | ICS model per Google SRE (P3) |
| Easy Setup | 700+ integrations but "cumbersome" per pain point | Atlassian ecosystem makes setup easier | Not differentiated | One-click integrations, auto-config (P2 differentiator) |

**Key Competitive Insights:**

1. **All platforms have 100+ integrations:** Start with 4 required ones, don't try to match 700 on day one
2. **Native mobile is table stakes:** But PWA can ship faster and validate UX first
3. **Automation is differentiator:** PagerDuty's is "limited and hard to configure" - opportunity here
4. **ML/AI features common in mature platforms:** Defer until you have data (6+ months post-launch)
5. **Status pages often separate products:** You can integrate from start (advantage)
6. **ICS not widely implemented:** Google SRE advocates it, but platforms don't explicitly support it - opportunity for differentiation

## Sources

**Official Platform Documentation (HIGH confidence):**
- PagerDuty Platform: https://www.pagerduty.com/platform/
- Atlassian Opsgenie Features: https://www.atlassian.com/software/opsgenie/features
- Splunk On-Call: https://www.splunk.com/en_us/products/on-call.html
- Atlassian Statuspage: https://www.atlassian.com/software/statuspage
- Atlassian Incident Response: https://www.atlassian.com/incident-management/incident-response

**Open Source References (MEDIUM confidence):**
- Grafana OnCall: https://github.com/grafana/oncall (Note: Entering maintenance mode Mar 2025, archiving Mar 2026)
- Netflix Dispatch: https://github.com/Netflix/dispatch
- Post-mortem Examples: https://github.com/danluu/post-mortems

**Best Practices (HIGH confidence):**
- Google SRE Workbook - Incident Response: https://sre.google/workbook/incident-response/

**Research Methodology:**
- Reviewed feature pages for 3 major commercial platforms (PagerDuty, Opsgenie, Splunk On-Call)
- Analyzed 2 open-source platforms (Grafana OnCall, Netflix Dispatch) for implementation patterns
- Cross-referenced with Google SRE best practices for incident management
- Validated table stakes vs differentiators based on what all platforms implement vs unique features
- Prioritized based on project requirements: 50-person team, PagerDuty replacement, pain points around automation and integration setup

---
*Feature research for: OnCall Platform - Incident Management*
*Researched: 2026-02-06*
