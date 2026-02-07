import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { integrationService } from '../services/integration.service.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { formatValidationError, createProblemDetails } from '../utils/problem-details.js';

export const integrationRouter = Router();

// All integration routes require platform admin
integrationRouter.use(requireAuth);
integrationRouter.use(requirePlatformAdmin);

// Validation schemas
const createIntegrationSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with dashes'),
  type: z.enum(['datadog', 'newrelic', 'pagerduty', 'generic']),
  signatureHeader: z.string().max(100).optional(),
  signatureAlgorithm: z.enum(['sha256', 'sha512']).optional(),
  signatureFormat: z.enum(['hex', 'base64']).optional(),
  signaturePrefix: z.string().max(50).optional(),
  deduplicationWindowMinutes: z.number().int().min(1).max(1440).optional()
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  signatureHeader: z.string().max(100).optional(),
  signatureAlgorithm: z.enum(['sha256', 'sha512']).optional(),
  signatureFormat: z.enum(['hex', 'base64']).optional(),
  signaturePrefix: z.string().max(50).optional(),
  deduplicationWindowMinutes: z.number().int().min(1).max(1440).optional(),
  isActive: z.boolean().optional()
});

/**
 * POST /api/integrations
 * Creates a new integration. Returns webhook secret ONCE.
 */
integrationRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const result = createIntegrationSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json(formatValidationError(result.error, req.path));
    return;
  }

  try {
    const integration = await integrationService.create(result.data, req.user!.id);

    res.status(201).json({
      ...integration,
      webhook_url: `/webhooks/alerts/${integration.name}`,
      warning: 'Save the webhookSecret now - it cannot be retrieved again'
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json(createProblemDetails(
        'duplicate-integration',
        'Integration name already exists',
        409,
        { detail: 'Choose a different integration name' }
      ));
      return;
    }
    throw error;
  }
});

/**
 * GET /api/integrations
 * Lists all integrations (secrets redacted).
 */
integrationRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const integrations = await integrationService.list();
  res.json({ integrations });
});

/**
 * GET /api/integrations/:id
 * Gets a single integration (secret redacted).
 */
integrationRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const integration = await integrationService.getById(req.params.id);

  if (!integration) {
    res.status(404).json(createProblemDetails(
      'integration-not-found',
      'Integration not found',
      404
    ));
    return;
  }

  res.json(integration);
});

/**
 * PATCH /api/integrations/:id
 * Updates integration configuration.
 */
integrationRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const result = updateIntegrationSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json(formatValidationError(result.error, req.path));
    return;
  }

  try {
    const integration = await integrationService.update(
      req.params.id,
      result.data,
      req.user!.id
    );

    if (!integration) {
      res.status(404).json(createProblemDetails(
        'integration-not-found',
        'Integration not found',
        404
      ));
      return;
    }

    res.json(integration);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json(createProblemDetails(
        'duplicate-integration',
        'Integration name already exists',
        409
      ));
      return;
    }
    throw error;
  }
});

/**
 * POST /api/integrations/:id/rotate-secret
 * Rotates webhook secret. Returns new secret ONCE.
 */
integrationRouter.post('/:id/rotate-secret', async (req: Request, res: Response): Promise<void> => {
  const result = await integrationService.rotateSecret(req.params.id, req.user!.id);

  if (!result) {
    res.status(404).json(createProblemDetails(
      'integration-not-found',
      'Integration not found',
      404
    ));
    return;
  }

  res.json({
    ...result,
    warning: 'Save the new webhookSecret now - it cannot be retrieved again'
  });
});

/**
 * DELETE /api/integrations/:id
 * Deletes an integration.
 */
integrationRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const deleted = await integrationService.delete(req.params.id, req.user!.id);

  if (!deleted) {
    res.status(404).json(createProblemDetails(
      'integration-not-found',
      'Integration not found',
      404
    ));
    return;
  }

  res.status(204).send();
});
