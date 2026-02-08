import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import * as rruleModule from 'rrule';
const { RRule } = rruleModule;
import { DateTime, IANAZone } from 'luxon';
import {
  CreateLayerInput,
  UpdateLayerInput,
  LayerWithSchedule
} from '../types/schedule.js';

export class ScheduleLayerService {
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
  // CREATE LAYER
  // ============================================================================

  async create(input: CreateLayerInput, userId: string): Promise<LayerWithSchedule> {
    // Validate timezone
    if (!IANAZone.isValidZone(input.timezone)) {
      throw new Error(`Invalid timezone: ${input.timezone}. Must be a valid IANA timezone (e.g., America/New_York)`);
    }

    // Load parent schedule to verify it exists and get teamId
    const schedule = await prisma.schedule.findUnique({
      where: { id: input.scheduleId },
      select: { id: true, name: true, teamId: true, isActive: true }
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (!schedule.isActive) {
      throw new Error('Cannot add layers to an archived schedule');
    }

    // Validate all rotationUserIds are members of schedule's team
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        teamId: schedule.teamId,
        userId: { in: input.rotationUserIds }
      },
      include: {
        user: { select: { isActive: true } }
      }
    });

    if (teamMembers.length !== input.rotationUserIds.length) {
      throw new Error('All rotation users must be members of the schedule\'s team');
    }

    // Check all users are active
    const inactiveUsers = teamMembers.filter(m => !m.user.isActive);
    if (inactiveUsers.length > 0) {
      throw new Error('Cannot include inactive users in rotation');
    }

    // Check for priority conflicts (warn if same priority exists)
    const existingPriority = await prisma.scheduleLayer.findFirst({
      where: {
        scheduleId: input.scheduleId,
        priority: input.priority,
        isActive: true
      }
    });

    if (existingPriority) {
      console.warn(`Warning: Layer with priority ${input.priority} already exists for schedule ${input.scheduleId}. Higher priority = higher precedence.`);
    }

    // Generate RRULE from rotation settings
    const recurrenceRule = this.generateRRule({
      rotationType: input.rotationType,
      rotationIntervalDays: input.rotationIntervalDays,
      startDate: new Date(input.startDate),
      timezone: input.timezone,
      handoffTime: input.handoffTime
    });

    // Create layer with restrictions stored as JSON
    const layer = await prisma.scheduleLayer.create({
      data: {
        scheduleId: input.scheduleId,
        name: input.name,
        priority: input.priority,
        timezone: input.timezone,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        handoffTime: input.handoffTime,
        recurrenceRule,
        rotationUserIds: input.rotationUserIds,
        restrictions: input.restrictions as any, // Zod validated JSON object
        isActive: true
      },
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
            teamId: true
          }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.layer.created',
      userId,
      teamId: schedule.teamId,
      resourceType: 'schedule_layer',
      resourceId: layer.id,
      severity: 'INFO',
      metadata: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        layerName: layer.name,
        priority: layer.priority,
        restrictions: layer.restrictions,
        rotationUserCount: layer.rotationUserIds.length
      }
    });

    return layer as LayerWithSchedule;
  }

  // ============================================================================
  // FIND BY SCHEDULE
  // ============================================================================

  async findBySchedule(scheduleId: string): Promise<LayerWithSchedule[]> {
    const layers = await prisma.scheduleLayer.findMany({
      where: {
        scheduleId,
        isActive: true
      },
      orderBy: { priority: 'desc' }, // Highest priority first
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
            teamId: true
          }
        }
      }
    });

    return layers as LayerWithSchedule[];
  }

  // ============================================================================
  // FIND BY ID
  // ============================================================================

  async findById(id: string): Promise<LayerWithSchedule | null> {
    const layer = await prisma.scheduleLayer.findUnique({
      where: { id },
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
            teamId: true
          }
        }
      }
    });

    return layer as LayerWithSchedule | null;
  }

  // ============================================================================
  // UPDATE LAYER
  // ============================================================================

  async update(id: string, input: UpdateLayerInput, userId: string): Promise<LayerWithSchedule> {
    // Get existing layer
    const existing = await prisma.scheduleLayer.findUnique({
      where: { id },
      include: {
        schedule: {
          select: { id: true, name: true, teamId: true }
        }
      }
    });

    if (!existing) {
      throw new Error('Layer not found');
    }

    // Validate timezone if provided
    if (input.timezone && !IANAZone.isValidZone(input.timezone)) {
      throw new Error(`Invalid timezone: ${input.timezone}. Must be a valid IANA timezone (e.g., America/New_York)`);
    }

    // Validate rotationUserIds if provided
    if (input.rotationUserIds) {
      const teamMembers = await prisma.teamMember.findMany({
        where: {
          teamId: existing.schedule.teamId,
          userId: { in: input.rotationUserIds }
        },
        include: {
          user: { select: { isActive: true } }
        }
      });

      if (teamMembers.length !== input.rotationUserIds.length) {
        throw new Error('All rotation users must be members of the schedule\'s team');
      }

      const inactiveUsers = teamMembers.filter(m => !m.user.isActive);
      if (inactiveUsers.length > 0) {
        throw new Error('Cannot include inactive users in rotation');
      }
    }

    // Check if RRULE needs regeneration
    // Note: Layers don't store rotationType/rotationIntervalDays, but input may contain them
    let recurrenceRule = existing.recurrenceRule;
    const needsRRuleRegeneration =
      input.rotationType ||
      input.startDate ||
      input.handoffTime ||
      input.rotationIntervalDays !== undefined;

    if (needsRRuleRegeneration) {
      // Regenerate RRULE using input values (required for layer update)
      if (!input.rotationType) {
        throw new Error('rotationType is required when updating rotation settings');
      }
      recurrenceRule = this.generateRRule({
        rotationType: input.rotationType,
        rotationIntervalDays: input.rotationIntervalDays,
        startDate: input.startDate ? new Date(input.startDate) : existing.startDate,
        timezone: input.timezone || existing.timezone,
        handoffTime: input.handoffTime || existing.handoffTime
      });
    }

    // Update layer
    const layer = await prisma.scheduleLayer.update({
      where: { id },
      data: {
        name: input.name,
        priority: input.priority,
        timezone: input.timezone,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        handoffTime: input.handoffTime,
        rotationUserIds: input.rotationUserIds,
        restrictions: input.restrictions !== undefined ? (input.restrictions as any) : undefined,
        recurrenceRule
      },
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
            teamId: true
          }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.layer.updated',
      userId,
      teamId: existing.schedule.teamId,
      resourceType: 'schedule_layer',
      resourceId: layer.id,
      severity: 'INFO',
      metadata: {
        scheduleId: existing.schedule.id,
        scheduleName: existing.schedule.name,
        layerName: layer.name,
        changes: Object.keys(input).filter(k => input[k as keyof UpdateLayerInput] !== undefined)
      }
    });

    return layer as LayerWithSchedule;
  }

  // ============================================================================
  // DELETE LAYER
  // ============================================================================

  async delete(id: string, userId: string): Promise<void> {
    // Load layer with schedule for audit context
    const layer = await prisma.scheduleLayer.findUnique({
      where: { id },
      include: {
        schedule: {
          select: { id: true, name: true, teamId: true }
        }
      }
    });

    if (!layer) {
      throw new Error('Layer not found');
    }

    // Hard delete layer
    await prisma.scheduleLayer.delete({
      where: { id }
    });

    // Audit log
    await auditService.log({
      action: 'schedule.layer.deleted',
      userId,
      teamId: layer.schedule.teamId,
      resourceType: 'schedule_layer',
      resourceId: layer.id,
      severity: 'INFO',
      metadata: {
        scheduleId: layer.schedule.id,
        scheduleName: layer.schedule.name,
        layerName: layer.name,
        priority: layer.priority
      }
    });
  }

  // ============================================================================
  // REORDER PRIORITIES
  // ============================================================================

  async reorderPriorities(
    scheduleId: string,
    layerIds: string[],
    userId: string
  ): Promise<LayerWithSchedule[]> {
    // Verify schedule exists and get teamId for audit
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, name: true, teamId: true }
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    // Verify all layers belong to this schedule
    const layers = await prisma.scheduleLayer.findMany({
      where: {
        id: { in: layerIds },
        scheduleId
      }
    });

    if (layers.length !== layerIds.length) {
      throw new Error('One or more layers not found or do not belong to this schedule');
    }

    // Update priorities: first layer gets 100, second gets 90, etc.
    // This ensures higher priority numbers = higher precedence
    const updates = layerIds.map((layerId, index) => {
      const priority = 100 - (index * 10);
      return prisma.scheduleLayer.update({
        where: { id: layerId },
        data: { priority }
      });
    });

    await prisma.$transaction(updates);

    // Audit log
    await auditService.log({
      action: 'schedule.layers.reordered',
      userId,
      teamId: schedule.teamId,
      resourceType: 'schedule',
      resourceId: scheduleId,
      severity: 'INFO',
      metadata: {
        scheduleName: schedule.name,
        layerCount: layerIds.length,
        newOrder: layerIds
      }
    });

    // Return reordered layers
    return this.findBySchedule(scheduleId);
  }
}

export const scheduleLayerService = new ScheduleLayerService();
