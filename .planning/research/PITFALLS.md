# Pitfalls Research: Incident Management Platform

**Domain:** On-Call / Incident Management Systems
**Researched:** 2026-02-06
**Confidence:** MEDIUM

## Critical Pitfalls

These mistakes cause system-wide failures, missed incidents, or require major rewrites.

---

### Pitfall 1: No Delivery Guarantee Strategy

**What goes wrong:**
Alerts are sent but never confirmed delivered. Network failures, service restarts, or third-party API issues cause silent alert loss. Engineers never get paged, incidents go unnoticed, and production stays down.

**Why it happens:**
Teams treat notification delivery as fire-and-forget. They assume "if the API call returned 200, the alert was delivered." They don't implement retry logic, delivery confirmation, or audit trails.

**How to avoid:**
- Implement at-least-once delivery semantics with idempotent receivers
- Store alert delivery state (pending, delivered, acknowledged, failed)
- Retry failed notifications with exponential backoff
- Track delivery confirmations (SMS delivered, push notification received)
- Maintain audit log of all alert attempts and outcomes
- Alert on alert failures (meta-monitoring)

**Warning signs:**
- No delivery status tracking in the database
- Fire-and-forget API calls to notification providers
- No retry logic for failed sends
- Missing audit trail for alert attempts
- No monitoring of notification delivery success rates

**Phase to address:**
Phase 1 (Foundation) - This is table-stakes for mission-critical systems. Build delivery tracking from day one.

**Source confidence:** HIGH - Core distributed systems pattern documented in multiple SRE resources

---

### Pitfall 2: Single Point of Failure in Notification Stack

**What goes wrong:**
Entire notification system depends on one SMS provider, one push notification service, or one email gateway. When that provider has an outage, ALL alerts fail to deliver. The on-call platform becomes useless exactly when it's most needed.

**Why it happens:**
Teams integrate with one provider (Twilio, FCM, SendGrid) without fallback options. They don't design for provider failure because "Twilio is reliable." They forget that even 99.9% uptime means 8.7 hours down per year.

**How to avoid:**
- Support multiple SMS providers with automatic failover (Twilio → Nexmo → direct carrier APIs)
- Support multiple push notification channels (FCM, APNS, web push)
- Support multiple email gateways with failover
- Implement provider health checks that trigger failover before complete failure
- Allow users to configure multiple notification channels (SMS + phone call + push)
- Test failover paths regularly with chaos engineering

**Warning signs:**
- Single `TwilioClient` with no abstraction layer
- No provider health monitoring
- No fallback notification channels
- Notification sending code tightly coupled to one vendor
- No testing of provider failure scenarios

**Phase to address:**
Phase 2 (Core Features) - Build abstraction for notification providers early, add secondary providers before production use.

**Source confidence:** MEDIUM - Inferred from SRE best practices and Slack/PagerDuty outage discussions (Increment article)

---

### Pitfall 3: Timezone and DST Naive Scheduling

**What goes wrong:**
On-call schedules break during daylight saving time transitions. Users in different timezones see wrong rotation times. Schedules "shift" by an hour twice per year. The wrong person gets paged during DST boundaries, or nobody gets paged during the "missing hour."

**Why it happens:**
Teams store schedules in local time instead of UTC. They use naive date/time libraries without timezone awareness. They test schedules in one timezone (often UTC or US Pacific) without considering DST transitions or international users.

**How to avoid:**
- Store ALL timestamps in UTC in the database
- Convert to user's local timezone only for display
- Use timezone-aware date libraries (luxon, date-fns-tz, not moment.js)
- Explicitly handle DST transition edge cases:
  - Spring forward: 2:30 AM doesn't exist - what happens to 2:30 AM schedule?
  - Fall back: 2:30 AM occurs twice - which one triggers the schedule?
- Support IANA timezone database (America/New_York, not EST)
- Test schedules across multiple timezones and DST boundaries
- Show "starts in X hours" alongside absolute times to catch timezone bugs

**Warning signs:**
- Schedule times stored as local time without timezone
- Using Date objects without timezone library
- Hard-coded UTC offsets instead of timezone names
- No test cases for DST transitions
- UI shows times without timezone indicator
- Schedule rotation code uses `new Date()` without timezone context

**Phase to address:**
Phase 1 (Foundation) - Timezone handling must be correct from the start. Very hard to fix after launch.

**Source confidence:** MEDIUM - Common scheduling system pitfall, though specific DST bugs not documented in sources

---

### Pitfall 4: Race Conditions in Alert Deduplication

**What goes wrong:**
Same alert fires from multiple sources simultaneously. Deduplication logic races, and 5 identical alerts create 5 separate incidents. On-call engineers get spammed with duplicate pages. Or worse: deduplication is too aggressive, and a legitimate second incident gets silently dropped because it "looks like" the first one.

**Why it happens:**
Teams implement deduplication with simple time-window checks without proper locking. They use alert fingerprints that are too broad (dedupe everything from same host) or too narrow (miss obvious duplicates). They don't account for distributed system scenarios where two monitoring systems detect the same problem.

**How to avoid:**
- Use database transactions or distributed locks for deduplication checks
- Design fingerprint strategy carefully:
  - Include: service name, alert type, severity
  - Exclude: timestamp, alert ID, exact metric values
  - Consider: host name (sometimes yes, sometimes no)
- Time-window deduplication (5-minute window) with proper locking
- Track deduplicated alerts (show "3 duplicate alerts suppressed")
- Allow manual override to create separate incidents
- Test with concurrent alert arrival scenarios
- Consider idempotency keys from monitoring systems

**Warning signs:**
- Deduplication logic without database locking
- SELECT-then-INSERT pattern without transactions
- No tests for concurrent alert arrival
- User complaints about "duplicate pages"
- User complaints about "missed alerts"
- Deduplication fingerprint is opaque or unchangeable

**Phase to address:**
Phase 2 (Core Features) - Critical for preventing alert fatigue, must be right before significant load.

**Source confidence:** MEDIUM - Idempotent receiver pattern verified (MartinFowler), but specific deduplication races inferred from distributed systems experience

---

### Pitfall 5: Integration Webhook Reliability Assumptions

**What goes wrong:**
Monitoring systems send alerts via webhook. Your platform assumes webhooks always arrive. But monitoring systems retry failed webhooks, webhooks arrive out of order, webhooks arrive multiple times, or webhooks arrive minutes/hours late due to network issues. Alert state becomes inconsistent.

**Why it happens:**
Teams treat webhook endpoints like synchronous function calls. They don't design for retry/duplicate/reorder scenarios. They assume "if we return 200, the monitoring system won't retry." They don't validate webhook signatures. They process webhooks synchronously, blocking the HTTP request.

**How to avoid:**
- Make webhook endpoints idempotent (use alert fingerprints or deduplication keys)
- Validate webhook signatures (HMAC) to prevent spoofing
- Process webhooks asynchronously (immediately return 200, process in background)
- Handle out-of-order delivery (alert resolved arrives before alert triggered)
- Implement webhook retry logic on YOUR side if monitoring system calls YOUR APIs
- Set timeouts on webhook processing (don't block forever)
- Log all webhook payloads for debugging
- Support webhook payload versioning for backward compatibility

**Warning signs:**
- Webhook endpoints do synchronous processing
- No signature validation on incoming webhooks
- No idempotency keys or deduplication
- No handling of out-of-order webhooks
- Webhook failures crash the endpoint
- No logging of raw webhook payloads
- No timeout on webhook processing

**Phase to address:**
Phase 1 (Foundation) - Integration reliability is core to the system's purpose.

**Source confidence:** HIGH - PagerDuty API breaking changes and synchronization issues documented (GitHub go-pagerduty, Grafana OnCall)

---

### Pitfall 6: No Escalation When Notification Delivery Fails

**What goes wrong:**
Alert is sent to on-call engineer via push notification. Push notification fails silently (app uninstalled, device offline, push token expired). System marks alert as "delivered" even though nobody was notified. Incident goes unhandled until someone manually checks.

**Why it happens:**
Teams don't distinguish between "API call succeeded" and "user received notification." They don't implement escalation policies that trigger when notifications aren't acknowledged. They assume users will notice alerts immediately.

**How to avoid:**
- Track acknowledgment separately from delivery
- Implement escalation timers (if not acknowledged in 5 minutes, escalate)
- Multi-channel escalation (push → SMS → phone call → backup on-call)
- Re-send through different channel if first channel fails delivery
- Alert on unacknowledged high-severity incidents
- Provide "escalate now" button for users
- Test escalation paths regularly (automated tests that verify escalation triggers)

**Warning signs:**
- No acknowledgment tracking, only delivery tracking
- No escalation timers or policies
- Single notification channel per user
- No way to manually trigger escalation
- No monitoring of acknowledgment rates
- Long-open incidents with no acknowledgments

**Phase to address:**
Phase 2 (Core Features) - Escalation is table-stakes for production incident management, but can follow basic delivery.

**Source confidence:** HIGH - Multiple SRE sources emphasize importance of escalation (Google SRE Workbook on-call chapter)

---

### Pitfall 7: Ignoring Alert Fatigue Design

**What goes wrong:**
Platform successfully delivers thousands of alerts per day. Engineers get numb to notifications and start ignoring them. Critical alerts are buried under noise. Pager load exceeds sustainable levels (Google recommends max 2 incidents per shift). Engineers burn out and quit.

**Why it happens:**
Teams focus on alert delivery mechanics without considering alert quality. They treat every alert equally. They don't provide tools for alert analysis, noise reduction, or intelligent routing. They measure success by "alerts delivered" not "incidents resolved quickly."

**How to avoid:**
- Expose alert volume metrics prominently (alerts per day, per service, per severity)
- Implement alert throttling/rate limiting per service
- Support alert priority levels with different notification channels (P1 = phone call, P3 = Slack)
- Provide alert analytics (which services are noisiest, trending volume)
- Allow temporary muting with automatic unmute
- Support "quiet hours" for low-priority alerts
- Show acknowledgment rates (% of alerts acknowledged within SLA)
- Build feedback loop: make it easy to report "this alert was noise"

**Warning signs:**
- No visibility into alert volume trends
- All alerts treated identically regardless of priority
- No rate limiting or throttling mechanisms
- No tools for identifying noisy services
- High alert volume with low acknowledgment rates
- User requests to "turn off notifications"

**Phase to address:**
Phase 3 (Production Readiness) - Important before scaling to full team, but not MVP critical.

**Source confidence:** HIGH - Extensively documented in Google SRE Workbook with specific thresholds and examples

---

### Pitfall 8: Scheduling Algorithm Edge Cases Not Tested

**What goes wrong:**
On-call schedule works fine for simple cases but breaks in edge cases: overlapping shifts, partial coverage (weekdays only), user on vacation during their shift, user leaves company mid-rotation, timezone changes mid-rotation, shift handoff during incident. Wrong person gets paged or nobody gets paged.

**Why it happens:**
Teams implement "happy path" scheduling (weekly rotation, same people, no gaps) without considering real-world complexity. They don't test edge cases systematically. They discover bugs in production during shift transitions.

**How to avoid:**
- Test edge cases explicitly:
  - User on vacation override during regular shift
  - User leaves company mid-rotation (deactivated account)
  - Multiple users on call simultaneously (follow-the-sun coverage)
  - Gaps in schedule (weekend coverage ends, weekday hasn't started)
  - Shift transition during active incident (who owns it?)
  - Schedule deleted/modified during active incident
  - User timezone changes while on call
- Define "who is on call right now" algorithm clearly and test exhaustively
- Show schedule coverage gaps prominently in UI
- Require explicit handoff for active incidents during rotation
- Validate schedule changes don't create gaps
- Support "effective date" for schedule changes (don't apply immediately)

**Warning signs:**
- `getCurrentOnCallUser()` function is complex with many conditionals
- No test cases for edge conditions
- Schedule validation only checks "does shift exist"
- No UI warning for schedule gaps
- No handling of mid-shift user removal
- Incident ownership transfer logic is unclear

**Phase to address:**
Phase 2 (Core Features) - Must be solid before production use with real rotations.

**Source confidence:** MEDIUM - Specific edge cases inferred from scheduling complexity, not directly documented in sources

---

## Moderate Pitfalls

These mistakes cause delays, technical debt, or require significant refactoring.

---

### Pitfall 9: No Alert History and Audit Trail

**What goes wrong:**
Users ask "did I get paged for this incident last night?" System can't answer. Compliance requirements need proof of who was notified when. Debugging delivery failures is impossible without logs. Users distrust the system.

**Why it happens:**
Teams focus on real-time delivery, not record-keeping. They don't design for auditability from the start. They assume "logs are enough" but logs aren't queryable or persistent.

**How to avoid:**
- Store complete audit trail of every alert and notification attempt
- Include: alert created, routed to user, delivery attempted, delivery confirmed, acknowledged, resolved
- Make audit trail queryable via UI (user can see their notification history)
- Retain audit logs for compliance period (1+ years)
- Include metadata: delivery channel, provider used, failure reason, retry attempts
- Expose audit trail via API for external analysis

**Warning signs:**
- No database table for notification history
- Only real-time delivery tracking
- No way to query "what notifications did user X receive yesterday"
- No delivery failure reasons stored
- Audit data stored only in logs

**Phase to address:**
Phase 1 (Foundation) - Easier to build in from start than retrofit later.

---

### Pitfall 10: Synchronous Notification Delivery Blocking Alerting

**What goes wrong:**
Alert arrives, system tries to send push notification, push notification provider is slow/down, HTTP request hangs for 30 seconds, entire alerting pipeline blocks. New alerts pile up. When provider recovers, flood of delayed alerts hit all at once.

**Why it happens:**
Teams implement notification sending synchronously in the alert handling path. They don't use background jobs or queues. They don't set aggressive timeouts.

**How to avoid:**
- Use job queue (Sidekiq, Bull, SQS) for all notification delivery
- Alert handling: create alert → enqueue notification job → return immediately
- Set aggressive timeouts on external API calls (3-5 seconds max)
- Implement circuit breakers for notification providers
- Monitor queue depth (alert if jobs backing up)
- Use separate workers for different notification channels (SMS worker crash doesn't block email)

**Warning signs:**
- Alert API endpoints make synchronous notification API calls
- No job queue or background worker system
- No timeouts on external HTTP calls
- Alert creation latency correlates with notification provider latency
- All notification delivery in single process

**Phase to address:**
Phase 2 (Core Features) - Can start synchronous for MVP, but must async before production scale.

---

### Pitfall 11: Notification Channel Verification Not Required

**What goes wrong:**
User adds phone number for SMS but makes typo. System happily sends alerts to wrong number. Or worse, sends to invalid number and burns money on failed delivery attempts. User doesn't receive alerts and doesn't know why.

**How to avoid:**
- Require verification for all notification channels before activation
- SMS: send verification code, user must confirm
- Phone call: call verification required
- Push: verify device token actually works
- Email: confirmation link
- Show verification status prominently in UI
- Warn when alert would go to unverified channel
- Periodically re-verify channels (tokens expire, numbers change)

**Warning signs:**
- No verification flow for notification channels
- Users can add channels without confirmation
- No "verified" status indicator
- No testing of channel before use

**Phase to address:**
Phase 2 (Core Features) - Important for cost control and reliability, but can follow basic functionality.

---

### Pitfall 12: No Testing of Actual Notification Delivery

**What goes wrong:**
Platform has excellent test coverage for internal logic but never actually tests if SMS gets delivered, push notifications arrive, or emails land in inbox. Production integration breaks and nobody notices until real incident.

**How to avoid:**
- Integration tests that send actual notifications to test accounts
- Scheduled smoke tests (hourly: send test alert through entire pipeline)
- Canary alerts to known-good channels to verify provider health
- Test against multiple providers regularly
- Monitor success rates for each notification channel
- Alert on degraded delivery rates

**Warning signs:**
- Unit tests mock all external notification APIs
- No integration tests with real providers
- No production smoke tests
- No monitoring of actual delivery success
- First discovery of provider issues is user report

**Phase to address:**
Phase 2 (Core Features) - Before production deployment, must verify integrations work.

---

### Pitfall 13: Hard-Coded or Poorly Configurable Alert Routing

**What goes wrong:**
Alert routing rules are hard-coded or require code changes to modify. Team structure changes, on-call rotations reorganize, services move between teams. Each change requires deployment.

**How to avoid:**
- Make alert routing rules data-driven and configurable
- Support routing based on: service, severity, tags, custom attributes
- Allow non-engineers to modify routing rules via UI
- Version routing rules (track changes, rollback capability)
- Validate routing rules before activation
- Show preview of "who would get this alert" for testing

**Warning signs:**
- Routing logic is code in application
- Only engineers can change routing
- No UI for routing configuration
- Routing changes require deployment

**Phase to address:**
Phase 2 (Core Features) - Before expanding beyond pilot team.

---

## Minor Pitfalls

These mistakes cause annoyance but are fixable without major changes.

---

### Pitfall 14: No Rate Limiting on Alert Creation

**What goes wrong:**
Monitoring system misconfigures alert and sends 10,000 identical alerts per second. Database fills up. Alert processing bogs down. Engineers get spammed.

**How to avoid:**
- Rate limit alert creation per service (e.g., 100/minute)
- Rate limit alert creation per integration key
- Aggressive deduplication even under high load
- Circuit breaker that stops accepting alerts from misbehaving source
- Alert on suspiciously high alert rates

**Phase to address:**
Phase 3 (Production Readiness) - Important before scale, but not critical for pilot.

---

### Pitfall 15: Poor Mobile App Push Token Management

**What goes wrong:**
Push tokens expire, get invalidated when user reinstalls app, or become stale. System keeps trying to send to dead tokens. Users don't receive notifications.

**How to avoid:**
- Track push token registration date
- Remove tokens that fail delivery repeatedly
- Support multiple tokens per user (user has multiple devices)
- Require app to refresh token periodically
- Provide UI to see registered devices and remove old ones

**Phase to address:**
Phase 3 (Production Readiness) - Quality of life improvement after basic push works.

---

### Pitfall 16: No Graceful Degradation When Dependencies Down

**What goes wrong:**
Database has temporary issues. Entire alerting platform goes down instead of degrading gracefully.

**How to avoid:**
- Critical path should work even with degraded dependencies
- Cache on-call schedules in memory
- Allow alert creation even if audit log write fails (write to queue instead)
- Show degraded status in UI
- Fallback to simpler notification methods

**Phase to address:**
Phase 3 (Production Readiness) - Resilience feature after core functionality solid.

---

### Pitfall 17: Time Display Ambiguity Causes Confusion

**What goes wrong:**
UI shows "2:00 PM" without timezone. User in India thinks it's 2 PM IST. Schedule actually means 2 PM PST. Wrong expectations about coverage.

**How to avoid:**
- Always show timezone with times (2:00 PM PST or 2:00 PM America/Los_Angeles)
- Show user's local time and optionally UTC
- Use relative times ("starts in 3 hours") alongside absolute times
- Consistent timezone display throughout UI

**Phase to address:**
Phase 1 (Foundation) - Easy to do right from start, hard to fix later.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store schedules in local time | Simpler initial logic | DST bugs, timezone bugs, impossible to fix cleanly | Never - always use UTC |
| Fire-and-forget notification | Faster to build | No delivery guarantees, missing incidents | Never for production system |
| Single notification provider | Simpler integration | Single point of failure | MVP/pilot only |
| Synchronous notification | No queue infrastructure | Blocks alert pipeline, poor performance | MVP/pilot only (add queue by Phase 2) |
| Hard-coded routing rules | No configuration UI needed | Requires deployment to change | MVP only (add UI by Phase 2) |
| No verification for channels | Simpler user flow | Wrong numbers, wasted costs | Never - always verify |
| Mock external APIs in tests | Faster test execution | Doesn't catch integration issues | OK if complemented with integration tests |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Twilio SMS | Assuming 200 status = delivered | Check delivery webhooks/status callbacks for actual delivery |
| Twilio SMS | Not handling rate limits | Implement backoff, monitor rate limit headers, have backup provider |
| Twilio SMS | Using trial account in production | Trial account has verified-number-only restriction - completely unusable |
| FCM Push | Storing single token per user | Users have multiple devices - store multiple tokens |
| FCM Push | Not removing invalid tokens | Failed tokens accumulate, waste resources, bury real issues |
| FCM Push | Not handling token refresh | Tokens expire - app must re-register, server must update |
| Email SMTP | No retry on transient failures | Email delivery can be delayed - implement retry with backoff |
| Webhook integrations | No signature verification | Accept spoofed alerts - always validate HMAC signatures |
| Webhook integrations | Synchronous processing | Slow processing blocks sender's retry - return 200 immediately, process async |
| PagerDuty API | Assuming API is stable | Breaking changes happen (v1.5.0 had breaking changes) - pin versions, test upgrades |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all active incidents in memory | Fast with 10 incidents, slow with 1000 | Paginate incidents, use database queries | ~500+ active incidents |
| Polling for schedule changes | Works with 5 users, hammers DB with 500 | Use pub/sub or webhooks for change notification | ~100 users |
| Sending notifications serially | OK with 1-2 recipients per alert | Send in parallel or use background workers | ~10+ recipients per alert |
| No database indexes on alert queries | Fast with 1K alerts, timeout with 1M | Index on created_at, service_id, status | ~100K alerts |
| Storing full alert history in single table | Works for weeks, slow after months | Partition by time or archive old alerts | ~1M+ alerts |
| No caching of on-call lookups | OK with occasional queries | Cache current on-call for 1-5 minutes | High query volume |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No webhook signature verification | Attackers create fake alerts, spam on-call engineers | Always verify HMAC signatures on incoming webhooks |
| Alert data includes secrets | API keys, passwords in alert descriptions exposed in UI/notifications | Sanitize alert content, redact secrets |
| No rate limiting on alert API | DDoS via alert creation, fill database | Rate limit per API key, per IP |
| Phone numbers not verified | Alert attacker's number instead of engineer | Always require verification code |
| No audit trail of who acknowledged | Can't prove compliance, can't debug "who marked this resolved" | Audit every state change with user ID and timestamp |
| Webhook URLs not validated | SSRF attacks via webhook callbacks | Validate URLs, block private IPs |
| No access controls on schedules | Any engineer can edit any schedule | Role-based permissions on schedule editing |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "test this notification" button | Users don't know if channels work | Provide "send test notification" for every channel |
| No visibility into why alert routed to them | Confusion about unexpected pages | Show routing decision trail ("you got this because: on-call for service X") |
| Can't see upcoming on-call shifts | Surprised by pages, can't plan | Prominent calendar view of upcoming shifts |
| No way to override/swap shifts | Can't handle vacation, life events | Easy shift swapping with approval flow |
| Acknowledge requires multiple clicks | Slows incident response | One-click acknowledge from notification |
| Can't see if others already working incident | Multiple people work same issue | Show "Alice is working on this" status in real-time |
| No mobile-friendly interface | Can't manage incidents from phone | Mobile-first design for incident management |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Push notifications:** Often missing token refresh logic - verify tokens expire and app re-registers
- [ ] **SMS delivery:** Often missing delivery confirmation tracking - verify using webhook callbacks not just API success
- [ ] **On-call schedules:** Often missing timezone handling - verify DST transitions and international users
- [ ] **Alert deduplication:** Often missing race condition handling - verify concurrent alert creation
- [ ] **Webhook endpoints:** Often missing signature verification - verify HMAC validation
- [ ] **Notification delivery:** Often missing retry logic - verify exponential backoff on failures
- [ ] **Schedule coverage:** Often missing gap detection - verify 24/7 coverage validation
- [ ] **Alert routing:** Often missing fallback logic - verify what happens when primary on-call unreachable
- [ ] **Escalation policies:** Often missing actually-tested escalation - verify escalation timer triggers
- [ ] **Integration testing:** Often missing real provider testing - verify actual SMS/push/email delivery

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing timezone handling | HIGH | Database migration to convert all times to UTC + application logic changes |
| Fire-and-forget delivery | MEDIUM | Add delivery tracking table + retry logic + migrate existing data |
| No audit trail | HIGH | Can't backfill historical data - start logging going forward, lose history |
| Synchronous notifications | MEDIUM | Add job queue infrastructure + refactor notification sending |
| Hard-coded routing | LOW | Build routing rules UI + migrate rules to database |
| Single notification provider | MEDIUM | Add provider abstraction + integrate secondary provider |
| No verification flow | LOW | Add verification step + mark existing channels unverified + require verification |
| Deduplication races | MEDIUM | Add database locking + transaction boundaries around deduplication |
| No escalation policies | MEDIUM | Add escalation table + timer infrastructure + configure policies |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| No delivery guarantee | Phase 1 (Foundation) | Audit trail shows retry attempts and final delivery status |
| Single point of failure | Phase 2 (Core Features) | Force-fail primary provider, verify fallback works |
| Timezone/DST bugs | Phase 1 (Foundation) | Test cases for DST transitions in multiple zones pass |
| Alert deduplication races | Phase 2 (Core Features) | Load test with concurrent identical alerts, verify single incident |
| Webhook reliability | Phase 1 (Foundation) | Send duplicate webhooks, out-of-order webhooks, verify handled correctly |
| No escalation | Phase 2 (Core Features) | Don't acknowledge alert, verify escalation triggers in 5 min |
| Alert fatigue design | Phase 3 (Production Readiness) | Alert volume metrics visible, throttling configurable |
| Scheduling edge cases | Phase 2 (Core Features) | Test cases for vacation, deactivation, gaps all pass |
| No audit trail | Phase 1 (Foundation) | Query notification history for user, see complete timeline |
| Synchronous blocking | Phase 2 (Core Features) | Load test shows alert pipeline throughput unaffected by slow notifications |
| No channel verification | Phase 2 (Core Features) | Try to add unverified channel, blocked until verified |
| No delivery testing | Phase 2 (Core Features) | CI runs integration tests that send real notifications |
| Hard-coded routing | Phase 2 (Core Features) | Non-engineer can modify routing via UI |
| No rate limiting | Phase 3 (Production Readiness) | Spam alert API, verify throttling kicks in |
| Poor token management | Phase 3 (Production Readiness) | Tokens that fail repeatedly are removed automatically |
| No graceful degradation | Phase 3 (Production Readiness) | Take down DB briefly, verify alerts still accepted |

---

## Sources

**HIGH confidence sources:**
- Google SRE Workbook - On-Call chapter: On-call load limits, alert fatigue, pager rotation best practices
- Google SRE Book - Managing Incidents: Coordination breakdown patterns, incident command structure
- Increment Magazine - When the Pager Goes Off: Manual processes, alert quality, operational complexity
- GitHub danluu/post-mortems: Real incident patterns showing monitoring failures, detection delays
- PagerDuty go-pagerduty library: Breaking changes, API reliability considerations

**MEDIUM confidence sources:**
- MartinFowler - Idempotent Receiver pattern: Delivery guarantees, duplicate handling
- Grafana OnCall repository: Maintenance status, synchronization issues, dependency constraints
- Twilio trial documentation: SMS reliability limitations

**LOW confidence (inferred from domain knowledge):**
- Timezone/DST edge cases: Standard scheduling system pitfalls, not directly documented in sources
- Specific race condition scenarios: Inferred from distributed systems patterns
- Notification provider failover: SRE best practices, not specific to incident management

---

*Pitfalls research for: OnCall Platform (PagerDuty replacement)*
*Researched: 2026-02-06*
*Primary focus: Mission-critical reliability for 50+ person on-call team*
