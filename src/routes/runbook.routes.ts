/**
 * Runbook REST API Routes
 *
 * Provides REST API endpoints for runbook CRUD operations,
 * approval workflow, version history, and execution trigger.
 *
 * Per AUTO-07/AUTO-08 requirements:
 * - Team admin for team-scoped runbooks
 * - Platform admin for global runbooks and approval
 * - Only APPROVED runbooks can be executed
 * - Parameter validation before execution
 *
 * @module routes/runbook.routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { RunbookApprovalStatus, Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { runbookService, createRunbookSchema, updateRunbookSchema } from '../services/runbook/runbook.service.js';
import { validateParameters } from '../services/runbook/runbook-executor.service.js';
import { scheduleRunbook } from '../queues/runbook.queue.js';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';
import type { AuthenticatedUser } from '../types/auth.js';
import type { RunbookParameterSchema } from '../types/runbook.js';

export const runbookRoutes = Router();

// All runbook routes require authentication
runbookRoutes.use(requireAuth);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const listRunbooksSchema = z.object({
  teamId: z.string().optional(),
  approvalStatus: z.enum(['DRAFT', 'APPROVED', 'DEPRECATED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20)
});

const rollbackSchema = z.object({
  toVersion: z.number().int().min(1)
});

const executeRunbookSchema = z.object({
  incidentId: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).default({})
});

const deprecateSchema = z.object({
  reason: z.string().max(500).optional()
});

// =============================================================================
// CRUD ROUTES
// =============================================================================

/**
 * POST /api/runbooks - Create runbook
 */
runbookRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRunbookSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const runbook = await runbookService.create(input, user);

    return res.status(201).json({ runbook });
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
 * GET /api/runbooks - List runbooks
 */
runbookRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = listRunbooksSchema.parse(req.query);
    const user = req.user as AuthenticatedUser;

    const result = await runbookService.list(
      {
        ...filters,
        approvalStatus: filters.approvalStatus as RunbookApprovalStatus | undefined
      },
      user
    );

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
 * GET /api/runbooks/:id - Get runbook details
 */
runbookRoutes.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const runbook = await runbookService.get(req.params.id, user);

    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
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
 * PUT /api/runbooks/:id - Update runbook
 */
runbookRoutes.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateRunbookSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;
    const changeNote = req.body.changeNote as string | undefined;

    const runbook = await runbookService.update(req.params.id, input, user, changeNote);

    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
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
 * DELETE /api/runbooks/:id - Delete runbook
 */
runbookRoutes.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    await runbookService.delete(req.params.id, user);

    return res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
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

// =============================================================================
// APPROVAL ROUTES
// =============================================================================

/**
 * POST /api/runbooks/:id/approve - Approve runbook (PLATFORM_ADMIN only)
 */
runbookRoutes.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const runbook = await runbookService.approve(req.params.id, user);

    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('platform admin')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('Only DRAFT')) {
        return res.status(400).json({ error: error.message });
      }
    }
    return next(error);
  }
});

/**
 * POST /api/runbooks/:id/deprecate - Deprecate runbook (PLATFORM_ADMIN only)
 */
runbookRoutes.post('/:id/deprecate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = deprecateSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;
    const runbook = await runbookService.deprecate(req.params.id, user, reason);

    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('platform admin')) {
        return res.status(403).json({ error: error.message });
      }
      if (error.message.includes('Only APPROVED')) {
        return res.status(400).json({ error: error.message });
      }
    }
    return next(error);
  }
});

// =============================================================================
// VERSION ROUTES
// =============================================================================

/**
 * GET /api/runbooks/:id/versions - Get version history
 */
runbookRoutes.get('/:id/versions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const versions = await runbookService.getVersionHistory(req.params.id);

    return res.json({ versions });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/runbooks/:id/rollback - Rollback to version
 */
runbookRoutes.post('/:id/rollback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { toVersion } = rollbackSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const runbook = await runbookService.rollback(req.params.id, toVersion, user);

    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('Version') && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissions required')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

// =============================================================================
// EXECUTION ROUTES
// =============================================================================

/**
 * POST /api/runbooks/:id/execute - Trigger execution
 *
 * Only APPROVED runbooks can be executed.
 * Parameters are validated against the runbook's JSON schema before queuing.
 */
runbookRoutes.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { incidentId, parameters } = executeRunbookSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    // Load runbook
    const runbook = await runbookService.get(req.params.id, user);

    // Check approval status (per research pitfall #1)
    if (runbook.approvalStatus !== 'APPROVED') {
      return res.status(400).json({
        error: 'Only APPROVED runbooks can be executed',
        currentStatus: runbook.approvalStatus
      });
    }

    // Validate parameters against schema (per research pitfall #3)
    const paramSchema = runbook.parameters as unknown as RunbookParameterSchema;
    const validation = validateParameters(paramSchema, parameters);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid parameters',
        details: validation.errors
      });
    }

    // If incidentId provided, verify incident exists
    if (incidentId) {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId }
      });
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }
    }

    // Create execution record (per research pitfall #2 - snapshot definition)
    const execution = await prisma.runbookExecution.create({
      data: {
        runbookId: runbook.id,
        runbookVersion: runbook.version,
        definitionSnapshot: {
          name: runbook.name,
          description: runbook.description,
          webhookUrl: runbook.webhookUrl,
          webhookMethod: runbook.webhookMethod,
          webhookHeaders: runbook.webhookHeaders,
          webhookAuth: runbook.webhookAuth,
          parameters: runbook.parameters,
          payloadTemplate: runbook.payloadTemplate,
          timeoutSeconds: runbook.timeoutSeconds
        },
        incidentId: incidentId ?? null,
        parameters: parameters as Prisma.InputJsonValue,
        status: 'PENDING',
        triggeredBy: 'manual',
        executedById: user.id
      }
    });

    // Queue for async execution
    await scheduleRunbook(execution.id, runbook.id, incidentId);

    // Audit log
    await auditService.log({
      action: 'runbook.execution.triggered',
      userId: user.id,
      teamId: runbook.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: runbook.id,
      metadata: {
        executionId: execution.id,
        incidentId,
        triggeredBy: 'manual',
        parameters
      }
    });

    logger.info(
      {
        executionId: execution.id,
        runbookId: runbook.id,
        incidentId,
        userId: user.id
      },
      'Runbook execution triggered'
    );

    return res.status(202).json({
      execution: {
        id: execution.id,
        status: 'PENDING'
      }
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues
      });
    }
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
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
 * GET /api/runbooks/:id/executions - List executions for a runbook
 */
runbookRoutes.get('/:id/executions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Verify access to runbook
    await runbookService.get(req.params.id, user);

    const executions = await prisma.runbookExecution.findMany({
      where: { runbookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        executedBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        incident: {
          select: { id: true, status: true, priority: true }
        }
      }
    });

    return res.json({ executions });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'Runbook not found') {
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
 * GET /api/runbooks/executions/:executionId - Get execution details
 */
runbookRoutes.get('/executions/:executionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const execution = await prisma.runbookExecution.findUnique({
      where: { id: req.params.executionId },
      include: {
        runbook: {
          select: { id: true, name: true, teamId: true }
        },
        executedBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        incident: {
          select: { id: true, status: true, priority: true }
        }
      }
    });

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    return res.json({ execution });
  } catch (error) {
    return next(error);
  }
});
