import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { Prisma, ScheduleOverride } from '@prisma/client';
import {
  CreateOverrideInput,
  CreateSwapInput,
  OverrideListQuery,
  OverrideWithUsers
} from '../types/schedule.js';

export class ScheduleOverrideService {
  // ============================================================================
  // PRIVATE HELPER: CHECK OVERLAP CONFLICT
  // ============================================================================

  private async checkOverlapConflict(
    tx: Prisma.TransactionClient,
    scheduleId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string
  ): Promise<ScheduleOverride | null> {
    const where: Prisma.ScheduleOverrideWhereInput = {
      scheduleId,
      OR: [
        // New override starts during existing
        { startTime: { lte: startTime }, endTime: { gt: startTime } },
        // New override ends during existing
        { startTime: { lt: endTime }, endTime: { gte: endTime } },
        // New override contains existing
        { startTime: { gte: startTime }, endTime: { lte: endTime } },
      ],
    };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    return tx.scheduleOverride.findFirst({ where });
  }

  // ============================================================================
  // CREATE OVERRIDE
  // ============================================================================

  async createOverride(
    input: CreateOverrideInput,
    userId: string
  ): Promise<OverrideWithUsers> {
    return prisma.$transaction(async (tx) => {
      // Load schedule to get teamId
      const schedule = await tx.schedule.findUnique({
        where: { id: input.scheduleId },
        include: { team: true }
      });

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      if (!schedule.isActive) {
        throw new Error('Cannot create override for inactive schedule');
      }

      // Validate user is a member of schedule's team
      const teamMember = await tx.teamMember.findFirst({
        where: {
          userId: input.userId,
          teamId: schedule.teamId
        },
        include: {
          user: { select: { isActive: true } }
        }
      });

      if (!teamMember) {
        throw new Error('Override user must be a member of the schedule\'s team');
      }

      if (!teamMember.user.isActive) {
        throw new Error('Cannot create override with inactive user');
      }

      // Parse times
      const startTime = new Date(input.startTime);
      const endTime = new Date(input.endTime);

      // Check for overlapping overrides
      const conflict = await this.checkOverlapConflict(
        tx,
        input.scheduleId,
        startTime,
        endTime
      );

      if (conflict) {
        throw new Error(
          `Override conflicts with existing override from ${conflict.startTime.toISOString()} to ${conflict.endTime.toISOString()}`
        );
      }

      // Create override
      const override = await tx.scheduleOverride.create({
        data: {
          scheduleId: input.scheduleId,
          userId: input.userId,
          startTime,
          endTime,
          reason: input.reason || null,
          overrideType: 'manual',
          createdById: userId
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          originalUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          schedule: { select: { id: true, name: true, teamId: true } }
        }
      });

      // Audit log
      await auditService.log({
        action: 'schedule.override.created',
        userId,
        teamId: schedule.teamId,
        resourceType: 'schedule_override',
        resourceId: override.id,
        metadata: {
          scheduleId: input.scheduleId,
          overrideUserId: input.userId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          reason: input.reason
        },
        severity: 'INFO'
      });

      return override as OverrideWithUsers;
    });
  }

  // ============================================================================
  // CREATE SWAP
  // ============================================================================

  async createSwap(
    input: CreateSwapInput,
    userId: string
  ): Promise<OverrideWithUsers> {
    return prisma.$transaction(async (tx) => {
      // Load schedule to get teamId
      const schedule = await tx.schedule.findUnique({
        where: { id: input.scheduleId },
        include: { team: true }
      });

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      if (!schedule.isActive) {
        throw new Error('Cannot create swap for inactive schedule');
      }

      // Validate both originalUserId and newUserId are team members
      const teamMembers = await tx.teamMember.findMany({
        where: {
          teamId: schedule.teamId,
          userId: { in: [input.originalUserId, input.newUserId] }
        },
        include: {
          user: { select: { isActive: true } }
        }
      });

      if (teamMembers.length !== 2) {
        throw new Error('Both users must be members of the schedule\'s team');
      }

      const inactiveUsers = teamMembers.filter(m => !m.user.isActive);
      if (inactiveUsers.length > 0) {
        throw new Error('Cannot create swap with inactive users');
      }

      // Parse times
      const startTime = new Date(input.startTime);
      const endTime = new Date(input.endTime);

      // Check for overlapping overrides
      const conflict = await this.checkOverlapConflict(
        tx,
        input.scheduleId,
        startTime,
        endTime
      );

      if (conflict) {
        throw new Error(
          `Swap conflicts with existing override from ${conflict.startTime.toISOString()} to ${conflict.endTime.toISOString()}`
        );
      }

      // Create swap override
      const override = await tx.scheduleOverride.create({
        data: {
          scheduleId: input.scheduleId,
          userId: input.newUserId,
          originalUserId: input.originalUserId,
          startTime,
          endTime,
          reason: input.reason || 'Shift swap',
          overrideType: 'swap',
          createdById: userId
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          originalUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          schedule: { select: { id: true, name: true, teamId: true } }
        }
      });

      // Audit log
      await auditService.log({
        action: 'schedule.shift.swapped',
        userId,
        teamId: schedule.teamId,
        resourceType: 'schedule_override',
        resourceId: override.id,
        metadata: {
          scheduleId: input.scheduleId,
          originalUserId: input.originalUserId,
          newUserId: input.newUserId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          reason: input.reason
        },
        severity: 'INFO'
      });

      return override as OverrideWithUsers;
    });
  }

  // ============================================================================
  // FIND BY SCHEDULE
  // ============================================================================

  async findBySchedule(
    scheduleId: string,
    query: OverrideListQuery
  ): Promise<OverrideWithUsers[]> {
    const where: Prisma.ScheduleOverrideWhereInput = {
      scheduleId
    };

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.startAfter) {
      where.startTime = { gte: new Date(query.startAfter) };
    }

    if (query.endBefore) {
      where.endTime = { lte: new Date(query.endBefore) };
    }

    const overrides = await prisma.scheduleOverride.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        originalUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        schedule: { select: { id: true, name: true, teamId: true } }
      },
      orderBy: { startTime: 'asc' }
    });

    return overrides as OverrideWithUsers[];
  }

  // ============================================================================
  // FIND BY ID
  // ============================================================================

  async findById(id: string): Promise<OverrideWithUsers | null> {
    const override = await prisma.scheduleOverride.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        originalUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        schedule: { select: { id: true, name: true, teamId: true } }
      }
    });

    return override as OverrideWithUsers | null;
  }

  // ============================================================================
  // FIND UPCOMING (for user)
  // ============================================================================

  async findUpcoming(userId: string): Promise<OverrideWithUsers[]> {
    const now = new Date();
    const overrides = await prisma.scheduleOverride.findMany({
      where: {
        userId,
        startTime: { gt: now }
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        originalUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        schedule: { select: { id: true, name: true, teamId: true } }
      },
      orderBy: { startTime: 'asc' }
    });

    return overrides as OverrideWithUsers[];
  }

  // ============================================================================
  // DELETE OVERRIDE
  // ============================================================================

  async delete(id: string, userId: string): Promise<void> {
    return prisma.$transaction(async (tx) => {
      // Load override with schedule for context
      const override = await tx.scheduleOverride.findUnique({
        where: { id },
        include: {
          schedule: {
            include: {
              team: {
                include: {
                  members: {
                    where: { userId },
                    select: { role: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!override) {
        throw new Error('Override not found');
      }

      // Permission check: must be createdBy or team admin
      const isCreator = override.createdById === userId;
      const isTeamAdmin = override.schedule.team.members.some(m => m.role === 'TEAM_ADMIN');

      if (!isCreator && !isTeamAdmin) {
        throw new Error('Only override creator or team admins can delete overrides');
      }

      // Hard delete override
      await tx.scheduleOverride.delete({
        where: { id }
      });

      // Audit log
      await auditService.log({
        action: 'schedule.override.deleted',
        userId,
        teamId: override.schedule.teamId,
        resourceType: 'schedule_override',
        resourceId: id,
        metadata: {
          scheduleId: override.scheduleId,
          overrideUserId: override.userId,
          startTime: override.startTime.toISOString(),
          endTime: override.endTime.toISOString(),
          overrideType: override.overrideType
        },
        severity: 'INFO'
      });
    });
  }

  // ============================================================================
  // DELETE EXPIRED (cleanup job)
  // ============================================================================

  async deleteExpired(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.scheduleOverride.deleteMany({
      where: {
        endTime: { lt: thirtyDaysAgo }
      }
    });

    return result.count;
  }
}

export const scheduleOverrideService = new ScheduleOverrideService();
