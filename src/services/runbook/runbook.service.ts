/**
 * Runbook CRUD Service with Approval State Machine
 *
 * Provides runbook management with versioning and PLATFORM_ADMIN approval gates.
 * Mirrors workflow.service.ts pattern exactly.
 *
 * Per AUTO-07 requirements:
 * - CRUD with versioning
 * - Approval status: DRAFT -> APPROVED -> DEPRECATED
 * - Only PLATFORM_ADMIN can approve
 * - Editing APPROVED runbook reverts to DRAFT
 *
 * @module services/runbook/runbook.service
 */

import { z } from 'zod';
import { Prisma, RunbookApprovalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { auditService } from '../audit.service.js';
import { permissionService } from '../permission.service.js';
import { logger } from '../../config/logger.js';
import type { AuthenticatedUser } from '../../types/auth.js';
import type {
  RunbookParameterSchema,
  RunbookWebhookAuth,
  RunbookDefinition
} from '../../types/runbook.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Runbook creation validation schema
 * Uses z.any() for complex JSON fields (parameters, webhookHeaders, webhookAuth)
 * similar to workflow.service.ts pattern. Type safety enforced via TypeScript types.
 */
export const createRunbookSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or less'),
  webhookUrl: z.string().url('Valid URL required'),
  webhookMethod: z.enum(['POST', 'PUT']).default('POST'),
  webhookHeaders: z.any().optional(), // Record<string, string>
  webhookAuth: z.any().optional(), // RunbookWebhookAuth
  parameters: z.any().default({ type: 'object', properties: {} }), // RunbookParameterSchema
  payloadTemplate: z.string().min(1, 'Payload template is required'),
  timeoutSeconds: z.number().int().min(30).max(900).default(300),
  teamId: z.string().optional()
});

export const updateRunbookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  webhookUrl: z.string().url().optional(),
  webhookMethod: z.enum(['POST', 'PUT']).optional(),
  webhookHeaders: z.any().optional(), // Record<string, string>
  webhookAuth: z.any().optional(), // RunbookWebhookAuth
  parameters: z.any().optional(), // RunbookParameterSchema
  payloadTemplate: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().min(30).max(900).optional()
});

export type CreateRunbookInput = z.infer<typeof createRunbookSchema>;
export type UpdateRunbookInput = z.infer<typeof updateRunbookSchema>;

// =============================================================================
// HELPER: Build definition snapshot
// =============================================================================

function buildDefinitionSnapshot(runbook: {
  name: string;
  description: string;
  webhookUrl: string;
  webhookMethod: string;
  webhookHeaders: unknown;
  webhookAuth: unknown;
  parameters: unknown;
  payloadTemplate: string;
  timeoutSeconds: number;
}): RunbookDefinition {
  return {
    name: runbook.name,
    description: runbook.description,
    webhookUrl: runbook.webhookUrl,
    webhookMethod: runbook.webhookMethod as 'POST' | 'PUT',
    webhookHeaders: (runbook.webhookHeaders as Record<string, string>) ?? {},
    webhookAuth: runbook.webhookAuth as RunbookWebhookAuth | undefined,
    parameters: runbook.parameters as RunbookParameterSchema,
    payloadTemplate: runbook.payloadTemplate,
    timeoutSeconds: runbook.timeoutSeconds
  };
}

// =============================================================================
// RUNBOOK SERVICE
// =============================================================================

export const runbookService = {
  /**
   * Create a new runbook (starts as DRAFT)
   */
  async create(data: CreateRunbookInput, user: AuthenticatedUser) {
    const validated = createRunbookSchema.parse(data);

    // Permission check: team admin for team-scoped, platform admin for global
    if (validated.teamId) {
      const canManage = permissionService.canManageTeam(user, validated.teamId);
      if (!canManage.allowed) {
        throw new Error(
          'Team admin permissions required to create team runbooks'
        );
      }
    } else {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error(
          'Platform admin permissions required to create global runbooks'
        );
      }
    }

    const runbook = await prisma.$transaction(async (tx) => {
      const created = await tx.runbook.create({
        data: {
          name: validated.name,
          description: validated.description,
          webhookUrl: validated.webhookUrl,
          webhookMethod: validated.webhookMethod,
          webhookHeaders: (validated.webhookHeaders ??
            {}) as unknown as Prisma.InputJsonValue,
          webhookAuth: (validated.webhookAuth ??
            null) as unknown as Prisma.InputJsonValue,
          parameters:
            validated.parameters as unknown as Prisma.InputJsonValue,
          payloadTemplate: validated.payloadTemplate,
          timeoutSeconds: validated.timeoutSeconds,
          teamId: validated.teamId ?? null,
          version: 1,
          approvalStatus: 'DRAFT',
          createdById: user.id
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create initial version snapshot
      await tx.runbookVersion.create({
        data: {
          runbookId: created.id,
          version: 1,
          definition: buildDefinitionSnapshot(
            created
          ) as unknown as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: 'Initial version'
        }
      });

      return created;
    });

    await auditService.log({
      action: 'runbook.created',
      userId: user.id,
      teamId: runbook.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: runbook.id,
      metadata: { name: runbook.name }
    });

    logger.info(
      { runbookId: runbook.id, name: runbook.name, userId: user.id },
      'Runbook created'
    );

    return runbook;
  },

  /**
   * Get a runbook by ID
   */
  async get(id: string, user: AuthenticatedUser) {
    const runbook = await prisma.runbook.findUnique({
      where: { id },
      include: {
        team: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        approvedBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 5,
          include: {
            changedBy: {
              select: { id: true, email: true, firstName: true, lastName: true }
            }
          }
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!runbook) {
      throw new Error('Runbook not found');
    }

    // Permission check: team member or platform admin for global
    if (runbook.teamId) {
      const canView = permissionService.canViewTeam(user, runbook.teamId);
      if (!canView.allowed) {
        throw new Error('Permission denied to view runbook');
      }
    }

    return runbook;
  },

  /**
   * List runbooks with filters and pagination
   */
  async list(
    filters: {
      teamId?: string;
      approvalStatus?: RunbookApprovalStatus;
      page?: number;
      limit?: number;
    },
    user: AuthenticatedUser
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.RunbookWhereInput = {};

    if (filters.teamId) {
      where.teamId = filters.teamId;
    }

    if (filters.approvalStatus) {
      where.approvalStatus = filters.approvalStatus;
    }

    // For non-platform admins, filter to accessible runbooks
    if (!permissionService.isPlatformAdmin(user)) {
      const teamIds = user.teamMembers.map((m) => m.teamId);
      where.OR = [{ teamId: null }, { teamId: { in: teamIds } }];
    }

    const [runbooks, total] = await Promise.all([
      prisma.runbook.findMany({
        where,
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          _count: {
            select: { executions: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.runbook.count({ where })
    ]);

    return {
      runbooks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  /**
   * Update a runbook
   *
   * IMPORTANT: If runbook is APPROVED, editing reverts it to DRAFT
   */
  async update(
    id: string,
    data: UpdateRunbookInput,
    user: AuthenticatedUser,
    changeNote?: string
  ) {
    const runbook = await prisma.runbook.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!runbook) {
      throw new Error('Runbook not found');
    }

    // Permission check
    if (runbook.teamId) {
      const canManage = permissionService.canManageTeam(user, runbook.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to update runbook');
      }
    } else {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error(
          'Platform admin permissions required to update global runbook'
        );
      }
    }

    const validated = updateRunbookSchema.parse(data);

    // Check if any definition field changed
    const definitionChanged = Object.keys(validated).length > 0;
    const newVersion = definitionChanged ? runbook.version + 1 : runbook.version;

    // Per research: editing APPROVED runbook reverts to DRAFT
    const wasApproved = runbook.approvalStatus === 'APPROVED';
    const newStatus =
      definitionChanged && wasApproved ? 'DRAFT' : runbook.approvalStatus;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.runbook.update({
        where: { id },
        data: {
          name: validated.name ?? runbook.name,
          description: validated.description ?? runbook.description,
          webhookUrl: validated.webhookUrl ?? runbook.webhookUrl,
          webhookMethod: validated.webhookMethod ?? runbook.webhookMethod,
          webhookHeaders: (validated.webhookHeaders ??
            runbook.webhookHeaders) as unknown as Prisma.InputJsonValue,
          webhookAuth: (validated.webhookAuth ??
            runbook.webhookAuth) as unknown as Prisma.InputJsonValue,
          parameters: (validated.parameters ??
            runbook.parameters) as unknown as Prisma.InputJsonValue,
          payloadTemplate: validated.payloadTemplate ?? runbook.payloadTemplate,
          timeoutSeconds: validated.timeoutSeconds ?? runbook.timeoutSeconds,
          version: newVersion,
          approvalStatus: newStatus,
          // Clear approval info if reverted to DRAFT
          approvedById: newStatus === 'DRAFT' ? null : runbook.approvedById,
          approvedAt: newStatus === 'DRAFT' ? null : runbook.approvedAt
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create version snapshot if definition changed
      if (definitionChanged) {
        await tx.runbookVersion.create({
          data: {
            runbookId: id,
            version: newVersion,
            definition: buildDefinitionSnapshot(
              result
            ) as unknown as Prisma.InputJsonValue,
            changedById: user.id,
            changeNote: wasApproved
              ? `${changeNote ?? 'Updated'} (reverted from APPROVED to DRAFT)`
              : changeNote
          }
        });
      }

      return result;
    });

    await auditService.log({
      action: 'runbook.updated',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      metadata: {
        version: newVersion,
        changeNote,
        fieldsChanged: Object.keys(validated),
        statusChanged: wasApproved && newStatus === 'DRAFT'
      }
    });

    if (wasApproved && newStatus === 'DRAFT') {
      logger.warn(
        { runbookId: id, userId: user.id },
        'Runbook reverted from APPROVED to DRAFT due to edit'
      );
    }

    logger.info(
      { runbookId: id, version: newVersion, userId: user.id },
      'Runbook updated'
    );

    return updated;
  },

  /**
   * Delete a runbook
   *
   * Fails if there are active (RUNNING) executions.
   */
  async delete(id: string, user: AuthenticatedUser) {
    const runbook = await prisma.runbook.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!runbook) {
      throw new Error('Runbook not found');
    }

    // Permission check
    if (runbook.teamId) {
      const canManage = permissionService.canManageTeam(user, runbook.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to delete runbook');
      }
    } else {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error(
          'Platform admin permissions required to delete global runbook'
        );
      }
    }

    // Check for active executions
    const activeExecutions = await prisma.runbookExecution.count({
      where: {
        runbookId: id,
        status: 'RUNNING'
      }
    });

    if (activeExecutions > 0) {
      throw new Error(
        `Cannot delete runbook with ${activeExecutions} active execution(s)`
      );
    }

    await prisma.runbook.delete({
      where: { id }
    });

    await auditService.log({
      action: 'runbook.deleted',
      userId: user.id,
      teamId: runbook.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: runbook.name }
    });

    logger.info(
      { runbookId: id, name: runbook.name, userId: user.id },
      'Runbook deleted'
    );

    return { success: true };
  },

  /**
   * Approve a runbook (PLATFORM_ADMIN only)
   *
   * Transitions: DRAFT -> APPROVED
   * Creates version snapshot on approval.
   */
  async approve(id: string, user: AuthenticatedUser) {
    if (!permissionService.isPlatformAdmin(user)) {
      throw new Error('Only platform admins can approve runbooks');
    }

    const runbook = await prisma.runbook.findUnique({ where: { id } });
    if (!runbook) {
      throw new Error('Runbook not found');
    }

    if (runbook.approvalStatus !== 'DRAFT') {
      throw new Error('Only DRAFT runbooks can be approved');
    }

    const newVersion = runbook.version + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.runbook.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          version: newVersion
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          approvedBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create version snapshot for approval
      await tx.runbookVersion.create({
        data: {
          runbookId: id,
          version: newVersion,
          definition: buildDefinitionSnapshot(
            result
          ) as unknown as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: 'Approved for production'
        }
      });

      return result;
    });

    await auditService.log({
      action: 'runbook.approved',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: runbook.name, version: newVersion }
    });

    logger.info(
      {
        runbookId: id,
        name: runbook.name,
        approvedById: user.id,
        version: newVersion
      },
      'Runbook approved'
    );

    return updated;
  },

  /**
   * Deprecate a runbook (PLATFORM_ADMIN only)
   *
   * Transitions: APPROVED -> DEPRECATED
   * Deprecated runbooks cannot be executed.
   */
  async deprecate(id: string, user: AuthenticatedUser, reason?: string) {
    if (!permissionService.isPlatformAdmin(user)) {
      throw new Error('Only platform admins can deprecate runbooks');
    }

    const runbook = await prisma.runbook.findUnique({ where: { id } });
    if (!runbook) {
      throw new Error('Runbook not found');
    }

    if (runbook.approvalStatus !== 'APPROVED') {
      throw new Error('Only APPROVED runbooks can be deprecated');
    }

    const newVersion = runbook.version + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.runbook.update({
        where: { id },
        data: {
          approvalStatus: 'DEPRECATED',
          version: newVersion
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create version snapshot for deprecation
      await tx.runbookVersion.create({
        data: {
          runbookId: id,
          version: newVersion,
          definition: buildDefinitionSnapshot(
            result
          ) as unknown as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: reason ?? 'Deprecated'
        }
      });

      return result;
    });

    await auditService.log({
      action: 'runbook.deprecated',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: runbook.name, reason, version: newVersion }
    });

    logger.info(
      {
        runbookId: id,
        name: runbook.name,
        deprecatedById: user.id,
        reason
      },
      'Runbook deprecated'
    );

    return updated;
  },

  /**
   * Get version history for a runbook
   */
  async getVersionHistory(id: string) {
    const versions = await prisma.runbookVersion.findMany({
      where: { runbookId: id },
      orderBy: { version: 'desc' },
      include: {
        changedBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    return versions;
  },

  /**
   * Rollback to a previous version
   *
   * Creates new version with rolled-back definition.
   * NOTE: Rollback sets status to DRAFT (requires re-approval).
   */
  async rollback(id: string, toVersion: number, user: AuthenticatedUser) {
    const runbook = await prisma.runbook.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!runbook) {
      throw new Error('Runbook not found');
    }

    // Permission check
    if (runbook.teamId) {
      const canManage = permissionService.canManageTeam(user, runbook.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to rollback runbook');
      }
    } else {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error(
          'Platform admin permissions required to rollback global runbook'
        );
      }
    }

    const targetVersion = await prisma.runbookVersion.findUnique({
      where: {
        runbookId_version: {
          runbookId: id,
          version: toVersion
        }
      }
    });

    if (!targetVersion) {
      throw new Error(`Version ${toVersion} not found`);
    }

    const definition = targetVersion.definition as unknown as RunbookDefinition;
    const newVersion = runbook.version + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.runbook.update({
        where: { id },
        data: {
          name: definition.name,
          description: definition.description,
          webhookUrl: definition.webhookUrl,
          webhookMethod: definition.webhookMethod,
          webhookHeaders:
            definition.webhookHeaders as unknown as Prisma.InputJsonValue,
          webhookAuth: (definition.webhookAuth ??
            null) as unknown as Prisma.InputJsonValue,
          parameters: definition.parameters as unknown as Prisma.InputJsonValue,
          payloadTemplate: definition.payloadTemplate,
          timeoutSeconds: definition.timeoutSeconds,
          version: newVersion,
          // Rollback reverts to DRAFT (requires re-approval)
          approvalStatus: 'DRAFT',
          approvedById: null,
          approvedAt: null
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      await tx.runbookVersion.create({
        data: {
          runbookId: id,
          version: newVersion,
          definition: targetVersion.definition as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: `Rolled back to version ${toVersion}`
        }
      });

      return result;
    });

    await auditService.log({
      action: 'runbook.rolledBack',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      metadata: {
        fromVersion: runbook.version,
        toVersion,
        newVersion
      }
    });

    logger.info(
      {
        runbookId: id,
        fromVersion: runbook.version,
        toVersion,
        userId: user.id
      },
      'Runbook rolled back'
    );

    return updated;
  }
};
