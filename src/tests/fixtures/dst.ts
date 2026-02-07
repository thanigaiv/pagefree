import { DateTime } from 'luxon';

/**
 * DST Test Fixtures
 *
 * US DST 2025:
 * - Spring forward: March 9, 2025 at 2:00 AM -> 3:00 AM
 * - Fall back: November 2, 2025 at 2:00 AM -> 1:00 AM
 *
 * EU DST 2025:
 * - Spring forward: March 30, 2025 at 2:00 AM -> 3:00 AM
 * - Fall back: October 26, 2025 at 3:00 AM -> 2:00 AM
 */

export const DST_DATES = {
  // US (America/New_York)
  US_SPRING_FORWARD_2025: '2025-03-09',
  US_FALL_BACK_2025: '2025-11-02',

  // EU (Europe/London)
  EU_SPRING_FORWARD_2025: '2025-03-30',
  EU_FALL_BACK_2025: '2025-10-26',
} as const;

/**
 * Create a DateTime just before DST spring forward transition
 * In America/New_York, 1:59 AM on March 9 is the last valid time before 3:00 AM
 */
export function getBeforeSpringForward(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_SPRING_FORWARD_2025 : DST_DATES.US_SPRING_FORWARD_2025;
  return DateTime.fromISO(`${date}T01:59:00`, { zone: timezone });
}

/**
 * Create a DateTime during the "invalid" hour of spring forward
 * This time (2:30 AM) doesn't exist - Luxon will adjust it forward
 */
export function getInvalidSpringForwardTime(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_SPRING_FORWARD_2025 : DST_DATES.US_SPRING_FORWARD_2025;
  // Note: Luxon automatically adjusts this to 3:30 AM
  return DateTime.fromISO(`${date}T02:30:00`, { zone: timezone });
}

/**
 * Create a DateTime just after DST spring forward transition
 */
export function getAfterSpringForward(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_SPRING_FORWARD_2025 : DST_DATES.US_SPRING_FORWARD_2025;
  return DateTime.fromISO(`${date}T03:01:00`, { zone: timezone });
}

/**
 * Create a DateTime during the "ambiguous" hour of fall back
 * 1:30 AM occurs twice - once in DST, once in standard time
 */
export function getAmbiguousFallBackTime(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_FALL_BACK_2025 : DST_DATES.US_FALL_BACK_2025;
  return DateTime.fromISO(`${date}T01:30:00`, { zone: timezone });
}

/**
 * Create a DateTime just before DST fall back transition
 */
export function getBeforeFallBack(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_FALL_BACK_2025 : DST_DATES.US_FALL_BACK_2025;
  // 1:59 AM in DST (first occurrence)
  return DateTime.fromISO(`${date}T01:59:00`, { zone: timezone });
}

/**
 * Create a DateTime just after DST fall back transition
 */
export function getAfterFallBack(timezone: string = 'America/New_York'): DateTime {
  const date = timezone.includes('Europe') ? DST_DATES.EU_FALL_BACK_2025 : DST_DATES.US_FALL_BACK_2025;
  // 2:01 AM in standard time
  return DateTime.fromISO(`${date}T02:01:00`, { zone: timezone });
}

/**
 * Create schedule test data spanning DST transition
 */
export function createDSTSpanningScheduleData(timezone: string = 'America/New_York') {
  const springDate = timezone.includes('Europe')
    ? DST_DATES.EU_SPRING_FORWARD_2025
    : DST_DATES.US_SPRING_FORWARD_2025;

  return {
    startDate: DateTime.fromISO(`${springDate}T00:00:00`, { zone: timezone })
      .minus({ days: 7 })
      .toISO()!,
    handoffTime: '09:00', // 9 AM handoff - safe time
    timezone,
  };
}

/**
 * Verify two DateTimes represent the same instant
 */
export function sameInstant(a: DateTime, b: DateTime): boolean {
  return a.toUTC().toMillis() === b.toUTC().toMillis();
}
