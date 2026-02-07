---
phase: 05
plan: 05
subsystem: notification-delivery
tags: [aws-sns, twilio, push-notifications, voice-calls, twiml, ios, android]
requires:
  - 01-04  # Okta auth for user identity
  - 01-07  # User contact verification
  - 04-01  # Incident model for notifications
provides:
  - push-notification-channel
  - voice-call-channel
  - twiml-ivr-templates
affects:
  - 05-06  # Notification orchestration will use these channels
  - 05-08  # Delivery tracking will monitor these channels
tech-stack:
  added:
    - "@aws-sdk/client-sns@^3.0.0"
  patterns:
    - aws-sns-platform-endpoints
    - twilio-voice-ivr
    - platform-specific-push-payloads
key-files:
  created:
    - src/services/notification/channels/push.channel.ts
    - src/services/notification/channels/voice.channel.ts
    - src/services/notification/templates/twiml.templates.ts
    - src/services/notification/types.ts
    - src/services/notification/channels/base.channel.ts
  modified:
    - package.json
    - src/config/env.ts
decisions:
  - "AWS SNS for push notifications via iOS APNs and Android FCM"
  - "iOS critical alerts with interruption-level: critical override DND"
  - "Android high-priority notification channel for critical incidents"
  - "Twilio voice calls with TwiML IVR for interactive acknowledgment"
  - "TTS keypress menu: 1=acknowledge, 2=details, 9=escalate"
metrics:
  duration: 10min
  completed: 2026-02-07
---

# Phase 05 Plan 05: Push and Voice Channels Summary

**One-liner:** Push notifications with platform-specific critical alerts (iOS interruption-level, Android high-priority) and voice calls with TwiML IVR for keypress acknowledgment.

## What Was Built

### Push Notification Channel (AWS SNS)
- **PushChannel class** sends notifications to iOS and Android devices via AWS SNS
- **iOS critical alerts** use `interruption-level: critical` to override Do Not Disturb for CRITICAL/HIGH priority incidents (per user decision)
- **Android high-priority** uses `PRIORITY_MAX` and `critical_alerts` channel for DND override
- **Multi-device support** with error handling - sends to all registered devices, succeeds if any delivery succeeds
- **Platform-specific payloads**:
  - iOS: APNS format with critical sound, badge, relevance-score
  - Android: GCM format with high-priority channel, click action
- **Device token management** via SNS CreatePlatformEndpoint (idempotent)

### Voice Call Channel (Twilio)
- **VoiceChannel class** initiates phone calls with interactive IVR
- **TwiML templates** for text-to-speech with keypress menu (per user decision):
  - Press 1: Acknowledge incident
  - Press 2: Hear full details and alert count
  - Press 9: Escalate to next level
- **Escalation level announcement** in TTS if present
- **Machine detection** to identify voicemail
- **Status callbacks** for delivery tracking (initiated, ringing, answered, completed)
- **TTS sanitization** removes XML special chars and limits length for safety

### Foundation Infrastructure (Deviation)
- **types.ts**: NotificationPayload, ChannelDeliveryResult, NotificationChannel interfaces
- **base.channel.ts**: BaseChannel with error handling wrapper and utility methods
- **env.ts**: Added SNS_PLATFORM_APP_ARN_IOS, SNS_PLATFORM_APP_ARN_ANDROID, API_BASE_URL

## Task Commits

| Task | Description | Commit | Key Changes |
|------|-------------|--------|-------------|
| 1 | Install AWS SNS SDK and add env config | 45b05f5 | package.json, env.ts, types.ts, base.channel.ts |
| 2 | Create push notification channel with critical alerts | cedaf1b | push.channel.ts |
| 3 | Create TwiML templates and voice channel | 2a3cee6 | twiml.templates.ts, voice.channel.ts |

## Success Criteria Verification

- [x] Push notifications override DND for CRITICAL/HIGH priority (per user decision)
- [x] iOS uses critical alerts with interruption-level: critical
- [x] Android uses high-priority notification channel
- [x] Voice calls use TTS with keypress menu (per user decision)
- [x] IVR: Press 1 to acknowledge, Press 2 for details, Press 9 to escalate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created notification types and base channel**
- **Found during:** Task 1
- **Issue:** Plan expected types.ts and base.channel.ts to exist (from plan 05-01), but they didn't. This blocked execution of tasks 2 and 3 which import these files.
- **Fix:** Created minimal types.ts with NotificationPayload, ChannelDeliveryResult, NotificationChannel interfaces. Created base.channel.ts with BaseChannel abstract class and error handling wrapper.
- **Files created:** src/services/notification/types.ts, src/services/notification/channels/base.channel.ts
- **Commit:** 45b05f5 (included in Task 1 commit)

## Implementation Details

### Push Notification DND Override Strategy

**iOS (APNS payload):**
```typescript
sound: isCritical ? {
  critical: 1,                    // Critical alert flag
  name: 'critical-alert.wav',
  volume: 1.0
} : 'default',
'interruption-level': isCritical ? 'critical' : 'active',
'relevance-score': isCritical ? 1.0 : 0.5
```

**Android (GCM payload):**
```typescript
channel_id: isCritical ? 'critical_alerts' : 'default',
priority: isCritical ? 'high' : 'default',
android: {
  priority: isCritical ? 'high' : 'normal',
  notification: {
    notification_priority: isCritical ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT'
  }
}
```

### Voice IVR Flow

1. **Initial call** → TwiML plays escalation level + incident summary → Gather input
2. **Press 1** → Acknowledge → "Incident acknowledged. Thank you." → Hangup
3. **Press 2** → Details → Play full body + alert count → Gather input (loops back)
4. **Press 9** → Escalate → "Escalating to next level." → Hangup
5. **No input/invalid** → "Invalid input. Goodbye." → Hangup

### TTS Sanitization

TwiML text sanitization prevents TTS errors:
- Remove XML special chars: `<`, `>`, `&`, `'`, `"`
- Replace separators with spaces: `_`, `-`, `.`
- Collapse whitespace
- Limit to 500 characters

## Integration Points

### Push Channel Requirements
- **UserDevice table** must have `platform` (ios/android) and `deviceToken` columns
- **AWS SNS Platform Applications** must be configured for iOS (APNs) and Android (FCM)
- **Env vars:** SNS_PLATFORM_APP_ARN_IOS, SNS_PLATFORM_APP_ARN_ANDROID

### Voice Channel Requirements
- **User.phone** and **User.phoneVerified** must be set
- **Twilio account** configured with voice-capable number
- **Webhook endpoints** needed:
  - GET /webhooks/twilio/voice/incident/:id → Returns TwiML
  - POST /webhooks/twilio/voice/incident/:id/input → Handles keypress
  - POST /webhooks/twilio/voice/status → Tracks call status
- **Env vars:** TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, API_BASE_URL

## Next Phase Readiness

### Ready for:
- **05-06 (Notification Orchestration):** Push and voice channels can be invoked by orchestration layer
- **05-08 (Delivery Tracking):** Channels return providerId for async tracking

### Blockers for future work:
- **Webhook handlers needed:** Voice channel expects TwiML webhooks to exist (05-06 or 05-07)
- **Device registration needed:** Push channel requires mobile app to register device tokens
- **AWS SNS setup required:** Platform Applications must be created in AWS Console before push works

### Technical debt:
- None

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| AWS SNS for push notifications | Native support for iOS APNs and Android FCM, handles token management | Requires AWS account, SNS Platform Apps |
| iOS critical alerts use interruption-level: critical | Per user decision - override DND for critical incidents | Requires user permission on iOS |
| Android high-priority notification channel | Per user decision - DND override via PRIORITY_MAX | App must create critical_alerts channel |
| Twilio voice calls with TwiML | Per user decision - interactive IVR with keypress menu | Requires webhook endpoints |
| TTS keypress menu (1/2/9) | Per user decision - simple numeric menu familiar to on-call users | Requires webhook to handle input |
| Machine detection enabled | Identify voicemail vs human answer for delivery tracking | May add latency to call connection |
| TTS sanitization | Prevent XML injection and TTS parsing errors | Limits special characters in incident messages |

## Self-Check: PASSED

All files and commits verified:
- Created: push.channel.ts, voice.channel.ts, twiml.templates.ts, types.ts, base.channel.ts
- Commits: 45b05f5, cedaf1b, 2a3cee6
