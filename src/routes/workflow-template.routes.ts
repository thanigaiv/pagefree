/**
 * Workflow Template Library Routes
 *
 * Provides REST API endpoints for the template library:
 * - List templates with category filtering
 * - Get template details
 * - Create workflow from template
 * - CRUD operations for templates (platform admin only)
 *
 * Per user decisions:
 * - Template library organized by categories (Ticketing, Communication, Auto-resolution)
 * - Anyone can view templates
 * - Team admin required to create workflow from template
 * - Platform admin required to manage templates
 *
 * @module routes/workflow-template.routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';
import { permissionService } from '../services/permission.service.js';
import { logger } from '../config/logger.js';
import type { AuthenticatedUser } from '../types/auth.js';
import type { WorkflowDefinition, TemplateCategory } from '../types/workflow.js';

export const workflowTemplateRoutes = Router();

// All template routes require authentication
workflowTemplateRoutes.use(requireAuth);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const listTemplatesSchema = z.object({
  category: z.enum(['Ticketing', 'Communication', 'Auto-resolution']).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  definition: z.any(), // Validated separately
  category: z.enum(['Ticketing', 'Communication', 'Auto-resolution'])
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  definition: z.any().optional(),
  category: z.enum(['Ticketing', 'Communication', 'Auto-resolution']).optional()
});

const useTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  teamId: z.string().optional(),
  customizations: z.record(z.string(), z.any()).optional()
});

// =============================================================================
// TEMPLATE CATEGORIES
// =============================================================================

/**
 * Default templates by category (per user decision)
 * These can be seeded into the database via migration or startup script.
 */
export const DEFAULT_TEMPLATES: Array<{
  name: string;
  description: string;
  category: TemplateCategory;
  definition: WorkflowDefinition;
}> = [
  // Ticketing category
  {
    name: 'Create Jira Ticket on Critical Incident',
    description: 'Automatically creates a Jira ticket when a critical incident is created',
    category: 'Ticketing',
    definition: {
      id: 'tpl-jira-critical',
      name: 'Create Jira Ticket on Critical Incident',
      description: 'Automatically creates a Jira ticket when a critical incident is created',
      version: 1,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {
            name: 'Incident Created',
            triggerType: 'incident_created',
            conditions: [{ field: 'priority', value: 'CRITICAL' }]
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 200 },
          data: {
            name: 'Create Jira Ticket',
            actionType: 'jira',
            config: {
              projectKey: 'ONCALL',
              issueType: 'Incident',
              summary: '[OnCall] {{incident.title}}',
              description: 'Incident: {{incident.title}}\nPriority: {{incident.priority}}\nTeam: {{team.name}}\n\nView incident: https://oncall.example.com/incidents/{{incident.id}}',
              priority: 'High',
              labels: ['oncall', 'auto-created']
            },
            retry: { attempts: 3, backoff: 'exponential', initialDelayMs: 1000 }
          }
        }
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      trigger: {
        type: 'incident_created',
        conditions: [{ field: 'priority', value: 'CRITICAL' }]
      },
      settings: { timeout: '5min', enabled: true }
    }
  },
  {
    name: 'Create Linear Issue for High Priority',
    description: 'Creates a Linear issue when a high priority incident is created',
    category: 'Ticketing',
    definition: {
      id: 'tpl-linear-high',
      name: 'Create Linear Issue for High Priority',
      description: 'Creates a Linear issue when a high priority incident is created',
      version: 1,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {
            name: 'Incident Created',
            triggerType: 'incident_created',
            conditions: [{ field: 'priority', value: 'HIGH' }]
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 200 },
          data: {
            name: 'Create Linear Issue',
            actionType: 'linear',
            config: {
              teamId: '{{workflow.linearTeamId}}',
              title: '[OnCall] {{incident.title}}',
              description: 'Incident from OnCall\n\n**Priority:** {{incident.priority}}\n**Team:** {{team.name}}\n\n[View Incident](https://oncall.example.com/incidents/{{incident.id}})',
              priority: 2
            },
            retry: { attempts: 3, backoff: 'exponential', initialDelayMs: 1000 }
          }
        }
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      trigger: {
        type: 'incident_created',
        conditions: [{ field: 'priority', value: 'HIGH' }]
      },
      settings: { timeout: '5min', enabled: true }
    }
  },

  // Communication category
  {
    name: 'Post to Slack on State Change',
    description: 'Sends a Slack message when incident state changes',
    category: 'Communication',
    definition: {
      id: 'tpl-slack-state-change',
      name: 'Post to Slack on State Change',
      description: 'Sends a Slack message when incident state changes',
      version: 1,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {
            name: 'State Changed',
            triggerType: 'state_changed',
            conditions: [],
            stateTransition: { to: 'ACKNOWLEDGED' }
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 200 },
          data: {
            name: 'Post to Slack',
            actionType: 'webhook',
            config: {
              url: '{{workflow.slackWebhookUrl}}',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{"text": "Incident {{incident.id}} acknowledged by {{assignee.firstName}} {{assignee.lastName}}", "channel": "{{team.slackChannel}}"}',
              auth: { type: 'none' }
            },
            retry: { attempts: 3, backoff: 'exponential', initialDelayMs: 1000 }
          }
        }
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      trigger: {
        type: 'state_changed',
        conditions: [],
        stateTransition: { to: 'ACKNOWLEDGED' }
      },
      settings: { timeout: '1min', enabled: true }
    }
  },
  {
    name: 'Webhook Notification on Resolution',
    description: 'Sends a webhook notification when an incident is resolved',
    category: 'Communication',
    definition: {
      id: 'tpl-webhook-resolved',
      name: 'Webhook Notification on Resolution',
      description: 'Sends a webhook notification when an incident is resolved',
      version: 1,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {
            name: 'State Changed to Resolved',
            triggerType: 'state_changed',
            conditions: [],
            stateTransition: { to: 'RESOLVED' }
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 200 },
          data: {
            name: 'Send Webhook',
            actionType: 'webhook',
            config: {
              url: '{{workflow.webhookUrl}}',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{"event": "incident.resolved", "incident_id": "{{incident.id}}", "title": "{{incident.title}}", "resolved_at": "{{incident.resolvedAt}}", "team": "{{team.name}}"}',
              auth: { type: 'none' }
            },
            retry: { attempts: 3, backoff: 'exponential', initialDelayMs: 1000 }
          }
        }
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      trigger: {
        type: 'state_changed',
        conditions: [],
        stateTransition: { to: 'RESOLVED' }
      },
      settings: { timeout: '1min', enabled: true }
    }
  },

  // Auto-resolution category
  {
    name: 'Auto-acknowledge Low Priority After 1 Hour',
    description: 'Automatically acknowledges low priority incidents if unacknowledged for 1 hour',
    category: 'Auto-resolution',
    definition: {
      id: 'tpl-auto-ack-low',
      name: 'Auto-acknowledge Low Priority After 1 Hour',
      description: 'Automatically acknowledges low priority incidents if unacknowledged for 1 hour',
      version: 1,
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: {
            name: 'Incident Age Trigger',
            triggerType: 'age',
            conditions: [{ field: 'priority', value: 'LOW' }],
            ageThresholdMinutes: 60
          }
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 250, y: 200 },
          data: {
            name: 'Auto-acknowledge',
            actionType: 'webhook',
            config: {
              url: '{{workflow.apiUrl}}/api/incidents/{{incident.id}}/acknowledge',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{"note": "Auto-acknowledged after 1 hour of inactivity"}',
              auth: { type: 'bearer', token: '{{workflow.apiToken}}' }
            },
            retry: { attempts: 3, backoff: 'exponential', initialDelayMs: 1000 }
          }
        }
      ],
      edges: [{ id: 'e1', source: 'trigger-1', target: 'action-1' }],
      trigger: {
        type: 'age',
        conditions: [{ field: 'priority', value: 'LOW' }],
        ageThresholdMinutes: 60
      },
      settings: { timeout: '5min', enabled: true }
    }
  }
];

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/workflow-templates - List templates
 *
 * Anyone can view templates (per user decision).
 * Supports filtering by category and search.
 */
workflowTemplateRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listTemplatesSchema.parse(req.query);
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.WorkflowWhereInput = {
      isTemplate: true
    };

    if (query.category) {
      where.templateCategory = query.category;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          templateCategory: true,
          createdAt: true,
          updatedAt: true,
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          _count: {
            select: { executions: true }
          }
        },
        orderBy: [
          { templateCategory: 'asc' },
          { name: 'asc' }
        ],
        skip,
        take: limit
      }),
      prisma.workflow.count({ where })
    ]);

    // Get category counts
    const categoryCounts = await prisma.workflow.groupBy({
      by: ['templateCategory'],
      where: { isTemplate: true },
      _count: true
    });

    const categories = {
      Ticketing: categoryCounts.find(c => c.templateCategory === 'Ticketing')?._count ?? 0,
      Communication: categoryCounts.find(c => c.templateCategory === 'Communication')?._count ?? 0,
      'Auto-resolution': categoryCounts.find(c => c.templateCategory === 'Auto-resolution')?._count ?? 0
    };

    return res.json({
      templates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      categories
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }
    return next(error);
  }
});

/**
 * GET /api/workflow-templates/:id - Get template details
 *
 * Returns template with full definition.
 */
workflowTemplateRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.workflow.findUnique({
      where: {
        id: req.params.id,
        isTemplate: true
      },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json({ template });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/workflow-templates/:id/use - Create workflow from template
 *
 * Creates a new workflow based on the template.
 * Per user decision: team admin required for team-scoped workflows.
 */
workflowTemplateRoutes.post('/:id/use', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = useTemplateSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    // Load template
    const template = await prisma.workflow.findUnique({
      where: {
        id: req.params.id,
        isTemplate: true
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Determine scope
    const scopeType = input.teamId ? 'team' : 'global';

    // Permission check
    if (scopeType === 'team' && input.teamId) {
      const canManage = permissionService.canManageTeam(user, input.teamId);
      if (!canManage.allowed) {
        return res.status(403).json({ error: 'Team admin permissions required' });
      }
    } else if (scopeType === 'global') {
      if (!permissionService.isPlatformAdmin(user)) {
        return res.status(403).json({ error: 'Platform admin permissions required' });
      }
    }

    // Create workflow from template
    const workflow = await prisma.$transaction(async (tx) => {
      // Merge customizations into definition if provided
      let definition = template.definition as unknown as WorkflowDefinition;
      if (input.customizations) {
        definition = {
          ...definition,
          ...input.customizations
        };
      }

      const created = await tx.workflow.create({
        data: {
          name: input.name,
          description: input.description,
          definition: definition as unknown as Prisma.InputJsonValue,
          scopeType,
          teamId: input.teamId,
          isEnabled: false, // New workflows start disabled
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

      // Create initial version
      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: 1,
          definition: definition as unknown as Prisma.InputJsonValue,
          changedById: user.id,
          changeNote: `Created from template "${template.name}"`
        }
      });

      return created;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.created_from_template',
      userId: user.id,
      teamId: workflow.teamId ?? undefined,
      resourceType: 'workflow',
      resourceId: workflow.id,
      metadata: {
        templateId: template.id,
        templateName: template.name
      }
    });

    logger.info(
      { workflowId: workflow.id, templateId: template.id, userId: user.id },
      'Workflow created from template'
    );

    return res.status(201).json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    return next(error);
  }
});

/**
 * POST /api/workflow-templates - Create template (platform admin only)
 */
workflowTemplateRoutes.post('/', requirePlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createTemplateSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          name: input.name,
          description: input.description,
          definition: input.definition,
          scopeType: 'global', // Templates are always global
          isTemplate: true,
          templateCategory: input.category,
          isEnabled: true, // Templates are always "enabled" (available)
          version: 1,
          createdById: user.id
        },
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create initial version
      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: 1,
          definition: input.definition,
          changedById: user.id,
          changeNote: 'Initial template version'
        }
      });

      return created;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.template.created',
      userId: user.id,
      resourceType: 'workflow',
      resourceId: template.id,
      severity: 'HIGH',
      metadata: {
        name: template.name,
        category: template.templateCategory
      }
    });

    logger.info(
      { templateId: template.id, name: template.name, userId: user.id },
      'Template created'
    );

    return res.status(201).json({ template });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    return next(error);
  }
});

/**
 * PUT /api/workflow-templates/:id - Update template (platform admin only)
 */
workflowTemplateRoutes.put('/:id', requirePlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateTemplateSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    // Load template
    const existing = await prisma.workflow.findUnique({
      where: {
        id: req.params.id,
        isTemplate: true
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const definitionChanged = input.definition !== undefined;
    const newVersion = definitionChanged ? existing.version + 1 : existing.version;

    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id: req.params.id },
        data: {
          name: input.name,
          description: input.description,
          definition: input.definition ?? existing.definition,
          templateCategory: input.category,
          version: newVersion
        },
        include: {
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true }
          }
        }
      });

      // Create version snapshot if definition changed
      if (definitionChanged) {
        await tx.workflowVersion.create({
          data: {
            workflowId: req.params.id,
            version: newVersion,
            definition: input.definition,
            changedById: user.id,
            changeNote: 'Template updated'
          }
        });
      }

      return updated;
    });

    // Audit log
    await auditService.log({
      action: 'workflow.template.updated',
      userId: user.id,
      resourceType: 'workflow',
      resourceId: template.id,
      metadata: {
        name: template.name,
        version: newVersion
      }
    });

    logger.info(
      { templateId: template.id, version: newVersion, userId: user.id },
      'Template updated'
    );

    return res.json({ template });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    return next(error);
  }
});

/**
 * DELETE /api/workflow-templates/:id - Delete template (platform admin only)
 */
workflowTemplateRoutes.delete('/:id', requirePlatformAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Load template
    const template = await prisma.workflow.findUnique({
      where: {
        id: req.params.id,
        isTemplate: true
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete template (cascade deletes versions)
    await prisma.workflow.delete({
      where: { id: req.params.id }
    });

    // Audit log
    await auditService.log({
      action: 'workflow.template.deleted',
      userId: user.id,
      resourceType: 'workflow',
      resourceId: req.params.id,
      severity: 'HIGH',
      metadata: {
        name: template.name,
        category: template.templateCategory
      }
    });

    logger.info(
      { templateId: req.params.id, name: template.name, userId: user.id },
      'Template deleted'
    );

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/workflow-templates/categories - Get available categories
 *
 * Returns the available template categories.
 */
workflowTemplateRoutes.get('/categories/list', async (_req: Request, res: Response) => {
  return res.json({
    categories: [
      { id: 'Ticketing', name: 'Ticketing', description: 'Create tickets in Jira, Linear, and other issue trackers' },
      { id: 'Communication', name: 'Communication', description: 'Send notifications to Slack, webhooks, and other channels' },
      { id: 'Auto-resolution', name: 'Auto-resolution', description: 'Automatically acknowledge or resolve incidents based on conditions' }
    ]
  });
});
