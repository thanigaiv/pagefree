import { prisma } from '../config/database.js';
import { RRule } from 'rrule';
import { DateTime } from 'luxon';
import type { Schedule, ScheduleLayer } from '@prisma/client';

// ============================================================================
// RESULT INTERFACES
// ============================================================================

export interface OnCallResult {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  source: 'override' | 'layer' | 'schedule';
  layerName?: string;
  overrideReason?: string;
  shiftStart: Date;
  shiftEnd: Date;
  scheduleId: string;
  scheduleName: string;
}

export interface OnCallQuery {
  scheduleId?: string;
  teamId?: string;
  at?: Date; // Default: now
}

// ============================================================================
// ON-CALL SERVICE
// ============================================================================

export class OnCallService {
  // ============================================================================
  // PRIVATE HELPER: LAYER APPLIES AT TIME
  // ============================================================================

  private layerAppliesAt(layer: ScheduleLayer, time: DateTime): boolean {
    if (!layer.restrictions) return true;

    const restrictions = layer.restrictions as { daysOfWeek?: string[] };
    if (restrictions.daysOfWeek) {
      const weekdayMap: Record<number, string> = {
        1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU'
      };
      const currentDay = weekdayMap[time.weekday];
      return restrictions.daysOfWeek.includes(currentDay);
    }

    return true;
  }

  // ============================================================================
  // PRIVATE HELPER: CALCULATE SHIFT FROM RRULE
  // ============================================================================

  private calculateShiftFromRRule(
    ruleStr: string,
    startDate: Date,
    atTime: DateTime,
    userIds: string[],
    timezone: string
  ): { userIndex: number; shiftStart: Date; shiftEnd: Date } | null {
    const rule = RRule.fromString(ruleStr);
    const layerStart = DateTime.fromJSDate(startDate, { zone: timezone });

    // Get all occurrences from start until query time
    const occurrences = rule.between(
      layerStart.toJSDate(),
      atTime.toJSDate(),
      true // inclusive
    );

    if (occurrences.length === 0) return null;

    // Current shift is the last occurrence
    const shiftIndex = occurrences.length - 1;
    const userIndex = shiftIndex % userIds.length;

    // Shift start is current occurrence, end is next occurrence
    const shiftStart = occurrences[shiftIndex];
    const nextOccurrence = rule.after(atTime.toJSDate());
    const shiftEnd = nextOccurrence || DateTime.fromJSDate(shiftStart).plus({ weeks: 1 }).toJSDate();

    return { userIndex, shiftStart, shiftEnd };
  }

  // ============================================================================
  // PRIVATE HELPER: GET SCHEDULES BASED ON QUERY
  // ============================================================================

  private async getSchedules(query: OnCallQuery): Promise<Schedule[]> {
    const where: any = { isActive: true };

    if (query.scheduleId) {
      where.id = query.scheduleId;
    }

    if (query.teamId) {
      where.teamId = query.teamId;
    }

    return prisma.schedule.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });
  }

  // ============================================================================
  // GET CURRENT ON-CALL
  // ============================================================================

  async getCurrentOnCall(query: OnCallQuery): Promise<OnCallResult | null> {
    const atTime = query.at ? DateTime.fromJSDate(query.at) : DateTime.now();

    // 1. Load schedule(s) based on query
    const schedules = await this.getSchedules(query);
    if (schedules.length === 0) return null;

    for (const schedule of schedules) {
      const scheduleTime = atTime.setZone(schedule.timezone);

      // 2. Check for active override (highest precedence)
      const override = await prisma.scheduleOverride.findFirst({
        where: {
          scheduleId: schedule.id,
          startTime: { lte: scheduleTime.toJSDate() },
          endTime: { gt: scheduleTime.toJSDate() },
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      });

      if (override) {
        return {
          user: override.user,
          source: 'override',
          overrideReason: override.reason || undefined,
          shiftStart: override.startTime,
          shiftEnd: override.endTime,
          scheduleId: schedule.id,
          scheduleName: schedule.name,
        };
      }

      // 3. Evaluate layers in priority order
      const layers = await prisma.scheduleLayer.findMany({
        where: { scheduleId: schedule.id, isActive: true },
        orderBy: { priority: 'desc' },
      });

      for (const layer of layers) {
        const layerTime = atTime.setZone(layer.timezone);

        // Check restrictions
        if (!this.layerAppliesAt(layer, layerTime)) continue;

        // Calculate from RRULE
        const shift = this.calculateShiftFromRRule(
          layer.recurrenceRule,
          layer.startDate,
          layerTime,
          layer.rotationUserIds,
          layer.timezone
        );

        if (shift) {
          const user = await prisma.user.findUnique({
            where: { id: layer.rotationUserIds[shift.userIndex] },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          });

          if (user) {
            return {
              user,
              source: 'layer',
              layerName: layer.name,
              shiftStart: shift.shiftStart,
              shiftEnd: shift.shiftEnd,
              scheduleId: schedule.id,
              scheduleName: schedule.name,
            };
          }
        }
      }

      // 4. Fall back to base schedule if no layers
      if (layers.length === 0 && schedule.rotationUserIds.length > 0) {
        const shift = this.calculateShiftFromRRule(
          schedule.recurrenceRule,
          schedule.startDate,
          scheduleTime,
          schedule.rotationUserIds,
          schedule.timezone
        );

        if (shift) {
          const user = await prisma.user.findUnique({
            where: { id: schedule.rotationUserIds[shift.userIndex] },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          });

          if (user) {
            return {
              user,
              source: 'schedule',
              shiftStart: shift.shiftStart,
              shiftEnd: shift.shiftEnd,
              scheduleId: schedule.id,
              scheduleName: schedule.name,
            };
          }
        }
      }
    }

    return null;
  }

  // ============================================================================
  // GET ON-CALL FOR TEAM
  // ============================================================================

  async getOnCallForTeam(teamId: string, at?: Date): Promise<OnCallResult[]> {
    const schedules = await prisma.schedule.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: 'asc' }
    });

    const results: OnCallResult[] = [];

    for (const schedule of schedules) {
      const result = await this.getCurrentOnCall({
        scheduleId: schedule.id,
        at
      });

      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  // ============================================================================
  // GET UPCOMING SHIFTS
  // ============================================================================

  async getUpcomingShifts(userId: string, days: number = 30): Promise<Array<{
    scheduleId: string;
    scheduleName: string;
    shiftStart: Date;
    shiftEnd: Date;
  }>> {
    // Find all schedules user is part of (in rotationUserIds)
    const schedules = await prisma.schedule.findMany({
      where: {
        isActive: true,
        rotationUserIds: { has: userId },
      },
    });

    // Also check layers
    const layers = await prisma.scheduleLayer.findMany({
      where: {
        isActive: true,
        rotationUserIds: { has: userId },
      },
      include: { schedule: true },
    });

    const shifts: Array<{ scheduleId: string; scheduleName: string; shiftStart: Date; shiftEnd: Date }> = [];
    const now = DateTime.now();
    const endWindow = now.plus({ days });

    // Calculate shifts from schedules
    for (const schedule of schedules) {
      const rule = RRule.fromString(schedule.recurrenceRule);
      const occurrences = rule.between(now.toJSDate(), endWindow.toJSDate(), true);

      for (let i = 0; i < occurrences.length; i++) {
        const userIndex = i % schedule.rotationUserIds.length;
        if (schedule.rotationUserIds[userIndex] === userId) {
          const nextOcc = occurrences[i + 1] || rule.after(occurrences[i]);
          shifts.push({
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            shiftStart: occurrences[i],
            shiftEnd: nextOcc || DateTime.fromJSDate(occurrences[i]).plus({ weeks: 1 }).toJSDate(),
          });
        }
      }
    }

    // Calculate shifts from layers
    for (const layer of layers) {
      const rule = RRule.fromString(layer.recurrenceRule);
      const occurrences = rule.between(now.toJSDate(), endWindow.toJSDate(), true);

      for (let i = 0; i < occurrences.length; i++) {
        const userIndex = i % layer.rotationUserIds.length;
        if (layer.rotationUserIds[userIndex] === userId) {
          const nextOcc = occurrences[i + 1] || rule.after(occurrences[i]);
          shifts.push({
            scheduleId: layer.schedule.id,
            scheduleName: layer.schedule.name,
            shiftStart: occurrences[i],
            shiftEnd: nextOcc || DateTime.fromJSDate(occurrences[i]).plus({ weeks: 1 }).toJSDate(),
          });
        }
      }
    }

    // Sort by shiftStart and remove duplicates
    return shifts.sort((a, b) => a.shiftStart.getTime() - b.shiftStart.getTime());
  }

  // ============================================================================
  // GET SCHEDULE TIMELINE
  // ============================================================================

  async getScheduleTimeline(
    scheduleId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    userId: string;
    userName: string;
    shiftStart: Date;
    shiftEnd: Date;
    source: 'schedule' | 'layer' | 'override';
  }>> {
    // Load schedule with layers and overrides in date range
    const schedule = await prisma.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: {
        layers: { where: { isActive: true }, orderBy: { priority: 'desc' } },
        overrides: {
          where: {
            OR: [
              { startTime: { gte: startDate, lt: endDate } },
              { endTime: { gt: startDate, lte: endDate } },
              { startTime: { lte: startDate }, endTime: { gte: endDate } },
            ],
          },
          include: { user: true },
        },
      },
    });

    // Build timeline (simplified - full implementation would merge overlapping regions)
    const timeline: Array<{
      userId: string;
      userName: string;
      shiftStart: Date;
      shiftEnd: Date;
      source: 'schedule' | 'layer' | 'override';
    }> = [];

    // Add overrides first (they take precedence)
    for (const override of schedule.overrides) {
      timeline.push({
        userId: override.userId,
        userName: `${override.user.firstName} ${override.user.lastName}`,
        shiftStart: override.startTime,
        shiftEnd: override.endTime,
        source: 'override',
      });
    }

    return timeline.sort((a, b) => a.shiftStart.getTime() - b.shiftStart.getTime());
  }
}

export const onCallService = new OnCallService();
