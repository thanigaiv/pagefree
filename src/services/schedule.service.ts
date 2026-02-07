import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { RRule } from 'rrule';
import { DateTime, IANAZone } from 'luxon';
import {
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleListQuery,
  ScheduleWithDetails
} from '../types/schedule.js';

export class ScheduleService {
  // ============================================================================
  // PRIVATE HELPER: GENERATE RRULE
  // ============================================================================

  private generateRRule(input: {
    rotationType: 'daily' | 'weekly' | 'custom';
    rotationIntervalDays?: number;
    startDate: Date;
    timezone: string;
    handoffTime: string;
  }): string {
    const [hours, minutes] = input.handoffTime.split(':').map(Number);
    const start = DateTime.fromJSDate(input.startDate, { zone: input.timezone })
      .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

    let rule: RRule;
    switch (input.rotationType) {
      case 'daily':
        rule = new RRule({
          freq: RRule.DAILY,
          interval: 1,
          dtstart: start.toJSDate(),
        });
        break;
      case 'weekly':
        rule = new RRule({
          freq: RRule.WEEKLY,
          interval: 1,
          dtstart: start.toJSDate(),
        });
        break;
      case 'custom':
        rule = new RRule({
          freq: RRule.DAILY,
          interval: input.rotationIntervalDays || 7,
          dtstart: start.toJSDate(),
        });
        break;
    }
    return rule.toString();
  }

  // ============================================================================
  // CREATE SCHEDULE
  // ============================================================================

  async create(input: CreateScheduleInput, userId: string): Promise<ScheduleWithDetails> {
    // Validate timezone
    if (!IANAZone.isValidZone(input.timezone)) {
      throw new Error(`Invalid timezone: ${input.timezone}. Must be a valid IANA timezone (e.g., America/New_York)`);
    }

    // Validate team exists
    const team = await prisma.team.findUnique({
      where: { id: input.teamId }
    });
    if (!team) {
      throw new Error('Team not found');
    }

    // Validate all rotationUserIds exist and are team members
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        teamId: input.teamId,
        userId: { in: input.rotationUserIds }
      },
      include: {
        user: { select: { isActive: true } }
      }
    });

    if (teamMembers.length !== input.rotationUserIds.length) {
      throw new Error('All rotation users must be members of the team');
    }

    // Check all users are active
    const inactiveUsers = teamMembers.filter(m => !m.user.isActive);
    if (inactiveUsers.length > 0) {
      throw new Error('Cannot include inactive users in rotation');
    }

    // Generate RRULE from rotation settings
    const recurrenceRule = this.generateRRule({
      rotationType: input.rotationType,
      rotationIntervalDays: input.rotationIntervalDays,
      startDate: new Date(input.startDate),
      timezone: input.timezone,
      handoffTime: input.handoffTime
    });

    // Create schedule
    const schedule = await prisma.schedule.create({
      data: {
        teamId: input.teamId,
        name: input.name,
        description: input.description,
        timezone: input.timezone,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        handoffTime: input.handoffTime,
        rotationType: input.rotationType,
        rotationIntervalDays: input.rotationIntervalDays || (input.rotationType === 'weekly' ? 7 : 1),
        recurrenceRule,
        rotationUserIds: input.rotationUserIds,
        isActive: true
      },
      include: {
        team: {
          select: { id: true, name: true }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.created',
      userId,
      teamId: input.teamId,
      resourceType: 'schedule',
      resourceId: schedule.id,
      severity: 'HIGH',
      metadata: {
        scheduleName: schedule.name,
        rotationType: schedule.rotationType,
        rotationUserCount: schedule.rotationUserIds.length
      }
    });

    return schedule;
  }

  // ============================================================================
  // FIND BY ID
  // ============================================================================

  async findById(id: string): Promise<ScheduleWithDetails | null> {
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        team: {
          select: { id: true, name: true }
        },
        layers: {
          where: { isActive: true },
          orderBy: { priority: 'desc' }
        },
        _count: {
          select: { overrides: true }
        }
      }
    });

    return schedule;
  }

  // ============================================================================
  // FIND ALL
  // ============================================================================

  async findAll(query: ScheduleListQuery): Promise<ScheduleWithDetails[]> {
    const where: any = {};

    if (query.teamId) {
      where.teamId = query.teamId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        team: {
          select: { id: true, name: true }
        },
        _count: {
          select: { overrides: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return schedules;
  }

  // ============================================================================
  // FIND BY TEAM
  // ============================================================================

  async findByTeam(teamId: string): Promise<ScheduleWithDetails[]> {
    const schedules = await prisma.schedule.findMany({
      where: {
        teamId,
        isActive: true
      },
      include: {
        team: {
          select: { id: true, name: true }
        },
        _count: {
          select: { layers: true, overrides: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return schedules;
  }

  // ============================================================================
  // UPDATE SCHEDULE
  // ============================================================================

  async update(id: string, input: UpdateScheduleInput, userId: string): Promise<ScheduleWithDetails> {
    // Get existing schedule
    const existing = await prisma.schedule.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new Error('Schedule not found');
    }

    // Validate timezone if provided
    if (input.timezone && !IANAZone.isValidZone(input.timezone)) {
      throw new Error(`Invalid timezone: ${input.timezone}. Must be a valid IANA timezone (e.g., America/New_York)`);
    }

    // Validate rotationUserIds if provided
    if (input.rotationUserIds) {
      const teamMembers = await prisma.teamMember.findMany({
        where: {
          teamId: existing.teamId,
          userId: { in: input.rotationUserIds }
        },
        include: {
          user: { select: { isActive: true } }
        }
      });

      if (teamMembers.length !== input.rotationUserIds.length) {
        throw new Error('All rotation users must be members of the team');
      }

      const inactiveUsers = teamMembers.filter(m => !m.user.isActive);
      if (inactiveUsers.length > 0) {
        throw new Error('Cannot include inactive users in rotation');
      }
    }

    // Check if RRULE needs regeneration
    let recurrenceRule = existing.recurrenceRule;
    const needsRRuleRegeneration =
      input.rotationType ||
      input.startDate ||
      input.handoffTime ||
      input.rotationIntervalDays !== undefined;

    if (needsRRuleRegeneration) {
      recurrenceRule = this.generateRRule({
        rotationType: (input.rotationType || existing.rotationType) as 'daily' | 'weekly' | 'custom',
        rotationIntervalDays: input.rotationIntervalDays ?? existing.rotationIntervalDays,
        startDate: input.startDate ? new Date(input.startDate) : existing.startDate,
        timezone: input.timezone || existing.timezone,
        handoffTime: input.handoffTime || existing.handoffTime
      });
    }

    // Update schedule
    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        timezone: input.timezone,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        handoffTime: input.handoffTime,
        rotationType: input.rotationType,
        rotationIntervalDays: input.rotationIntervalDays,
        rotationUserIds: input.rotationUserIds,
        recurrenceRule
      },
      include: {
        team: {
          select: { id: true, name: true }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.updated',
      userId,
      teamId: schedule.teamId,
      resourceType: 'schedule',
      resourceId: schedule.id,
      severity: 'INFO',
      metadata: {
        scheduleName: schedule.name,
        changes: Object.keys(input).filter(k => input[k as keyof UpdateScheduleInput] !== undefined)
      }
    });

    return schedule;
  }

  // ============================================================================
  // ARCHIVE SCHEDULE
  // ============================================================================

  async archive(id: string, userId: string): Promise<ScheduleWithDetails> {
    // Archive schedule and all layers
    const [schedule] = await prisma.$transaction([
      prisma.schedule.update({
        where: { id },
        data: { isActive: false },
        include: {
          team: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.scheduleLayer.updateMany({
        where: { scheduleId: id },
        data: { isActive: false }
      })
    ]);

    // Audit log
    await auditService.log({
      action: 'schedule.archived',
      userId,
      teamId: schedule.teamId,
      resourceType: 'schedule',
      resourceId: schedule.id,
      severity: 'HIGH',
      metadata: {
        scheduleName: schedule.name
      }
    });

    return schedule;
  }

  // ============================================================================
  // DELETE SCHEDULE
  // ============================================================================

  async delete(id: string, userId: string): Promise<void> {
    // Get schedule info for audit
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      select: { id: true, name: true, teamId: true }
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    // Hard delete (cascades to layers and overrides per schema)
    await prisma.schedule.delete({
      where: { id }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.deleted',
      userId,
      teamId: schedule.teamId,
      resourceType: 'schedule',
      resourceId: schedule.id,
      severity: 'HIGH',
      metadata: {
        scheduleName: schedule.name
      }
    });
  }
}

export const scheduleService = new ScheduleService();
