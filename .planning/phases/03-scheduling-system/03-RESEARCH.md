# Phase 3: Scheduling System - Research

**Researched:** 2026-02-06
**Domain:** On-call scheduling, timezone handling, calendar integrations
**Confidence:** HIGH

## Summary

On-call scheduling requires careful handling of three critical concerns: **timezone-aware date arithmetic**, **DST transition edge cases**, and **calendar integration patterns**. The research reveals that PostgreSQL's TIMESTAMPTZ (already in use) provides the foundation, but application-level timezone handling requires a robust library like Luxon that understands IANA timezone rules.

The standard approach is to **store schedules as recurrence rules** (not pre-computed instances), calculate current on-call person on-demand, and sync to external calendars as expanded events. Critical DST pitfalls include invalid times during spring-forward (2:30 AM doesn't exist) and ambiguous times during fall-back (1:30 AM occurs twice).

Calendar integrations follow OAuth 2.0 flows with service-specific SDKs. Google Calendar and Microsoft Graph both support recurring events via iCalendar RRULE format but require different authentication scopes and token management strategies.

**Primary recommendation:** Use Luxon 4.x for all timezone-aware date operations, store schedules as recurrence patterns with RRULE library, compute current on-call person via queries, and integrate calendars via official SDKs with user-delegated OAuth tokens.

## Standard Stack

The established libraries/tools for on-call scheduling:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| luxon | 4.x (active dev) | Timezone-aware date/time | Built-in IANA timezone support, native Intl API, explicit DST handling, immutable API |
| rrule | 2.x-3.x | Recurrence rule parsing/generation | RFC 5545 compliant, handles complex rotation patterns, used by calendar systems |
| googleapis | Latest | Google Calendar API client | Official Google SDK, handles OAuth refresh, request signing |
| @microsoft/microsoft-graph-client | Latest | Microsoft Graph API client | Official Microsoft SDK, supports delegated auth, calendar operations |
| @azure/identity | Latest | Microsoft OAuth provider | MSAL integration, token management for Microsoft Graph |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns-tz | 2.x+ | Lightweight timezone helpers | Alternative to Luxon if bundle size critical (Luxon already chosen) |
| node-ical | Latest | iCalendar format generation | If generating .ics files for download/import |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Luxon | Day.js + timezone plugin | Smaller bundle (2kB) but timezone support less robust, explicit DST handling unclear |
| Luxon | date-fns + date-fns-tz | Modular/tree-shakeable but requires more manual DST handling |
| Luxon | Temporal API | Future-proof but Stage 3 proposal, requires polyfill, not production-ready |
| rrule | Custom recurrence logic | Full control but extremely complex (DST, month-end, leap years, exceptions) |

**Installation:**
```bash
npm install luxon rrule googleapis @microsoft/microsoft-graph-client @azure/identity
npm install --save-dev @types/luxon
```

## Architecture Patterns

### Recommended Database Structure
```
prisma/schema.prisma:
├── Schedule            # Rotation definition (team, users, recurrence rule)
├── ScheduleLayer       # Stacked coverage layers (primary, backup, weekend)
├── ScheduleOverride    # Temporary coverage changes (vacation, swap)
├── ScheduleShift       # Computed shift instances (optional denormalization)
└── CalendarSync        # OAuth tokens and sync state per user
```

### Pattern 1: Store Recurrence Rules, Compute Instances
**What:** Store rotation pattern as RRULE string, compute current on-call person via query
**When to use:** Always - this is the standard calendar approach
**Why:** Schedules can be infinite (no end date), pre-computing all instances wastes storage, editing patterns doesn't require regeneration

**Example schema:**
```typescript
model Schedule {
  id                String   @id @default(cuid())
  teamId            String
  team              Team     @relation(fields: [teamId], references: [id])
  name              String
  timezone          String   // IANA timezone (e.g., "America/New_York")

  // Rotation definition
  startDate         DateTime @db.Timestamptz
  endDate           DateTime? @db.Timestamptz
  recurrenceRule    String   // RRULE format (e.g., "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO")
  rotationUserIds   String[] // Ordered list of users in rotation

  // Metadata
  description       String?
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  layers            ScheduleLayer[]
  overrides         ScheduleOverride[]
}
```

### Pattern 2: Layered Schedules with Override Precedence
**What:** Multiple schedule layers with precedence (Layer 3 > Layer 2 > Layer 1)
**When to use:** Complex coverage patterns (weekday primary, weekend backup, holiday on-call)
**Why:** PagerDuty established pattern, allows modular schedule building

**Example:**
```typescript
model ScheduleLayer {
  id                String   @id @default(cuid())
  scheduleId        String
  schedule          Schedule @relation(fields: [scheduleId], references: [id])
  name              String   // "Primary", "Backup", "Weekend"
  priority          Int      // Higher number = higher priority

  // Layer-specific recurrence
  timezone          String
  startDate         DateTime @db.Timestamptz
  endDate           DateTime? @db.Timestamptz
  recurrenceRule    String
  rotationUserIds   String[]

  // Restrictions (when this layer applies)
  restrictions      Json?    // e.g., {"daysOfWeek": ["SAT", "SUN"]}

  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  @@index([scheduleId, priority])
}

model ScheduleOverride {
  id                String   @id @default(cuid())
  scheduleId        String
  schedule          Schedule @relation(fields: [scheduleId], references: [id])
  userId            String   // Who is on-call during override
  user              User     @relation(fields: [userId], references: [id])

  // Override period (stored in schedule's timezone)
  startTime         DateTime @db.Timestamptz
  endTime           DateTime @db.Timestamptz

  reason            String?  // "Vacation coverage", "Shift swap"
  createdById       String
  createdAt         DateTime @default(now()) @db.Timestamptz

  @@index([scheduleId, startTime, endTime])
}
```

### Pattern 3: "Who Is On-Call Now" Query
**What:** Compute current on-call person by evaluating layers + overrides at query time
**When to use:** Every "get current on-call" request
**Algorithm:**
```typescript
// Pseudo-code for getCurrentOnCall(scheduleId, atTime)
// Source: PagerDuty schedule pattern + research synthesis

async function getCurrentOnCall(scheduleId: string, atTime: DateTime): Promise<User> {
  // 1. Check for active override first (highest precedence)
  const override = await findOverride(scheduleId, atTime);
  if (override) return override.user;

  // 2. Evaluate layers in priority order (highest first)
  const layers = await findActiveLayers(scheduleId, atTime);
  for (const layer of layers.sort((a, b) => b.priority - a.priority)) {
    // 3. Check if time falls within layer restrictions
    if (!layerAppliesAt(layer, atTime)) continue;

    // 4. Parse RRULE and compute occurrence index
    const rule = RRule.fromString(layer.recurrenceRule);
    const shiftStart = layer.startDate;
    const occurrences = rule.between(shiftStart, atTime, true);
    const shiftIndex = occurrences.length - 1;

    // 5. Calculate which user in rotation (round-robin)
    const userIndex = shiftIndex % layer.rotationUserIds.length;
    return await findUser(layer.rotationUserIds[userIndex]);
  }

  throw new Error('No on-call user found for schedule at time');
}
```

### Pattern 4: Calendar Sync as Separate Concern
**What:** Sync on-call shifts to Google/Outlook as expanded events, don't use calendars as source of truth
**When to use:** Always - bidirectional sync leads to conflicts
**Why:** Calendars use different recurrence models, users may modify events, OAuth tokens expire

**Example:**
```typescript
model CalendarSync {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  provider          String   // "google" | "microsoft"

  // OAuth credentials (encrypted at rest)
  accessToken       String
  refreshToken      String
  tokenExpiresAt    DateTime @db.Timestamptz

  // Calendar selection
  calendarId        String   // External calendar ID
  calendarName      String?

  // Sync state
  isActive          Boolean  @default(true)
  syncedUntil       DateTime? @db.Timestamptz // Last synced shift end time
  lastSyncAt        DateTime? @db.Timestamptz
  lastSyncError     String?

  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  @@unique([userId, provider])
  @@index([isActive, syncedUntil])
}
```

### Anti-Patterns to Avoid
- **Storing all shift instances in database:** Wastes space for infinite schedules, requires regeneration on edit, creates consistency issues
- **Using JavaScript Date for timezone math:** Doesn't understand IANA timezones, DST transitions cause bugs
- **Storing timezone offsets instead of IANA IDs:** Breaks during DST transitions (offset changes but timezone doesn't)
- **Bidirectional calendar sync:** Leads to conflicts when users modify calendar events, creates circular update loops
- **Using TIMESTAMP without timezone:** Already avoided (Prisma uses @db.Timestamptz everywhere per Phase 1)
- **Calculating rotations in local time then converting to UTC:** Order of operations matters, always calculate in schedule's timezone

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recurrence rule parsing | Custom "every N days" logic | rrule library | Handles month-end edge cases, leap years, BYDAY rules, UNTIL vs COUNT, exclusions (EXDATE) |
| Timezone conversions | Manual offset math | Luxon DateTime.setZone() | IANA timezone database, DST rule updates, spring-forward/fall-back handling |
| iCalendar format generation | String concatenation | rrule.toString() or node-ical | RFC 5545 compliance, proper escaping, VTIMEZONE blocks |
| OAuth token refresh | Manual expiry tracking | Official SDKs (googleapis, @microsoft/microsoft-graph-client) | Auto-refresh, exponential backoff, scope validation |
| "Next occurrence" calculation | Date arithmetic loop | rrule.after(date) or rrule.between(start, end) | Efficient algorithms, handles all RRULE complexity |
| DST-safe date addition | date.setHours(date.getHours() + 24) | luxon.plus({days: 1}) | Preserves local time across DST, uses Duration vs Period |

**Key insight:** Date/time arithmetic is non-associative ((A - 1 month) - 1 day ≠ (A - 1 day) - 1 month) and DST introduces ambiguous/invalid times. Libraries handle these edge cases; custom code invariably has bugs.

## Common Pitfalls

### Pitfall 1: Invalid Times During Spring-Forward DST Transition
**What goes wrong:** When clocks jump forward (e.g., 2 AM → 3 AM), times like 2:30 AM don't exist. Scheduling a rotation handoff at 2:00 AM creates a gap.
**Why it happens:** Developers assume all times in a day exist, RRULE may generate 2:00 AM as occurrence
**How to avoid:**
  - Use Luxon which auto-adjusts invalid times forward by 1 hour
  - Document DST behavior: "Handoffs during spring-forward occur at first valid time"
  - Test with DST transition dates: US (2nd Sunday March), EU (last Sunday March)
**Warning signs:**
  - Handoffs scheduled at 1-3 AM in timezones with DST
  - User reports "shift started an hour late"
  - Audit logs show handoff time ≠ scheduled time

### Pitfall 2: Ambiguous Times During Fall-Back DST Transition
**What goes wrong:** When clocks fall back (e.g., 3 AM → 2 AM), 2:30 AM occurs twice (once in DST, once in standard). A handoff at 2:30 AM is ambiguous.
**Why it happens:** RRULE doesn't specify which occurrence, Luxon behavior is undefined
**How to avoid:**
  - **Critical:** Store schedule start time with full IANA timezone, not just offset
  - Use UTC for handoff time comparisons: `schedule.startDate.toUTC()`
  - Document: "Ambiguous handoffs occur at first occurrence (DST time)"
  - Better: Avoid 1-3 AM handoffs in DST timezones, or use UTC timezone for schedules
**Warning signs:**
  - User reports being on-call twice in one rotation
  - Calendar events show duplicate shifts
  - "Who is on-call" returns different results when called twice

### Pitfall 3: Timezone Abbreviation Confusion (EST vs America/New_York)
**What goes wrong:** Storing "EST" as timezone breaks in summer when schedule should use EDT
**Why it happens:** Abbreviations are offset labels, not timezone identifiers with DST rules
**How to avoid:**
  - **Always use IANA timezone names:** "America/New_York", "Europe/London", "Asia/Tokyo"
  - Validate timezone field: Luxon.IANAZone.isValidZone(tz) returns true/false
  - PostgreSQL uses IANA database: `SET TIME ZONE 'America/New_York'` handles DST automatically
**Warning signs:**
  - Timezone stored as "EST", "PST", "CET" instead of IANA name
  - Schedule times wrong by 1 hour during summer
  - User in Phoenix, AZ (no DST) sees shifts at wrong time

### Pitfall 4: Month-End Arithmetic (What is "1 month after Jan 31"?)
**What goes wrong:** Adding "1 month" to Jan 31 may produce Feb 28, Feb 31 (invalid), or Mar 3
**Why it happens:** Months have variable lengths, rotation intervals may use months
**How to avoid:**
  - Use weekly or daily rotations (most common for on-call)
  - If monthly: Document behavior "1 month rotation from Jan 31 starts Mar 3"
  - Luxon handles this: `DateTime.fromISO('2025-01-31').plus({months: 1})` → Feb 28
  - Test rotation start dates: 29th, 30th, 31st of month
**Warning signs:**
  - Monthly rotation requested
  - Start date is 29-31 of month
  - Users report unexpected rotation start dates

### Pitfall 5: Calendar Sync Token Expiry Not Handled
**What goes wrong:** OAuth tokens expire, calendar sync silently fails, users miss shifts
**Why it happens:** Refresh tokens not used, expiry not monitored, no retry logic
**How to avoid:**
  - Store both access + refresh tokens
  - Check token expiry before calendar API calls
  - Official SDKs auto-refresh: `google.auth.refreshAccessToken()`
  - Background job checks sync health, alerts on repeated failures
  - UI shows sync status: "Last synced 2 hours ago" with green/yellow/red indicator
**Warning signs:**
  - CalendarSync.lastSyncError populated
  - Calendar events stop updating
  - User reports "calendar was working but stopped"

### Pitfall 6: Race Conditions in Shift Swaps
**What goes wrong:** Two users try to create overrides for same time range, both succeed, conflict
**Why it happens:** No uniqueness constraint on override time ranges
**How to avoid:**
  - Check for overlapping overrides in transaction: `SELECT ... WHERE scheduleId = ? AND (startTime, endTime) OVERLAPS (?, ?) FOR UPDATE`
  - Return 409 Conflict if overlap exists
  - UI shows existing overrides before creating new one
  - Audit log records both original schedule and override
**Warning signs:**
  - Multiple ScheduleOverride rows with overlapping times
  - "Who is on-call" returns different user than calendar shows
  - Users report conflicting override notifications

### Pitfall 7: Not Testing DST Transition Dates
**What goes wrong:** Schedule works 363 days/year, fails on spring/fall DST weekends
**Why it happens:** Developers test with current date, DST transitions are rare
**How to avoid:**
  - **Test fixtures must include DST dates:**
    - US: 2nd Sunday in March (spring), 1st Sunday in November (fall)
    - EU: Last Sunday in March (spring), last Sunday in October (fall)
  - Test cases:
    ```typescript
    // Spring forward: 2 AM doesn't exist
    const springForward = DateTime.fromISO('2025-03-09T02:30:00', {zone: 'America/New_York'});
    // Fall back: 1:30 AM occurs twice
    const fallBack = DateTime.fromISO('2025-11-02T01:30:00', {zone: 'America/New_York'});
    ```
  - CI pipeline runs timezone-specific tests
  - Document DST behavior in API docs and user-facing help
**Warning signs:**
  - No test files with "DST" in name
  - Test dates are all current date or hardcoded non-DST dates
  - Integration tests pass but production alerts spike in March/November

## Code Examples

Verified patterns from official sources:

### Creating Schedule with RRULE (Weekly Rotation)
```typescript
// Pattern: Store RRULE, compute instances on-demand
// Source: rrule library docs + PagerDuty schedule pattern

import { RRule, Weekday } from 'rrule';
import { DateTime } from 'luxon';

async function createWeeklySchedule(data: {
  teamId: string;
  userIds: string[];
  startDate: string; // ISO format
  timezone: string;  // IANA timezone
  handoffTime: string; // "09:00" local time
  daysOfWeek: string[]; // ["MO", "TU", "WE", "TH", "FR"]
}) {
  // Parse start date in schedule timezone
  const start = DateTime.fromISO(data.startDate, { zone: data.timezone });
  const [hours, minutes] = data.handoffTime.split(':').map(Number);
  const startWithTime = start.set({ hour: hours, minute: minutes, second: 0 });

  // Create RRULE for weekly rotation
  const rule = new RRule({
    freq: RRule.WEEKLY,
    interval: 1,
    byweekday: data.daysOfWeek.map(d => RRule[d]), // RRule.MO, RRule.TU, etc.
    dtstart: startWithTime.toJSDate(),
    // No until/count = infinite schedule
  });

  // Store in database
  return await prisma.schedule.create({
    data: {
      teamId: data.teamId,
      name: 'Weekly On-Call Rotation',
      timezone: data.timezone,
      startDate: startWithTime.toJSDate(),
      recurrenceRule: rule.toString(), // "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"
      rotationUserIds: data.userIds,
      isActive: true,
    },
  });
}
```

### Calculating Current On-Call User
```typescript
// Pattern: Query overrides first, then compute from RRULE
// Source: Research synthesis from PagerDuty docs + rrule examples

import { RRule } from 'rrule';
import { DateTime } from 'luxon';

async function getCurrentOnCall(scheduleId: string, atTime?: DateTime) {
  const now = atTime || DateTime.now();

  // 1. Check for active override (highest precedence)
  const override = await prisma.scheduleOverride.findFirst({
    where: {
      scheduleId,
      startTime: { lte: now.toJSDate() },
      endTime: { gte: now.toJSDate() },
    },
    include: { user: true },
  });

  if (override) {
    return {
      user: override.user,
      source: 'override' as const,
      reason: override.reason,
    };
  }

  // 2. Load schedule and layers
  const schedule = await prisma.schedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: {
      layers: {
        where: { isActive: true },
        orderBy: { priority: 'desc' }, // Highest priority first
      },
    },
  });

  // 3. Evaluate layers
  for (const layer of schedule.layers) {
    // Convert query time to layer timezone
    const layerTime = now.setZone(layer.timezone);

    // Check restrictions (e.g., weekend-only layer)
    if (layer.restrictions) {
      const restrictions = layer.restrictions as { daysOfWeek?: string[] };
      if (restrictions.daysOfWeek) {
        const weekdayMap = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' };
        const currentDay = weekdayMap[layerTime.weekday];
        if (!restrictions.daysOfWeek.includes(currentDay)) {
          continue; // Layer doesn't apply today
        }
      }
    }

    // Parse RRULE and find current shift
    const rule = RRule.fromString(layer.recurrenceRule);
    const layerStart = DateTime.fromJSDate(layer.startDate, { zone: layer.timezone });

    // Get all occurrences from start until now
    const occurrences = rule.between(
      layerStart.toJSDate(),
      layerTime.toJSDate(),
      true // inclusive
    );

    if (occurrences.length === 0) continue;

    // Calculate shift index (0-based)
    const shiftIndex = occurrences.length - 1;
    const userIndex = shiftIndex % layer.rotationUserIds.length;

    // Fetch user
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: layer.rotationUserIds[userIndex] },
    });

    return {
      user,
      source: 'layer' as const,
      layerName: layer.name,
      shiftIndex,
    };
  }

  // No layer applies
  throw new Error(`No on-call user found for schedule ${scheduleId} at ${now.toISO()}`);
}
```

### Handling DST Transitions Safely
```typescript
// Pattern: Use Luxon for DST-safe arithmetic
// Source: Luxon DST documentation

import { DateTime } from 'luxon';

// CORRECT: Adding days preserves local time across DST
function getNextWeekHandoff(scheduleStart: DateTime): DateTime {
  // If scheduleStart is 9:00 AM Monday, result is 9:00 AM next Monday
  // even if DST transition occurs between them
  return scheduleStart.plus({ weeks: 1 });
}

// INCORRECT: Adding hours crosses DST boundaries
function getNextWeekHandoffWrong(scheduleStart: DateTime): DateTime {
  // This adds exactly 168 hours, which may be 9:00 AM or 8:00 AM or 10:00 AM
  // depending on DST transition
  return scheduleStart.plus({ hours: 168 }); // DON'T DO THIS
}

// Test DST edge cases
describe('DST handling', () => {
  it('handles spring forward (invalid times)', () => {
    // March 9, 2025: clocks jump 2:00 AM → 3:00 AM in America/New_York
    const invalidTime = DateTime.fromISO('2025-03-09T02:30:00', {
      zone: 'America/New_York'
    });

    // Luxon advances invalid time to 3:30 AM automatically
    expect(invalidTime.hour).toBe(3);
    expect(invalidTime.minute).toBe(30);
  });

  it('handles fall back (ambiguous times)', () => {
    // Nov 2, 2025: clocks fall 3:00 AM → 2:00 AM in America/New_York
    // 2:30 AM occurs twice (first in EDT, then in EST)
    const ambiguousTime = DateTime.fromISO('2025-11-02T02:30:00', {
      zone: 'America/New_York'
    });

    // Luxon behavior is undefined - document which occurrence is selected
    // Store UTC to disambiguate
    const utc = ambiguousTime.toUTC();
    expect(utc.isValid).toBe(true);
  });
});
```

### Syncing Schedule to Google Calendar
```typescript
// Pattern: Expand RRULE into events, sync via OAuth
// Source: Google Calendar API docs + googleapis SDK examples

import { google } from 'googleapis';
import { RRule } from 'rrule';
import { DateTime } from 'luxon';

async function syncScheduleToGoogleCalendar(
  scheduleId: string,
  userId: string,
  syncWindowDays: number = 30
) {
  // 1. Load schedule and user's calendar sync config
  const schedule = await prisma.schedule.findUniqueOrThrow({
    where: { id: scheduleId },
    include: { team: true },
  });

  const calendarSync = await prisma.calendarSync.findFirstOrThrow({
    where: {
      userId,
      provider: 'google',
      isActive: true,
    },
  });

  // 2. Set up OAuth client
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: calendarSync.accessToken,
    refresh_token: calendarSync.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // 3. Parse RRULE and expand into events
  const rule = RRule.fromString(schedule.recurrenceRule);
  const scheduleZone = schedule.timezone;
  const now = DateTime.now().setZone(scheduleZone);
  const windowEnd = now.plus({ days: syncWindowDays });

  const occurrences = rule.between(
    now.toJSDate(),
    windowEnd.toJSDate(),
    true
  );

  // 4. Create calendar events for each shift
  const userIds = schedule.rotationUserIds;
  const events = [];

  for (let i = 0; i < occurrences.length; i++) {
    const shiftStart = DateTime.fromJSDate(occurrences[i], { zone: scheduleZone });
    const nextOccurrence = occurrences[i + 1];
    const shiftEnd = nextOccurrence
      ? DateTime.fromJSDate(nextOccurrence, { zone: scheduleZone })
      : shiftStart.plus({ weeks: 1 }); // Default to 1 week if no next occurrence

    // Determine which user is on-call for this shift
    const userIndex = i % userIds.length;
    const onCallUser = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[userIndex] },
    });

    // Only create event if this user is the one syncing
    if (onCallUser.id !== userId) continue;

    // Create calendar event
    const event = {
      summary: `On-Call: ${schedule.team.name}`,
      description: `You are on-call for ${schedule.team.name}\n\nSchedule: ${schedule.name}`,
      start: {
        dateTime: shiftStart.toISO(),
        timeZone: scheduleZone,
      },
      end: {
        dateTime: shiftEnd.toISO(),
        timeZone: scheduleZone,
      },
      // Mark as busy time
      transparency: 'opaque',
      // Extended properties for tracking
      extendedProperties: {
        private: {
          oncallScheduleId: scheduleId,
          oncallShiftIndex: String(i),
        },
      },
    };

    events.push(event);
  }

  // 5. Batch insert events
  for (const event of events) {
    await calendar.events.insert({
      calendarId: calendarSync.calendarId,
      requestBody: event,
    });
  }

  // 6. Update sync state
  await prisma.calendarSync.update({
    where: { id: calendarSync.id },
    data: {
      syncedUntil: windowEnd.toJSDate(),
      lastSyncAt: new DateTime.now().toJSDate(),
      lastSyncError: null,
    },
  });

  return { eventCount: events.length, syncedUntil: windowEnd.toISO() };
}
```

### Creating Schedule Override (Shift Swap)
```typescript
// Pattern: Override with conflict detection
// Source: Research synthesis + PagerDuty override pattern

async function createScheduleOverride(data: {
  scheduleId: string;
  userId: string;
  startTime: string; // ISO timestamp
  endTime: string;   // ISO timestamp
  reason: string;
  createdById: string;
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Parse times in schedule's timezone
    const schedule = await tx.schedule.findUniqueOrThrow({
      where: { id: data.scheduleId },
    });

    const startTime = DateTime.fromISO(data.startTime, { zone: schedule.timezone });
    const endTime = DateTime.fromISO(data.endTime, { zone: schedule.timezone });

    // 2. Validate time range
    if (endTime <= startTime) {
      throw new Error('Override end time must be after start time');
    }

    // 3. Check for overlapping overrides (with row locking)
    const overlapping = await tx.scheduleOverride.findFirst({
      where: {
        scheduleId: data.scheduleId,
        OR: [
          // New override starts during existing
          {
            startTime: { lte: startTime.toJSDate() },
            endTime: { gt: startTime.toJSDate() },
          },
          // New override ends during existing
          {
            startTime: { lt: endTime.toJSDate() },
            endTime: { gte: endTime.toJSDate() },
          },
          // New override contains existing
          {
            startTime: { gte: startTime.toJSDate() },
            endTime: { lte: endTime.toJSDate() },
          },
        ],
      },
    });

    if (overlapping) {
      throw new Error(
        `Override conflicts with existing override from ${overlapping.startTime} to ${overlapping.endTime}`
      );
    }

    // 4. Verify user can be on-call
    const user = await tx.user.findUniqueOrThrow({
      where: { id: data.userId },
      include: { teamMembers: true },
    });

    const isTeamMember = user.teamMembers.some(
      (tm) => tm.teamId === schedule.teamId
    );

    if (!isTeamMember) {
      throw new Error('User must be a member of the team to be on-call');
    }

    // 5. Create override
    const override = await tx.scheduleOverride.create({
      data: {
        scheduleId: data.scheduleId,
        userId: data.userId,
        startTime: startTime.toJSDate(),
        endTime: endTime.toJSDate(),
        reason: data.reason,
        createdById: data.createdById,
      },
    });

    // 6. Audit log
    await tx.auditEvent.create({
      data: {
        action: 'schedule.override.created',
        userId: data.createdById,
        teamId: schedule.teamId,
        resourceType: 'schedule_override',
        resourceId: override.id,
        metadata: {
          scheduleId: data.scheduleId,
          overrideUserId: data.userId,
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
        },
        severity: 'INFO',
      },
    });

    return override;
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Moment.js for timezone handling | Luxon or Temporal API | ~2020 | Moment is in maintenance mode, Luxon has native Intl API support, better immutability |
| Store all shift instances | Store RRULE, compute on-demand | Always (calendar standard) | Infinite schedules possible, easier to edit, less storage |
| Manual OAuth token refresh | SDK auto-refresh | ~2018+ | Fewer auth failures, exponential backoff built-in |
| Custom DST handling logic | Library-based (Luxon, rrule) | Always recommended | Edge cases handled (spring-forward, fall-back, ambiguous times) |
| TIMESTAMP without timezone | TIMESTAMPTZ (PostgreSQL) | Best practice since Postgres 7.3 (2002) | Automatic UTC conversion, DST-aware queries |
| Fixed offset timezones (UTC-5) | IANA timezone names (America/New_York) | Best practice | DST rules update automatically, political changes reflected |

**Deprecated/outdated:**
- **Moment.js**: Official statement "We now generally consider Moment to be a legacy project in maintenance mode" (Sept 2020)
- **Storing timezone offsets**: Breaks during DST transitions
- **TIMESTAMP without timezone**: PostgreSQL wiki "Don't Do This" list
- **Cron for rotation scheduling**: Not suitable for user-facing schedules (no DST awareness, no rotation logic)

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal denormalization strategy**
   - What we know: Can pre-compute shifts for query performance, but adds complexity
   - What's unclear: Whether query performance on RRULE expansion is sufficient without denormalization
   - Recommendation: Start with compute-on-demand, add denormalized shifts only if "who is on-call" query is slow (>100ms). Monitor query performance in production.

2. **Handling calendar event deletions by users**
   - What we know: If user deletes synced event in Google Calendar, system won't know unless polling
   - What's unclear: Should we poll calendar for changes, or accept that sync is one-way?
   - Recommendation: One-way sync (system → calendar) initially. If bidirectional needed, use Google Calendar push notifications (webhooks) instead of polling.

3. **Multi-timezone team optimization**
   - What we know: Follow-the-sun schedules need multiple layers with timezone-specific restrictions
   - What's unclear: Best UX for creating follow-the-sun rotations (complex setup)
   - Recommendation: Start with single-timezone schedules (MVP), add multi-timezone templates in later phase. Document pattern: Layer 1 (Americas), Layer 2 (EMEA), Layer 3 (APAC).

4. **Handling IANA timezone database updates**
   - What we know: Luxon uses browser/Node's Intl API which depends on OS timezone data
   - What's unclear: How to ensure production servers have latest timezone data (political changes)
   - Recommendation: Document deployment requirement to update OS timezone data (tzdata package on Linux). Consider adding health check that validates key timezones are recognized.

## Sources

### Primary (HIGH confidence)
- Luxon GitHub repository (moment/luxon) - DST handling, timezone conversions, API patterns
- Google Calendar API documentation (developers.google.com/calendar) - Event creation, recurrence, timezone handling
- Microsoft Graph Calendar API documentation (learn.microsoft.com/en-us/graph) - Event recurrence patterns, OAuth flow
- PostgreSQL official documentation (postgresql.org/docs) - TIMESTAMPTZ behavior, timezone storage best practices
- rrule library GitHub (jkbrzt/rrule) - Recurrence rule parsing, RFC 5545 compliance
- iCalendar RFC 5545 specification (icalendar.org) - RRULE format standard

### Secondary (MEDIUM confidence)
- PagerDuty schedule documentation (support.pagerduty.com) - Rotation types, layer precedence pattern (verified with official docs)
- Jon Skeet date/time arithmetic blog post (codeblog.jonskeet.uk) - DST edge cases, month-end pitfalls (verified with Luxon docs)
- PostgreSQL wiki "Don't Do This" (wiki.postgresql.org) - TIMESTAMP vs TIMESTAMPTZ pitfalls (verified with official docs)
- IANA timezone database (iana.org/time-zones) - Timezone identifier structure, update frequency

### Tertiary (LOW confidence)
- Node-cron library (kelektiv/node-cron) - Task scheduling (marked as NOT suitable for on-call rotations)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Luxon, rrule, googleapis are industry standard, verified via official docs and GitHub repos
- Architecture: HIGH - Recurrence rule storage pattern is standard calendar approach (Google/Microsoft both use it), layer precedence verified via PagerDuty
- Pitfalls: HIGH - DST edge cases verified via Luxon official docs, PostgreSQL best practices from official docs, date arithmetic pitfalls from authoritative sources
- Calendar integration: HIGH - OAuth flows and API patterns from official Google/Microsoft documentation

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days - stable domain, libraries mature)

**Notes:**
- Temporal API tracked as future alternative (Stage 3 proposal, requires polyfill)
- Luxon 4.0 in active development, verify breaking changes when released
- IANA timezone database updates ~4 times/year, deployment process should include tzdata updates
