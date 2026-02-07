/**
 * Workflow CRUD Service with Versioning
 *
 * Provides workflow management with full version history, duplication,
 * export/import capabilities, and template library support.
 *
 * Per user decisions:
 * - Team admin required for team workflows
 * - Full version history with rollback capability
 * - Workflow duplication enabled
 * - JSON export/import
 * - Required name and description fields
 *
 * @module services/workflow/workflow.service
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { auditService } from '../audit.service.js';
import { permissionService } from '../permission.service.js';
import { logger } from '../../config/logger.js';
import type { AuthenticatedUser } from '../../types/auth.js';
import type { WorkflowDefinition, WorkflowScope, TemplateCategory } from '../../types/workflow.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Workflow creation validation schema
 * Per user decision: name and description required
 */
export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().min(1, 'Description is required').max(500, 'Description must be 500 characters or less'),
  definition: z.any(), // Validated separately as WorkflowDefinition
  scopeType: z.enum(['team', 'global']),
  teamId: z.string().optional(),
  isEnabled: z.boolean().optional()
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  definition: z.any().optional(),
  isEnabled: z.boolean().optional()
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

// =============================================================================
// WORKFLOW SERVICE
// =============================================================================

export const workflowService = {
  /**
   * Create a new workflow
   *
   * @param data - Workflow data including name, description, definition, scope
   * @param user - Authenticated user creating the workflow
   * @returns Created workflow with version 1
   *
   * Per user decisions:
   * - Team admin required for team workflows
   * - Platform admin required for global workflows
   * - Name and description required
   */
  async create(data: CreateWorkflowInput, user: AuthenticatedUser) {
    // Validate input
    const validated = createWorkflowSchema.parse(data);

    // Permission checks per user decision
    if (validated.scopeType === 'team') {
      if (!validated.teamId) {
        throw new Error('teamId is required for team-scoped workflows');
      }

      // Check if user is team admin
      const canManage = permissionService.canManageTeam(user, validated.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to create team workflows');
      }
    } else if (validated.scopeType === 'global') {
      // Platform admin required for global workflows
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to create global workflows');
      }
    }

    // Create workflow with initial version
    const workflow = await prisma.$transaction(async (tx) => {
      // Create the workflow
      const created = await tx.workflow.create({
        data: {
          name: validated.name,
          description: validated.description,
          definition: validated.definition,
          scopeType: validated.scopeType,
          teamId: validated.teamId,
          isEnabled: validated.isEnabled ?? false,
          version: 1,
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
      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: 1,
          definition: validated.definition,
          changedById: user.id,
          changeNote: 'Initial version'
        }
      });

      return created;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.created',
      userId: user.id,
      teamId: workflow.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: workflow.id,
      metadata: {
        name: workflow.name,
        scopeType: workflow.scopeType
      }
    });

    logger.info(
      { workflowId: workflow.id, name: workflow.name, userId: user.id },
      'Workflow created'
    );

    return workflow;
  },

  /**
   * Update an existing workflow
   *
   * Creates a new version snapshot on every edit.
   * Per user decision: full version history with changeNote support.
   *
   * @param id - Workflow ID
   * @param data - Update data
   * @param user - Authenticated user
   * @param changeNote - Optional note describing the change
   */
  async update(
    id: string,
    data: UpdateWorkflowInput,
    user: AuthenticatedUser,
    changeNote?: string
  ) {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Permission check
    if (workflow.scopeType === 'team' && workflow.teamId) {
      const canManage = permissionService.canManageTeam(user, workflow.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to update workflow');
      }
    } else if (workflow.scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to update global workflow');
      }
    }

    // Validate update data
    const validated = updateWorkflowSchema.parse(data);

    // Determine if definition changed (requires new version)
    const definitionChanged = validated.definition !== undefined;
    const newVersion = definitionChanged ? workflow.version + 1 : workflow.version;

    // Update workflow and create version snapshot
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workflow.update({
        where: { id },
        data: {
          name: validated.name,
          description: validated.description,
          definition: validated.definition ?? workflow.definition,
          isEnabled: validated.isEnabled,
          version: newVersion
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
        await tx.workflowVersion.create({
          data: {
            workflowId: id,
            version: newVersion,
            definition: validated.definition,
            changedById: user.id,
            changeNote
          }
        });
      }

      return result;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.updated',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: id,
      metadata: {
        version: newVersion,
        changeNote,
        fieldsChanged: Object.keys(validated).filter(
          (k) => validated[k as keyof UpdateWorkflowInput] !== undefined
        )
      }
    });

    logger.info(
      { workflowId: id, version: newVersion, userId: user.id },
      'Workflow updated'
    );

    return updated;
  },

  /**
   * Delete a workflow
   *
   * Hard delete - cascades to versions.
   * Fails if there are active (RUNNING) executions.
   *
   * @param id - Workflow ID
   * @param user - Authenticated user
   */
  async delete(id: string, user: AuthenticatedUser) {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Permission check
    if (workflow.scopeType === 'team' && workflow.teamId) {
      const canManage = permissionService.canManageTeam(user, workflow.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to delete workflow');
      }
    } else if (workflow.scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to delete global workflow');
      }
    }

    // Check for active executions
    const activeExecutions = await prisma.workflowExecution.count({
      where: {
        workflowId: id,
        status: 'RUNNING'
      }
    });

    if (activeExecutions > 0) {
      throw new Error(
        `Cannot delete workflow with ${activeExecutions} active execution(s)`
      );
    }

    // Delete workflow (cascade deletes versions)
    await prisma.workflow.delete({
      where: { id }
    });

    // Audit log
    await auditService.log({
      action: 'workflow.deleted',
      userId: user.id,
      teamId: workflow.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: id,
      severity: 'HIGH',
      metadata: {
        name: workflow.name,
        scopeType: workflow.scopeType
      }
    });

    logger.info(
      { workflowId: id, name: workflow.name, userId: user.id },
      'Workflow deleted'
    );

    return { success: true };
  },

  /**
   * Get a workflow by ID
   *
   * Includes recent versions and execution statistics.
   *
   * @param id - Workflow ID
   * @param user - Authenticated user (for permission check)
   */
  async get(id: string, user: AuthenticatedUser) {
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        team: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 5, // Recent 5 versions
          include: {
            changedBy: {
              select: { id: true, email: true, firstName: true, lastName: true }
            }
          }
        },
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10 // Recent 10 executions
        }
      }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Permission check: team member or any user for global
    if (workflow.scopeType === 'team' && workflow.teamId) {
      const canView = permissionService.canViewTeam(user, workflow.teamId);
      if (!canView.allowed) {
        throw new Error('Permission denied to view workflow');
      }
    }

    return workflow;
  },

  /**
   * List workflows with filters and pagination
   *
   * @param filters - Filter criteria
   * @param user - Authenticated user
   */
  async list(
    filters: {
      teamId?: string;
      scopeType?: WorkflowScope;
      isEnabled?: boolean;
      isTemplate?: boolean;
      page?: number;
      limit?: number;
    },
    user: AuthenticatedUser
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (filters.teamId) {
      where.teamId = filters.teamId;
    }

    if (filters.scopeType) {
      where.scopeType = filters.scopeType;
    }

    if (filters.isEnabled !== undefined) {
      where.isEnabled = filters.isEnabled;
    }

    if (filters.isTemplate !== undefined) {
      where.isTemplate = filters.isTemplate;
    }

    // For non-platform admins, filter to accessible workflows
    if (!permissionService.isPlatformAdmin(user)) {
      const teamIds = user.teamMembers.map((m) => m.teamId);
      where.OR = [{ scopeType: 'global' }, { teamId: { in: teamIds } }];
    }

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
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
      prisma.workflow.count({ where })
    ]);

    return {
      workflows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  /**
   * Duplicate a workflow
   *
   * Creates a copy with:
   * - Name = "{original.name} (Copy)"
   * - Version = 1
   * - isEnabled = false
   *
   * Per user decision: duplication enabled.
   *
   * @param id - Source workflow ID
   * @param user - Authenticated user
   */
  async duplicate(id: string, user: AuthenticatedUser) {
    // Load source workflow
    const source = await prisma.workflow.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!source) {
      throw new Error('Workflow not found');
    }

    // Permission check: same as create
    if (source.scopeType === 'team' && source.teamId) {
      const canManage = permissionService.canManageTeam(user, source.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to duplicate workflow');
      }
    } else if (source.scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to duplicate global workflow');
      }
    }

    // Create copy
    const copy = await prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          name: `${source.name} (Copy)`,
          description: source.description,
          definition: source.definition as Prisma.InputJsonValue,
          scopeType: source.scopeType,
          teamId: source.teamId,
          isEnabled: false, // Per user decision: disabled by default
          version: 1, // Per user decision: reset version
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
      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: 1,
          definition: source.definition as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: `Duplicated from workflow "${source.name}"`
        }
      });

      return created;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.duplicated',
      userId: user.id,
      teamId: copy.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: copy.id,
      metadata: {
        sourceWorkflowId: id,
        sourceName: source.name,
        newName: copy.name
      }
    });

    logger.info(
      { workflowId: copy.id, sourceId: id, userId: user.id },
      'Workflow duplicated'
    );

    return copy;
  },

  /**
   * Toggle workflow enabled/disabled state
   *
   * Per user decision: toggle without deletion for temporary suspension.
   *
   * @param id - Workflow ID
   * @param enabled - New enabled state
   * @param user - Authenticated user
   */
  async toggle(id: string, enabled: boolean, user: AuthenticatedUser) {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Permission check
    if (workflow.scopeType === 'team' && workflow.teamId) {
      const canManage = permissionService.canManageTeam(user, workflow.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to toggle workflow');
      }
    } else if (workflow.scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to toggle global workflow');
      }
    }

    // Update enabled state
    const updated = await prisma.workflow.update({
      where: { id },
      data: { isEnabled: enabled },
      include: {
        team: true,
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    // Audit log
    await auditService.log({
      action: enabled ? 'workflow.enabled' : 'workflow.disabled',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: id,
      metadata: {
        name: workflow.name,
        enabled
      }
    });

    logger.info(
      { workflowId: id, enabled, userId: user.id },
      enabled ? 'Workflow enabled' : 'Workflow disabled'
    );

    return updated;
  },

  /**
   * Get workflow version history
   *
   * Per user decision: full version history with rollback capability.
   *
   * @param id - Workflow ID
   */
  async getVersionHistory(id: string) {
    const versions = await prisma.workflowVersion.findMany({
      where: { workflowId: id },
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
   * Rollback workflow to a previous version
   *
   * Creates a new version with the rolled-back definition.
   * Per user decision: rollback capability.
   *
   * @param id - Workflow ID
   * @param toVersion - Version number to rollback to
   * @param user - Authenticated user
   */
  async rollback(id: string, toVersion: number, user: AuthenticatedUser) {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { team: true }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Permission check
    if (workflow.scopeType === 'team' && workflow.teamId) {
      const canManage = permissionService.canManageTeam(user, workflow.teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to rollback workflow');
      }
    } else if (workflow.scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to rollback global workflow');
      }
    }

    // Load target version
    const targetVersion = await prisma.workflowVersion.findUnique({
      where: {
        workflowId_version: {
          workflowId: id,
          version: toVersion
        }
      }
    });

    if (!targetVersion) {
      throw new Error(`Version ${toVersion} not found`);
    }

    // Create new version with rolled-back definition
    const newVersion = workflow.version + 1;

    const updated = await prisma.$transaction(async (tx) => {
      // Update workflow
      const result = await tx.workflow.update({
        where: { id },
        data: {
          definition: targetVersion.definition as Prisma.InputJsonValue,
          version: newVersion
        },
        include: {
          team: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create version snapshot
      await tx.workflowVersion.create({
        data: {
          workflowId: id,
          version: newVersion,
          definition: targetVersion.definition as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: `Rolled back to version ${toVersion}`
        }
      });

      return result;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.rolledBack',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: id,
      metadata: {
        fromVersion: workflow.version,
        toVersion,
        newVersion
      }
    });

    logger.info(
      {
        workflowId: id,
        fromVersion: workflow.version,
        toVersion,
        userId: user.id
      },
      'Workflow rolled back'
    );

    return updated;
  },

  /**
   * Export workflow as JSON
   *
   * Per user decision: JSON export for backup and sharing.
   * Excludes secrets.
   *
   * @param id - Workflow ID
   */
  async exportJson(id: string) {
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: {
        team: {
          select: { name: true }
        }
      }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Build export object (excludes secrets, internal IDs)
    const exportData = {
      name: workflow.name,
      description: workflow.description,
      definition: workflow.definition as unknown as WorkflowDefinition,
      scopeType: workflow.scopeType,
      templateCategory: workflow.templateCategory,
      exportedAt: new Date().toISOString(),
      metadata: {
        version: workflow.version,
        teamName: workflow.team?.name
      }
    };

    logger.debug({ workflowId: id }, 'Workflow exported');

    return exportData;
  },

  /**
   * Import workflow from JSON
   *
   * Per user decision: JSON import for backup and sharing.
   * Creates new workflow with version 1.
   *
   * @param json - Exported workflow JSON
   * @param user - Authenticated user
   * @param teamId - Optional team ID for team-scoped import
   */
  async importJson(
    json: {
      name: string;
      description: string;
      definition: WorkflowDefinition;
      scopeType?: WorkflowScope;
      templateCategory?: TemplateCategory;
    },
    user: AuthenticatedUser,
    teamId?: string
  ) {
    // Validate required fields
    if (!json.name || !json.description || !json.definition) {
      throw new Error('Invalid import format: name, description, and definition are required');
    }

    // Determine scope
    const scopeType: WorkflowScope = json.scopeType ?? (teamId ? 'team' : 'global');

    // Permission check
    if (scopeType === 'team') {
      if (!teamId) {
        throw new Error('teamId is required for team-scoped imports');
      }

      const canManage = permissionService.canManageTeam(user, teamId);
      if (!canManage.allowed) {
        throw new Error('Team admin permissions required to import team workflow');
      }
    } else if (scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        throw new Error('Platform admin permissions required to import global workflow');
      }
    }

    // Create workflow from import
    const workflow = await prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          name: json.name,
          description: json.description,
          definition: json.definition as unknown as Prisma.InputJsonValue,
          scopeType,
          teamId,
          isEnabled: false, // Imported workflows start disabled
          version: 1,
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
      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: 1,
          definition: json.definition as unknown as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: 'Imported from JSON'
        }
      });

      return created;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.imported',
      userId: user.id,
      teamId: workflow.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: workflow.id,
      metadata: {
        name: workflow.name,
        scopeType
      }
    });

    logger.info(
      { workflowId: workflow.id, name: workflow.name, userId: user.id },
      'Workflow imported'
    );

    return workflow;
  },

  /**
   * Get execution analytics for a workflow
   *
   * Per user decision: detailed execution analytics showing execution count,
   * success rate, average duration, failure points.
   *
   * @param id - Workflow ID
   * @param days - Number of days to analyze (default 30)
   */
  async getAnalytics(id: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const executions = await prisma.workflowExecution.findMany({
      where: {
        workflowId: id,
        createdAt: { gte: startDate }
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        error: true,
        completedNodes: true
      }
    });

    // Calculate analytics
    const total = executions.length;
    const completed = executions.filter((e) => e.status === 'COMPLETED').length;
    const failed = executions.filter((e) => e.status === 'FAILED').length;
    const cancelled = executions.filter((e) => e.status === 'CANCELLED').length;

    // Calculate success rate
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    // Calculate average duration (only for completed executions)
    const completedExecutions = executions.filter(
      (e) => e.status === 'COMPLETED' && e.startedAt && e.completedAt
    );
    const totalDuration = completedExecutions.reduce((sum, e) => {
      const start = e.startedAt!.getTime();
      const end = e.completedAt!.getTime();
      return sum + (end - start);
    }, 0);
    const avgDuration = completedExecutions.length > 0
      ? totalDuration / completedExecutions.length
      : 0;

    // Find common failure points
    const failedExecutions = executions.filter((e) => e.status === 'FAILED');
    const failurePoints: Record<string, number> = {};

    for (const exec of failedExecutions) {
      const nodes = exec.completedNodes as Array<{ nodeId: string; status: string }>;
      const failedNode = nodes.find((n) => n.status === 'failed');
      if (failedNode) {
        failurePoints[failedNode.nodeId] = (failurePoints[failedNode.nodeId] || 0) + 1;
      }
    }

    // Sort failure points by count
    const sortedFailurePoints = Object.entries(failurePoints)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Top 5 failure points

    return {
      executionCount: total,
      successCount: completed,
      failedCount: failed,
      cancelledCount: cancelled,
      successRate: Math.round(successRate * 100) / 100, // 2 decimal places
      avgDurationMs: Math.round(avgDuration),
      failurePoints: sortedFailurePoints.map(([nodeId, count]) => ({
        nodeId,
        count,
        percentage: Math.round((count / failed) * 100)
      })),
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };
  },

  /**
   * Manually trigger a workflow execution
   *
   * Per user decision: manual trigger button.
   *
   * @param workflowId - Workflow ID
   * @param incidentId - Incident ID to execute against
   * @param user - Authenticated user
   */
  async manualTrigger(workflowId: string, incidentId: string, user: AuthenticatedUser) {
    // Load workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    if (!workflow.isEnabled) {
      throw new Error('Cannot trigger disabled workflow');
    }

    // Load incident
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    // Permission check: must be able to respond to incident
    const canRespond = permissionService.canRespondToIncident(user, incident.teamId);
    if (!canRespond.allowed) {
      throw new Error('Permission denied to trigger workflow on this incident');
    }

    // Create execution record
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        workflowVersion: workflow.version,
        definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
        incidentId,
        triggeredBy: 'manual',
        triggerEvent: 'manual',
        status: 'PENDING',
        completedNodes: []
      }
    });

    // Audit log
    await auditService.log({
      action: 'workflow.execution.triggered',
      userId: user.id,
      resourceType: 'workflow',
      resourceId: workflowId,
      metadata: {
        executionId: execution.id,
        incidentId,
        triggeredBy: 'manual'
      }
    });

    logger.info(
      {
        executionId: execution.id,
        workflowId,
        incidentId,
        userId: user.id
      },
      'Workflow manually triggered'
    );

    return {
      executionId: execution.id,
      status: 'PENDING'
    };
  }
};
