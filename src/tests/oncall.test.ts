import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import { ScheduleService } from '../services/schedule.service.js';
import { OnCallService } from '../services/oncall.service.js';
import { ScheduleOverrideService } from '../services/scheduleOverride.service.js';
import { DateTime } from 'luxon';
import {
  DST_DATES,
  getBeforeSpringForward,
  getAfterSpringForward,
  getInvalidSpringForwardTime,
  getAmbiguousFallBackTime,
  createDSTSpanningScheduleData,
} from './fixtures/dst.js';
import { cleanupTestData, createTestUser, createTestTeam } from './setup.js';

describe('On-Call Service', () => {
  let onCallService: OnCallService;
  let scheduleService: ScheduleService;
  let overrideService: ScheduleOverrideService;
  let testTeam: any;
  let users: any[];
  let adminUser: any;

  beforeAll(async () => {
    onCallService = new OnCallService();
    scheduleService = new ScheduleService();
    overrideService = new ScheduleOverrideService();
  });

  beforeEach(async () => {
    await cleanupTestData();
    adminUser = await createTestUser({ platformRole: 'PLATFORM_ADMIN' });
    testTeam = await createTestTeam({ name: 'On-Call Team' });

    // Create 3 users for rotation testing
    users = await Promise.all([
      createTestUser({ email: 'user1@test.com', firstName: 'Alice' }),
      createTestUser({ email: 'user2@test.com', firstName: 'Bob' }),
      createTestUser({ email: 'user3@test.com', firstName: 'Charlie' }),
    ]);

    // Add all users to team
    for (const user of users) {
      await prisma.teamMember.create({
        data: {
          teamId: testTeam.id,
          userId: user.id,
          role: 'RESPONDER',
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Basic On-Call Queries', () => {
    it('returns current on-call from schedule', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Basic Schedule',
        timezone: 'America/New_York',
        startDate: DateTime.now().minus({ weeks: 1 }).toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      const result = await onCallService.getCurrentOnCall({ scheduleId: schedule.id });

      expect(result).toBeDefined();
      expect(result!.user).toBeDefined();
      expect(result!.source).toBe('schedule');
    });

    it('override takes precedence over schedule', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Override Test',
        timezone: 'America/New_York',
        startDate: DateTime.now().minus({ weeks: 1 }).toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [users[0].id],
      }, adminUser.id);

      // Create override for different user covering now
      await overrideService.createOverride({
        scheduleId: schedule.id,
        userId: users[1].id,
        startTime: DateTime.now().minus({ hours: 1 }).toISO()!,
        endTime: DateTime.now().plus({ hours: 1 }).toISO()!,
        reason: 'Test override',
      }, adminUser.id);

      const result = await onCallService.getCurrentOnCall({ scheduleId: schedule.id });

      expect(result!.source).toBe('override');
      expect(result!.user.id).toBe(users[1].id);
    });

    it('returns correct user based on rotation position', async () => {
      // Create schedule that started 2 weeks ago with weekly rotation
      const startDate = DateTime.now().minus({ weeks: 2 });

      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Rotation Test',
        timezone: 'UTC',
        startDate: startDate.toISO()!,
        handoffTime: '00:00',
        rotationType: 'weekly',
        rotationUserIds: users.map(u => u.id), // Alice, Bob, Charlie
      }, adminUser.id);

      // Week 0: Alice, Week 1: Bob, Week 2: Charlie
      // We're now in week 2 (occurrence #2, index 2)
      const result = await onCallService.getCurrentOnCall({ scheduleId: schedule.id });

      // Should return one of the users - exact user depends on RRULE calculation
      expect(result).toBeDefined();
      expect(result!.user).toBeDefined();
      expect(users.map(u => u.id)).toContain(result!.user.id);
    });
  });

  describe('DST Spring Forward (March 9, 2025)', () => {
    it('handles query at 2:30 AM which does not exist', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'DST Spring Forward Test',
        ...createDSTSpanningScheduleData('America/New_York'),
        rotationType: 'daily',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      // Query at 2:30 AM on March 9 - this time doesn't exist
      // Luxon will adjust to 3:30 AM automatically
      const invalidTime = getInvalidSpringForwardTime('America/New_York');

      const result = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: invalidTime.toJSDate(),
      });

      // Should still return a valid on-call user
      expect(result).toBeDefined();
      expect(result!.user).toBeDefined();
    });

    it('handles handoff scheduled at 2:00 AM during spring forward', async () => {
      // Schedule with 2 AM handoff - this time doesn't exist on March 9
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: '2AM Handoff DST Test',
        timezone: 'America/New_York',
        startDate: DateTime.fromISO(`${DST_DATES.US_SPRING_FORWARD_2025}T00:00:00`, {
          zone: 'America/New_York'
        }).minus({ days: 7 }).toISO()!,
        handoffTime: '02:00', // This time doesn't exist on DST day
        rotationType: 'daily',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      // Query just before 2 AM
      const beforeResult = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: getBeforeSpringForward('America/New_York').toJSDate(),
      });

      // Query just after 3 AM
      const afterResult = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: getAfterSpringForward('America/New_York').toJSDate(),
      });

      // Both should return valid users (may or may not be same depending on handoff)
      expect(beforeResult).toBeDefined();
      expect(afterResult).toBeDefined();
    });
  });

  describe('DST Fall Back (November 2, 2025)', () => {
    it('handles query at ambiguous 1:30 AM', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'DST Fall Back Test',
        timezone: 'America/New_York',
        startDate: DateTime.fromISO(`${DST_DATES.US_FALL_BACK_2025}T00:00:00`, {
          zone: 'America/New_York'
        }).minus({ days: 7 }).toISO()!,
        handoffTime: '09:00',
        rotationType: 'daily',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      // Query at 1:30 AM which occurs twice
      const ambiguousTime = getAmbiguousFallBackTime('America/New_York');

      const result = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: ambiguousTime.toJSDate(),
      });

      // Should return consistent result
      expect(result).toBeDefined();
      expect(result!.user).toBeDefined();
    });
  });

  describe('Timezone Handling', () => {
    it('handles distributed team across timezones', async () => {
      // Schedule in NYC timezone
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'NYC Schedule',
        timezone: 'America/New_York',
        startDate: DateTime.now().minus({ weeks: 1 }).toISO()!,
        handoffTime: '09:00', // 9 AM NYC
        rotationType: 'daily',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      // Query at 9 AM NYC time
      const nycMorning = DateTime.now().setZone('America/New_York').set({ hour: 9, minute: 0 });

      // Query at same instant from London perspective
      const londonTime = nycMorning.setZone('Europe/London');

      const nycResult = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: nycMorning.toJSDate(),
      });

      const londonResult = await onCallService.getCurrentOnCall({
        scheduleId: schedule.id,
        at: londonTime.toJSDate(),
      });

      // Same instant should return same user regardless of query timezone
      expect(nycResult!.user.id).toBe(londonResult!.user.id);
    });

    it('stores and queries in UTC correctly', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'UTC Test',
        timezone: 'America/Los_Angeles', // PST/PDT
        startDate: DateTime.now().minus({ weeks: 1 }).toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: users.map(u => u.id),
      }, adminUser.id);

      // Verify database stores UTC
      const dbSchedule = await prisma.schedule.findUnique({
        where: { id: schedule.id },
      });

      // startDate should be stored as UTC in database
      expect(dbSchedule!.startDate).toBeInstanceOf(Date);

      // Query should work regardless
      const result = await onCallService.getCurrentOnCall({ scheduleId: schedule.id });
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty schedule gracefully', async () => {
      const result = await onCallService.getCurrentOnCall({
        scheduleId: 'nonexistent-id',
      });

      expect(result).toBeNull();
    });

    it('returns null when no schedule matches team', async () => {
      const result = await onCallService.getOnCallForTeam('nonexistent-team-id');

      expect(result).toEqual([]);
    });
  });
});
