# Phase 1: Foundation & User Management - Context

**Gathered:** 2025-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Building the authentication system (Okta SSO integration), user profiles, team organization structure, and audit logging infrastructure that all other phases depend on. This phase establishes the foundational user management patterns and security model for the platform.

</domain>

<decisions>
## Implementation Decisions

### Authentication Flow

- **SSO Provider**: Okta integration (not email/password)
- **Provisioning**: Both SAML (authentication) + SCIM (user provisioning)
- **Session handling**: Immediate logout when Okta session expires or user removed from Okta
- **Mobile authentication**: Long-lived refresh tokens after initial Okta auth (for 24/7 on-call scenarios)
- **Emergency access**: Break-glass local admin accounts bypass Okta for disaster recovery
- **API authentication**: API keys per service for external webhooks (DataDog, New Relic), separate from Okta
- **Email/password auth**: Keep ONLY for break-glass emergency admin accounts (update USER-01 requirement)
- **User deprovisioning**: Soft delete - mark inactive, preserve all historical data for audit trail

### User Profiles & Preferences

- **Profile data source**: All profile data (name, email, phone) synced from Okta via SCIM - platform is read-only for contact info
- **Notification preferences**: Managed in platform (user sets preferences for email vs SMS vs push)
- **Contact verification**: Independent verification required even though data comes from Okta (send test notifications)
- **Required contact methods**: All three required for on-call engineers:
  - Email (verified)
  - Phone/SMS (verified)
  - Push notifications (mobile device registered)

### Team Organization Model

- **Team source**: Hybrid - initial teams from Okta groups via SCIM, platform admins can create additional teams
- **Team structure**: Flat with tags/labels, not hierarchical
  - Organizational tags (Engineering, Product, SRE, Security)
  - Technical tags (Backend, Frontend, Mobile, Payments, Auth)
- **Team ownership**:
  - Teams own: on-call schedules, services/alerts, escalation policies, integrations
  - Service ownership: Primary + secondary ownership model (one primary team, optional secondary teams for escalation)
- **Cross-team model**:
  - Users can be on multiple teams
  - Escalation can cross team boundaries
  - Full visibility - all teams can see other teams' incidents and on-call schedules
- **Roles**: Both global platform roles AND per-team roles
  - Platform admin: complete control across all teams
  - Team admin: full team control (add/remove users, configure schedules, integrations, all settings)
  - Responder: can acknowledge and resolve incidents
  - Observer: read-only for stakeholders, managers, support staff, audit/compliance
- **Team lifecycle**:
  - Creation: Request-based (users request new teams, platform admin approves)
  - Disbanding: Archive with history (marked inactive, data preserved, can't create new incidents)
  - Admin role changes: Admin assigns/removes team admin roles
- **Team settings**:
  - Team-level notification defaults and escalation defaults
  - Notification preferences: Hybrid (team sets minimum requirements, users can add additional channels)
  - Cost tracking: Track per-team costs (SMS, voice calls) for budgeting/chargeback
  - Maintenance mode: Teams can enter maintenance mode with alert suppression
- **Team features**:
  - Dedicated Slack channel per team for incidents
  - Rich team profiles (description, runbooks, key contacts, Slack channels)
  - Team health metrics visible to all (response times, incident volume)
  - Dashboard views: Users can toggle between team-only view and cross-team view
- **Team constraints**:
  - Recommended guidelines (warn if <3 responders or no admin) but no hard limits
  - Users can self-service opt-out from teams (admin notified)
  - No team dependency tracking in Phase 1 (deferred to later phases)
- **Multi-team scenarios**:
  - Users on-call for multiple teams: all incidents routed normally (user's responsibility to manage)

### Audit Logging Scope

- **What to log**: Everything - all user actions for complete audit trail:
  - Authentication events (login, logout, session expiry, failed auth)
  - Incident actions (acknowledge, resolve, reassign, notes added)
  - Configuration changes (team settings, escalation policies, integrations)
- **Retention**: 90 days
- **Access control**: Team admins can view audit logs for their team, platform admins see all
- **Presentation**: Both approaches:
  - Dedicated audit log page with filterable table
  - Inline audit events on team pages, incident timelines, user profiles
- **Export**: API access for programmatic querying (not CSV/streaming to SIEM in Phase 1)
- **Metadata captured**:
  - User identity (user ID, name, email)
  - Timestamp (UTC)
  - IP address / location
  - User agent / device info
- **Integrity**: Standard database storage, trust database permissions (not write-only/immutable)
- **Anomaly detection**: Not for Phase 1 (manual review only, anomaly detection deferred)

### Claude's Discretion

- Authentication error message UX and rate limiting approach
- Exact Okta webhook or polling mechanism for session expiry detection
- Database schema optimization for audit logs (partitioning, indexing)
- Team tag taxonomy (predefined vs custom)
- User onboarding flow and welcome screens

</decisions>

<specifics>
## Specific Ideas

- Break-glass accounts are specifically for "Okta is down during critical incident" scenarios
- Mobile long-lived tokens address the 3am on-call scenario where quick access is critical
- Cost tracking per team is motivated by the overall PagerDuty cost reduction goal
- Team health metrics being public supports organizational transparency culture
- Soft delete for users and archive for teams ensures audit trail integrity for compliance

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope. Some features explicitly deferred to later phases:
- Team dependency tracking (service catalog phase)
- Anomaly detection on audit logs (security monitoring phase)
- SIEM integration for audit logs (observability phase)
- Advanced team analytics (reporting phase)

</deferred>

---

*Phase: 01-foundation-&-user-management*
*Context gathered: 2025-02-06*
