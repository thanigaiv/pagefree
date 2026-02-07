/**
 * Workflow REST API Routes
 *
 * Provides REST API endpoints for workflow CRUD operations,
 * version history, duplication, export/import, and manual trigger.
 *
 * Per user decisions:
 * - Team admin required for team workflows
 * - Platform admin required for global workflows
 * - Full version history with rollback capability
 * - Workflow duplication enabled
 * - JSON export/import
 *
 * @module routes/workflow.routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { workflowService } from '../services/workflow/workflow.service.js';
import type { AuthenticatedUser } from '../types/auth.js';
import type { WorkflowDefinition, WorkflowScope, TemplateCategory } from '../types/workflow.js';

export const workflowRoutes = Router();

// All workflow routes require authentication
workflowRoutes.use(requireAuth);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  definition: z.any(), // Validated in service
  scopeType: z.enum(['team', 'global']),
  teamId: z.string().optional(),
  isEnabled: z.boolean().optional()
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  definition: z.any().optional(),
  changeNote: z.string().max(500).optional()
});

const listWorkflowsSchema = z.object({
  teamId: z.string().optional(),
  scopeType: z.enum(['team', 'global']).optional(),
  isEnabled: z.string().transform(v => v === 'true').optional(),
  isTemplate: z.string().transform(v => v === 'true').optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

const toggleWorkflowSchema = z.object({
  enabled: z.boolean()
});

const rollbackWorkflowSchema = z.object({
  toVersion: z.number().int().min(1)
});

const importWorkflowSchema = z.object({
  json: z.object({
    name: z.string(),
    description: z.string(),
    definition: z.any(),
    scopeType: z.enum(['team', 'global']).optional(),
    templateCategory: z.string().optional()
  }),
  teamId: z.string().optional()
});

const executeWorkflowSchema = z.object({
  incidentId: z.string()
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30)
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/workflows - Create workflow
 *
 * Requires team admin for team-scoped, platform admin for global.
 */
workflowRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const workflow = await workflowService.create(input, user);

    return res.status(201).json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('required')) {
        return res.status(400).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * GET /api/workflows - List workflows
 *
 * Supports filtering by teamId, scopeType, isEnabled, isTemplate.
 * Returns paginated results with total count.
 */
workflowRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listWorkflowsSchema.parse(req.query);
    const user = req.user as AuthenticatedUser;

    const result = await workflowService.list(filters, user);

    return res.json(result);
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
 * GET /api/workflows/:id - Get workflow details
 *
 * Returns workflow with recent versions and execution statistics.
 */
workflowRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const workflow = await workflowService.get(req.params.id, user);

    return res.json({ workflow });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Permission denied')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * PUT /api/workflows/:id - Update workflow
 *
 * Creates new version snapshot on definition change.
 * Supports changeNote for version documentation.
 */
workflowRoutes.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const { changeNote, ...updateData } = input;
    const workflow = await workflowService.update(
      req.params.id,
      updateData,
      user,
      changeNote
    );

    return res.json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * DELETE /api/workflows/:id - Delete workflow
 *
 * Fails if there are active (RUNNING) executions.
 */
workflowRoutes.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    await workflowService.delete(req.params.id, user);

    return res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('active execution')) {
        return res.status(409).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * POST /api/workflows/:id/duplicate - Duplicate workflow
 *
 * Creates copy with name "(Copy)", version 1, disabled.
 * Per user decision: duplication enabled.
 */
workflowRoutes.post('/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const workflow = await workflowService.duplicate(req.params.id, user);

    return res.status(201).json({ workflow });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * PATCH /api/workflows/:id/toggle - Toggle workflow enabled/disabled
 *
 * Per user decision: toggle without deletion for temporary suspension.
 */
workflowRoutes.patch('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = toggleWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const workflow = await workflowService.toggle(req.params.id, input.enabled, user);

    return res.json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * GET /api/workflows/:id/versions - Get version history
 *
 * Per user decision: full version history with rollback capability.
 */
workflowRoutes.get('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // First verify workflow exists and user has access
    await workflowService.get(req.params.id, user);

    const versions = await workflowService.getVersionHistory(req.params.id);

    return res.json({ versions });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Permission denied')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * POST /api/workflows/:id/rollback - Rollback to previous version
 *
 * Creates new version with rolled-back definition.
 * Per user decision: rollback capability.
 */
workflowRoutes.post('/:id/rollback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rollbackWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const workflow = await workflowService.rollback(req.params.id, input.toVersion, user);

    return res.json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * GET /api/workflows/:id/export - Export workflow as JSON
 *
 * Per user decision: JSON export for backup and sharing.
 * Excludes secrets.
 */
workflowRoutes.get('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // First verify workflow exists and user has access
    await workflowService.get(req.params.id, user);

    const exportData = await workflowService.exportJson(req.params.id);

    return res.json(exportData);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Permission denied')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * POST /api/workflows/import - Import workflow from JSON
 *
 * Per user decision: JSON import for backup and sharing.
 * Creates new workflow with version 1.
 */
workflowRoutes.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = importWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    // Cast the json to the expected type - zod validates structure
    const importData = input.json as {
      name: string;
      description: string;
      definition: WorkflowDefinition;
      scopeType?: WorkflowScope;
      templateCategory?: TemplateCategory;
    };

    const workflow = await workflowService.importJson(importData, user, input.teamId);

    return res.status(201).json({ workflow });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('Invalid import format')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('required')) {
        return res.status(400).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * POST /api/workflows/:id/execute - Manual trigger workflow
 *
 * Per user decision: manual trigger button.
 */
workflowRoutes.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = executeWorkflowSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const result = await workflowService.manualTrigger(
      req.params.id,
      input.incidentId,
      user
    );

    return res.status(202).json(result);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Workflow not found' || error.message === 'Incident not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Permission denied')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('disabled')) {
        return res.status(400).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * GET /api/workflows/:id/analytics - Get execution analytics
 *
 * Per user decision: detailed execution analytics showing execution count,
 * success rate, average duration, failure points.
 */
workflowRoutes.get('/:id/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = analyticsQuerySchema.parse(req.query);
    const user = req.user as AuthenticatedUser;

    // First verify workflow exists and user has access
    await workflowService.get(req.params.id, user);

    const analytics = await workflowService.getAnalytics(req.params.id, query.days);

    return res.json({ analytics });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Workflow not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Permission denied')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});
