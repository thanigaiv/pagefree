# Phase 5: Multi-Channel Notifications - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver critical alerts to on-call engineers through email, Slack, Microsoft Teams, push notifications, SMS, and phone calls. This phase implements the notification delivery layer that Phase 4's escalation engine triggers. Includes bidirectional Slack/Teams integration for acknowledging and resolving incidents directly from chat.

</domain>

<decisions>
## Implementation Decisions

### Email Notifications
- Match PagerDuty email format (team is familiar with that structure)
- Include magic links for acknowledge/resolve actions (token-based auth for convenience)
- Full incident details in email body (subject, priority, service, triggered time, alert count, full alert message, dashboard link)

### Slack Notifications
- Rich message with action buttons (structured message, color-coded by priority, inline Acknowledge and Resolve buttons)
- When user acknowledges: Update button state ("Acknowledged by @user"), change message background color, stop escalation
- OAuth session-based authentication (user connects Slack account once, action buttons use that session)
- Optimistic UI with rollback for race conditions (button shows loading, rolls back if another user beat you to it)
- Support both action buttons AND slash commands (/oncall ack <id>, /oncall resolve <id>) for power users

### Microsoft Teams Notifications
- Mirror Slack approach (Adaptive Cards with action buttons, OAuth auth, consistent UX)
- Same interaction model as Slack for consistency across platforms

### SMS Notifications
- Format: `[PRIORITY] service-name: short message. Incident #ID - Reply ACK to acknowledge`
- Example: `[CRITICAL] payments-api: High error rate. Incident #1234 - Reply ACK to acknowledge`
- Optimize for 160 character SMS limit

### Push Notifications
- Critical incidents override Do Not Disturb (use platform critical alerts - Android notification channel, iOS critical alert)
- Lower priority incidents respect user device settings

### Phone Call Notifications
- Text-to-speech with keypress menu
- TTS reads: "Critical incident for [service]. [brief message]. Press 1 to acknowledge, press 2 for details, press 9 to escalate"
- Interactive IVR flow for on-call response

### Notification Content
- Escalation notifications prefixed with level: `[ESCALATION - Level 2]` in subject/message
- Send to both personal channels AND shared team Slack/Teams channel for visibility
- Alert grouping display: Claude decides balance between information vs notification length

### Delivery & Retry Strategy
- Aggressive retries: 5 attempts over 10 minutes with exponential backoff (30s, 1m, 2m, 4m, 3m)
- Per-channel tracking: Retry only failed channels (don't resend to channels that succeeded)
- Permanent failure: Mark failed when critical channels (email + SMS) both fail after all retries
- Delivery tracking: Track both provider acceptance AND end-user delivery status asynchronously
- Rate limiting: Bundle rapid alerts (5+ incidents for same service in 10 minutes → single "Multiple incidents" notification)
- Maintenance windows: Queue all notifications during scheduled maintenance, deliver when maintenance ends

### Slack/Teams Integration
- OAuth token refresh: Silent automatic refresh in background - user never notices expiration
- Race condition handling: Optimistic UI + rollback (first click wins, others see rollback)
- Both buttons + slash commands for flexibility

### Failover & Channel Escalation
- Channel escalation trigger: On delivery failure (if push fails after retries, immediately try SMS; if SMS fails, try voice)
- Hybrid parallel/sequential: Send non-intrusive channels in parallel (push/email/Slack), sequential for intrusive (SMS/voice only if needed)
- Total failure handling: Alert ops team if all channels fail (create high-priority alert for ops via separate escalation path)

### Claude's Discretion
- Slack rate limiting strategy (queue + backoff vs bundle vs email failover)
- Provider failover implementation (Twilio → AWS SNS switch logic)
- Queue TTL and expiration during outages (balance queue health vs delivery guarantees)
- Alert grouping details in notifications (how much history to show)

</decisions>

<specifics>
## Specific Ideas

- PagerDuty-style emails for familiarity with existing on-call teams
- Magic links in email for quick acknowledge/resolve without opening dashboard
- Optimistic UI in Slack - show loading immediately, don't make users wait for server response
- Power users get slash commands, casual users get buttons - support both interaction styles
- Critical incidents are treated specially (override DND, faster escalation paths)

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 05-multi-channel-notifications*
*Context gathered: 2026-02-08*
