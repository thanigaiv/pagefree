import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { logger } from '../config/logger.js';

// Types
interface CreateEscalationPolicyInput {
  teamId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  repeatCount?: number;
  levels: CreateEscalationLevelInput[];
}

interface CreateEscalationLevelInput {
  levelNumber: number;
  targetType: 'user' | 'schedule' | 'entire_team';
  targetId?: string;
  timeoutMinutes?: number;
}

interface UpdateEscalationPolicyInput {
  name?: string;
  description?: string;
  isDefault?: boolean;
  repeatCount?: number;
  isActive?: boolean;
}

class EscalationPolicyService {
  // Validation constants per PagerDuty patterns
  private readonly MIN_TIMEOUT_SINGLE_TARGET = 1;    // 1 minute for single target
  private readonly MIN_TIMEOUT_MULTI_TARGET = 3;     // 3 minutes for multiple targets
  private readonly MAX_REPEAT_COUNT = 9;
  private readonly MAX_LEVELS = 10;

  async create(
    input: CreateEscalationPolicyInput,
    userId: string
  ): Promise<any> {
    // Validate levels
    this.validateLevels(input.levels);

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await prisma.escalationPolicy.updateMany({
        where: { teamId: input.teamId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const policy = await prisma.escalationPolicy.create({
      data: {
        teamId: input.teamId,
        name: input.name,
        description: input.description,
        isDefault: input.isDefault ?? false,
        repeatCount: Math.min(input.repeatCount ?? 1, this.MAX_REPEAT_COUNT),
        levels: {
          create: input.levels.map(level => ({
            levelNumber: level.levelNumber,
            targetType: level.targetType,
            targetId: level.targetId,
            timeoutMinutes: level.timeoutMinutes ?? 30
          }))
        }
      },
      include: { levels: { orderBy: { levelNumber: 'asc' } } }
    });

    await auditService.log({
      action: 'escalation.policy.created',
      userId,
      teamId: input.teamId,
      resourceType: 'escalation_policy',
      resourceId: policy.id,
      severity: 'HIGH',
      metadata: { name: input.name, levelCount: input.levels.length }
    });

    logger.info({ policyId: policy.id, teamId: input.teamId }, 'Escalation policy created');
    return policy;
  }

  async getById(id: string): Promise<any> {
    return prisma.escalationPolicy.findUnique({
      where: { id },
      include: {
        levels: { orderBy: { levelNumber: 'asc' } },
        team: { select: { id: true, name: true } }
      }
    });
  }

  async getByTeam(teamId: string, includeInactive = false): Promise<any[]> {
    return prisma.escalationPolicy.findMany({
      where: {
        teamId,
        ...(includeInactive ? {} : { isActive: true })
      },
      include: { levels: { orderBy: { levelNumber: 'asc' } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });
  }

  async getDefaultForTeam(teamId: string): Promise<any> {
    return prisma.escalationPolicy.findFirst({
      where: { teamId, isDefault: true, isActive: true },
      include: { levels: { orderBy: { levelNumber: 'asc' } } }
    });
  }

  async update(
    id: string,
    input: UpdateEscalationPolicyInput,
    userId: string
  ): Promise<any> {
    const existing = await prisma.escalationPolicy.findUnique({
      where: { id },
      select: { teamId: true }
    });

    if (!existing) {
      throw new Error('Escalation policy not found');
    }

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await prisma.escalationPolicy.updateMany({
        where: { teamId: existing.teamId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const policy = await prisma.escalationPolicy.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        ...(input.repeatCount !== undefined && {
          repeatCount: Math.min(input.repeatCount, this.MAX_REPEAT_COUNT)
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive })
      },
      include: { levels: { orderBy: { levelNumber: 'asc' } } }
    });

    await auditService.log({
      action: 'escalation.policy.updated',
      userId,
      teamId: existing.teamId,
      resourceType: 'escalation_policy',
      resourceId: id,
      severity: 'INFO',
      metadata: { changes: Object.keys(input) }
    });

    return policy;
  }

  async addLevel(
    policyId: string,
    input: CreateEscalationLevelInput,
    userId: string
  ): Promise<any> {
    const policy = await prisma.escalationPolicy.findUnique({
      where: { id: policyId },
      include: { levels: true }
    });

    if (!policy) {
      throw new Error('Escalation policy not found');
    }

    if (policy.levels.length >= this.MAX_LEVELS) {
      throw new Error(`Maximum ${this.MAX_LEVELS} levels allowed`);
    }

    // Validate level number is sequential
    const existingNumbers = policy.levels.map(l => l.levelNumber);
    if (existingNumbers.includes(input.levelNumber)) {
      throw new Error(`Level ${input.levelNumber} already exists`);
    }

    const level = await prisma.escalationLevel.create({
      data: {
        escalationPolicyId: policyId,
        levelNumber: input.levelNumber,
        targetType: input.targetType,
        targetId: input.targetId,
        timeoutMinutes: input.timeoutMinutes ?? 30
      }
    });

    await auditService.log({
      action: 'escalation.level.added',
      userId,
      teamId: policy.teamId,
      resourceType: 'escalation_level',
      resourceId: level.id,
      severity: 'INFO',
      metadata: { policyId, levelNumber: input.levelNumber }
    });

    return level;
  }

  async updateLevel(
    levelId: string,
    input: Partial<CreateEscalationLevelInput>,
    userId: string
  ): Promise<any> {
    const level = await prisma.escalationLevel.findUnique({
      where: { id: levelId },
      include: { escalationPolicy: { select: { teamId: true } } }
    });

    if (!level) {
      throw new Error('Escalation level not found');
    }

    const updated = await prisma.escalationLevel.update({
      where: { id: levelId },
      data: {
        ...(input.targetType && { targetType: input.targetType }),
        ...(input.targetId !== undefined && { targetId: input.targetId }),
        ...(input.timeoutMinutes && { timeoutMinutes: input.timeoutMinutes })
      }
    });

    await auditService.log({
      action: 'escalation.level.updated',
      userId,
      teamId: level.escalationPolicy.teamId,
      resourceType: 'escalation_level',
      resourceId: levelId,
      severity: 'INFO',
      metadata: { changes: Object.keys(input) }
    });

    return updated;
  }

  async removeLevel(levelId: string, userId: string): Promise<void> {
    const level = await prisma.escalationLevel.findUnique({
      where: { id: levelId },
      include: { escalationPolicy: { select: { id: true, teamId: true } } }
    });

    if (!level) {
      throw new Error('Escalation level not found');
    }

    await prisma.escalationLevel.delete({ where: { id: levelId } });

    await auditService.log({
      action: 'escalation.level.removed',
      userId,
      teamId: level.escalationPolicy.teamId,
      resourceType: 'escalation_level',
      resourceId: levelId,
      severity: 'INFO',
      metadata: { policyId: level.escalationPolicy.id, levelNumber: level.levelNumber }
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const policy = await prisma.escalationPolicy.findUnique({
      where: { id },
      include: { _count: { select: { incidents: true } } }
    });

    if (!policy) {
      throw new Error('Escalation policy not found');
    }

    // Check for active incidents using this policy
    if (policy._count.incidents > 0) {
      const activeIncidents = await prisma.incident.count({
        where: { escalationPolicyId: id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } }
      });

      if (activeIncidents > 0) {
        throw new Error(`Cannot delete policy with ${activeIncidents} active incidents`);
      }
    }

    // Hard delete (cascade deletes levels)
    await prisma.escalationPolicy.delete({ where: { id } });

    await auditService.log({
      action: 'escalation.policy.deleted',
      userId,
      teamId: policy.teamId,
      resourceType: 'escalation_policy',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: policy.name }
    });

    logger.info({ policyId: id }, 'Escalation policy deleted');
  }

  // Validation helpers
  private validateLevels(levels: CreateEscalationLevelInput[]): void {
    // Allow empty levels array - levels can be added later via addLevel()
    if (levels.length === 0) {
      return;
    }

    if (levels.length > this.MAX_LEVELS) {
      throw new Error(`Maximum ${this.MAX_LEVELS} levels allowed`);
    }

    // Check level numbers are sequential starting from 1
    const numbers = levels.map(l => l.levelNumber).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        throw new Error('Level numbers must be sequential starting from 1');
      }
    }

    // Validate timeouts
    for (const level of levels) {
      if (level.timeoutMinutes !== undefined) {
        const minTimeout = level.targetType === 'entire_team'
          ? this.MIN_TIMEOUT_MULTI_TARGET
          : this.MIN_TIMEOUT_SINGLE_TARGET;

        if (level.timeoutMinutes < minTimeout) {
          throw new Error(
            `Level ${level.levelNumber}: minimum timeout is ${minTimeout} minutes for ${level.targetType}`
          );
        }
      }

      // Validate targetId is provided for user/schedule types
      if ((level.targetType === 'user' || level.targetType === 'schedule') && !level.targetId) {
        throw new Error(`Level ${level.levelNumber}: targetId required for ${level.targetType}`);
      }
    }
  }
}

export const escalationPolicyService = new EscalationPolicyService();
