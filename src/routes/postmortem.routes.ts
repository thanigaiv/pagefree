import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { postmortemService } from '../services/postmortem.service.js';
import { actionItemService } from '../services/actionItem.service.js';
import { permissionService } from '../services/permission.service.js';
import { logger } from '../config/logger.js';
import { AuthenticatedUser } from '../types/auth.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createPostmortemSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  incidentIds: z.array(z.string()).min(1, 'At least one incident is required'),
  teamId: z.string()
});

const updatePostmortemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  incidentIds: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional()
});

const createActionItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  assigneeId: z.string(),
  dueDate: z.string().datetime().optional()
});

const updateActionItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED']).optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional()
});

// ============================================================================
// POSTMORTEM ROUTES
// ============================================================================

/**
 * GET /postmortems - List postmortems
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.query;
    const postmortems = await postmortemService.list(
      teamId ? { teamId: teamId as string } : undefined
    );
    return res.json({ postmortems });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /postmortems/me/action-items - Get current user's assigned action items
 * IMPORTANT: Must be before /:id to avoid "me" being treated as an ID
 */
router.get('/me/action-items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { status } = req.query;

    const actionItems = await actionItemService.listByAssignee(
      user.id,
      status as 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | undefined
    );

    return res.json({ actionItems });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /postmortems/:id - Get postmortem by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postmortem = await postmortemService.getById(req.params.id);

    if (!postmortem) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    return res.json({ postmortem });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /postmortems/:id/timeline - Get timeline from linked incidents' audit events
 */
router.get('/:id/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postmortem = await postmortemService.getById(req.params.id);

    if (!postmortem) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    const timeline = await postmortemService.getTimeline(postmortem.incidentIds);
    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /postmortems - Create postmortem
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Validate input
    const result = createPostmortemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      });
    }

    const { title, content, incidentIds, teamId } = result.data;

    // Check permission: Responder+ on team
    const canCreate = permissionService.hasMinimumTeamRole(user, teamId, 'RESPONDER');
    if (!canCreate) {
      return res.status(403).json({ error: 'Responder or higher role required on this team' });
    }

    const postmortem = await postmortemService.create(
      { title, content, incidentIds, teamId },
      user.id
    );

    logger.info({ postmortemId: postmortem.id, userId: user.id }, 'Postmortem created via API');
    return res.status(201).json({ postmortem });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /postmortems/:id - Update postmortem
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Validate input
    const result = updatePostmortemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      });
    }

    // Fetch existing postmortem
    const existing = await postmortemService.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    // Check permission: Responder+ on team
    const canUpdate = permissionService.hasMinimumTeamRole(user, existing.teamId, 'RESPONDER');
    if (!canUpdate) {
      return res.status(403).json({ error: 'Responder or higher role required on this team' });
    }

    const postmortem = await postmortemService.update(req.params.id, result.data, user.id);
    return res.json({ postmortem });
  } catch (error: any) {
    // Handle invalid status transition
    if (error.message?.includes('Invalid status transition')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * DELETE /postmortems/:id - Delete postmortem
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Fetch existing postmortem
    const existing = await postmortemService.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    // Check permission: Team Admin only
    const canDelete = permissionService.hasMinimumTeamRole(user, existing.teamId, 'TEAM_ADMIN');
    if (!canDelete) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    await postmortemService.delete(req.params.id, user.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// ACTION ITEM ROUTES (nested under postmortem)
// ============================================================================

/**
 * POST /postmortems/:id/action-items - Create action item
 */
router.post('/:id/action-items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Validate input
    const result = createActionItemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      });
    }

    // Fetch postmortem to check team permission
    const postmortem = await postmortemService.getById(req.params.id);
    if (!postmortem) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    // Check permission: Responder+ on team
    const canCreate = permissionService.hasMinimumTeamRole(user, postmortem.teamId, 'RESPONDER');
    if (!canCreate) {
      return res.status(403).json({ error: 'Responder or higher role required on this team' });
    }

    const actionItem = await actionItemService.create(req.params.id, result.data, user.id);
    return res.status(201).json({ actionItem });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /postmortems/:postmortemId/action-items/:itemId - Update action item
 */
router.put('/:postmortemId/action-items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Validate input
    const result = updateActionItemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors
      });
    }

    // Fetch action item to check ownership
    const actionItem = await actionItemService.getById(req.params.itemId);
    if (!actionItem || actionItem.postmortemId !== req.params.postmortemId) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    // Fetch postmortem for team permission check
    const postmortem = await postmortemService.getById(req.params.postmortemId);
    if (!postmortem) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    // Check permission: Responder+ on team OR assignee
    const isTeamResponder = permissionService.hasMinimumTeamRole(user, postmortem.teamId, 'RESPONDER');
    const isAssignee = actionItem.assigneeId === user.id;

    if (!isTeamResponder && !isAssignee) {
      return res.status(403).json({ error: 'Responder role or assignee required' });
    }

    const updated = await actionItemService.update(req.params.itemId, result.data, user.id);
    return res.json({ actionItem: updated });
  } catch (error: any) {
    // Handle invalid status transition
    if (error.message?.includes('Invalid status transition')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * DELETE /postmortems/:postmortemId/action-items/:itemId - Delete action item
 */
router.delete('/:postmortemId/action-items/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    // Fetch action item to verify it belongs to this postmortem
    const actionItem = await actionItemService.getById(req.params.itemId);
    if (!actionItem || actionItem.postmortemId !== req.params.postmortemId) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    // Fetch postmortem for team permission check
    const postmortem = await postmortemService.getById(req.params.postmortemId);
    if (!postmortem) {
      return res.status(404).json({ error: 'Postmortem not found' });
    }

    // Check permission: Responder+ on team
    const canDelete = permissionService.hasMinimumTeamRole(user, postmortem.teamId, 'RESPONDER');
    if (!canDelete) {
      return res.status(403).json({ error: 'Responder or higher role required on this team' });
    }

    await actionItemService.delete(req.params.itemId, user.id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export const postmortemRouter = router;
