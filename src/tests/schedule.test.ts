import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import { ScheduleService } from '../services/schedule.service.js';
import { ScheduleLayerService } from '../services/scheduleLayer.service.js';
import { ScheduleOverrideService } from '../services/scheduleOverride.service.js';
import { DateTime } from 'luxon';
import { cleanupTestData, createTestUser, createTestTeam } from './setup.js';

describe('Schedule System', () => {
  let scheduleService: ScheduleService;
  let layerService: ScheduleLayerService;
  let overrideService: ScheduleOverrideService;
  let testUser: any;
  let testTeam: any;
  let adminUser: any;

  beforeAll(async () => {
    scheduleService = new ScheduleService();
    layerService = new ScheduleLayerService();
    overrideService = new ScheduleOverrideService();
  });

  beforeEach(async () => {
    await cleanupTestData();
    adminUser = await createTestUser({ platformRole: 'PLATFORM_ADMIN' });
    testTeam = await createTestTeam({ name: 'Test Team' });
    testUser = await createTestUser({ email: 'responder@test.com' });

    // Add user to team
    await prisma.teamMember.create({
      data: {
        teamId: testTeam.id,
        userId: testUser.id,
        role: 'RESPONDER',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Schedule CRUD', () => {
    it('creates daily rotation schedule with valid RRULE', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Daily On-Call',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'daily',
        rotationUserIds: [testUser.id],
      }, adminUser.id);

      expect(schedule).toBeDefined();
      expect(schedule.recurrenceRule).toContain('FREQ=DAILY');
      expect(schedule.recurrenceRule).toContain('INTERVAL=1');
    });

    it('creates weekly rotation schedule with valid RRULE', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Weekly On-Call',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [testUser.id],
      }, adminUser.id);

      expect(schedule.recurrenceRule).toContain('FREQ=WEEKLY');
    });

    it('creates custom rotation schedule with specified interval', async () => {
      const schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: '2-Week On-Call',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'custom',
        rotationIntervalDays: 14,
        rotationUserIds: [testUser.id],
      }, adminUser.id);

      expect(schedule.recurrenceRule).toContain('INTERVAL=14');
    });

    it('rejects invalid IANA timezone', async () => {
      await expect(scheduleService.create({
        teamId: testTeam.id,
        name: 'Bad Timezone',
        timezone: 'Invalid/Timezone', // Invalid timezone
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'daily',
        rotationUserIds: [testUser.id],
      }, adminUser.id)).rejects.toThrow(/timezone/i);
    });

    it('rejects user not in team', async () => {
      const outsideUser = await createTestUser({ email: 'outside@test.com' });

      await expect(scheduleService.create({
        teamId: testTeam.id,
        name: 'Bad Rotation',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'daily',
        rotationUserIds: [outsideUser.id], // Not a team member
      }, adminUser.id)).rejects.toThrow(/members of the team/i);
    });
  });

  describe('Schedule Layers', () => {
    let schedule: any;

    beforeEach(async () => {
      schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Layered Schedule',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [testUser.id],
      }, adminUser.id);
    });

    it('creates layer with priority', async () => {
      const layer = await layerService.create({
        scheduleId: schedule.id,
        name: 'Primary',
        priority: 100,
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [testUser.id],
      }, adminUser.id);

      expect(layer.priority).toBe(100);
    });

    it('creates layer with weekend restrictions', async () => {
      const layer = await layerService.create({
        scheduleId: schedule.id,
        name: 'Weekend',
        priority: 90,
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [testUser.id],
        restrictions: { daysOfWeek: ['SA', 'SU'] },
      }, adminUser.id);

      expect(layer.restrictions).toEqual({ daysOfWeek: ['SA', 'SU'] });
    });
  });

  describe('Schedule Overrides', () => {
    let schedule: any;
    let coverUser: any;

    beforeEach(async () => {
      schedule = await scheduleService.create({
        teamId: testTeam.id,
        name: 'Override Test',
        timezone: 'America/New_York',
        startDate: DateTime.now().toISO()!,
        handoffTime: '09:00',
        rotationType: 'weekly',
        rotationUserIds: [testUser.id],
      }, adminUser.id);

      coverUser = await createTestUser({ email: 'cover@test.com' });
      await prisma.teamMember.create({
        data: {
          teamId: testTeam.id,
          userId: coverUser.id,
          role: 'RESPONDER',
        },
      });
    });

    it('creates override for time range', async () => {
      const startTime = DateTime.now().plus({ days: 1 }).toISO()!;
      const endTime = DateTime.now().plus({ days: 2 }).toISO()!;

      const override = await overrideService.createOverride({
        scheduleId: schedule.id,
        userId: coverUser.id,
        startTime,
        endTime,
        reason: 'Vacation coverage',
      }, adminUser.id);

      expect(override.userId).toBe(coverUser.id);
      expect(override.overrideType).toBe('manual');
    });

    it('rejects overlapping overrides', async () => {
      const startTime = DateTime.now().plus({ days: 1 }).toISO()!;
      const endTime = DateTime.now().plus({ days: 2 }).toISO()!;

      await overrideService.createOverride({
        scheduleId: schedule.id,
        userId: coverUser.id,
        startTime,
        endTime,
      }, adminUser.id);

      // Try to create overlapping override
      await expect(overrideService.createOverride({
        scheduleId: schedule.id,
        userId: testUser.id,
        startTime: DateTime.now().plus({ days: 1, hours: 12 }).toISO()!, // Overlaps
        endTime: DateTime.now().plus({ days: 3 }).toISO()!,
      }, adminUser.id)).rejects.toThrow(/conflict|overlap/i);
    });

    it('creates shift swap with both users', async () => {
      const startTime = DateTime.now().plus({ days: 1 }).toISO()!;
      const endTime = DateTime.now().plus({ days: 2 }).toISO()!;

      const swap = await overrideService.createSwap({
        scheduleId: schedule.id,
        originalUserId: testUser.id,
        newUserId: coverUser.id,
        startTime,
        endTime,
        reason: 'Shift swap',
      }, adminUser.id);

      expect(swap.originalUserId).toBe(testUser.id);
      expect(swap.userId).toBe(coverUser.id);
      expect(swap.overrideType).toBe('swap');
    });
  });
});
