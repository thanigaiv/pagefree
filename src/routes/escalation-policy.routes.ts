import { Router, Request, Response, NextFunction } from 'express';
import { escalationPolicyService } from '../services/escalation-policy.service.js';
import { permissionService } from '../services/permission.service.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedUser } from '../types/auth.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/escalation-policies/teams/:teamId - List team's policies
router.get('/teams/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';
    const user = req.user as AuthenticatedUser;

    // Any team member can view policies
    const permission = permissionService.canViewTeam(user, teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const policies = await escalationPolicyService.getByTeam(teamId, includeInactive);
    return res.json({ policies });
  } catch (error) {
    return next(error);
  }
});

// GET /api/escalation-policies/:id - Get policy by ID
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const policy = await escalationPolicyService.getById(req.params.id);

    if (!policy) {
      return res.status(404).json({ error: 'Escalation policy not found' });
    }

    // Check team membership
    const permission = permissionService.canViewTeam(user, policy.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    return res.json({ policy });
  } catch (error) {
    return next(error);
  }
});

// POST /api/escalation-policies - Create policy
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, name, description, isDefault, repeatCount, levels } = req.body;
    const user = req.user as AuthenticatedUser;

    if (!teamId || !name) {
      return res.status(400).json({
        error: 'teamId and name are required'
      });
    }

    // Validate levels array if provided
    if (levels && !Array.isArray(levels)) {
      return res.status(400).json({
        error: 'levels must be an array'
      });
    }

    // Team admin required to create policies
    const permission = permissionService.canManageTeam(user, teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const policy = await escalationPolicyService.create(
      { teamId, name, description, isDefault, repeatCount, levels: levels || [] },
      user.id
    );

    return res.status(201).json({ policy });
  } catch (error: any) {
    if (error.message.includes('required') || error.message.includes('validation')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// PATCH /api/escalation-policies/:id - Update policy
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const existing = await escalationPolicyService.getById(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Escalation policy not found' });
    }

    // Team admin required
    const permission = permissionService.canManageTeam(user, existing.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { name, description, isDefault, repeatCount, isActive } = req.body;
    const policy = await escalationPolicyService.update(
      req.params.id,
      { name, description, isDefault, repeatCount, isActive },
      user.id
    );

    return res.json({ policy });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return next(error);
  }
});

// DELETE /api/escalation-policies/:id - Delete policy
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const existing = await escalationPolicyService.getById(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Escalation policy not found' });
    }

    // Team admin required
    const permission = permissionService.canManageTeam(user, existing.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    await escalationPolicyService.delete(req.params.id, user.id);
    return res.status(204).send();
  } catch (error: any) {
    if (error.message.includes('Cannot delete') || error.message.includes('active incidents')) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  }
});

// POST /api/escalation-policies/:id/levels - Add level
router.post('/:id/levels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const existing = await escalationPolicyService.getById(req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Escalation policy not found' });
    }

    const permission = permissionService.canManageTeam(user, existing.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { levelNumber, targetType, targetId, timeoutMinutes } = req.body;

    if (!levelNumber || !targetType) {
      return res.status(400).json({ error: 'levelNumber and targetType are required' });
    }

    const level = await escalationPolicyService.addLevel(
      req.params.id,
      { levelNumber, targetType, targetId, timeoutMinutes },
      user.id
    );

    return res.status(201).json({ level });
  } catch (error: any) {
    if (error.message.includes('already exists') || error.message.includes('Maximum')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// PATCH /api/escalation-policies/levels/:levelId - Update level
router.patch('/levels/:levelId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { targetType, targetId, timeoutMinutes } = req.body;

    const level = await escalationPolicyService.updateLevel(
      req.params.levelId,
      { targetType, targetId, timeoutMinutes },
      user.id
    );

    return res.json({ level });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return next(error);
  }
});

// DELETE /api/escalation-policies/levels/:levelId - Remove level
router.delete('/levels/:levelId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    await escalationPolicyService.removeLevel(req.params.levelId, user.id);
    return res.status(204).send();
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return next(error);
  }
});

export const escalationPolicyRoutes = router;
