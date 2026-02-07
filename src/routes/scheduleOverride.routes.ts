import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { scheduleOverrideService } from '../services/scheduleOverride.service.js';
import {
  CreateOverrideInputSchema,
  CreateSwapInputSchema,
  OverrideListQuerySchema
} from '../types/schedule.js';
import { AuthenticatedUser } from '../types/auth.js';
import { prisma } from '../config/database.js';

export const scheduleOverrideRouter = Router();

// All override routes require authentication
scheduleOverrideRouter.use(requireAuth);

// ============================================================================
// POST /api/schedules/:scheduleId/overrides - Create override
// ============================================================================

scheduleOverrideRouter.post('/:scheduleId/overrides', async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { scheduleId } = req.params;

    // Parse and set scheduleId from params
    const input = CreateOverrideInputSchema.parse({
      ...req.body,
      scheduleId
    });

    // Load schedule to check permissions
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { team: true }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Permission: Team admin or responder on schedule's team
    const teamMember = user.teamMembers?.find(m => m.teamId === schedule.teamId);
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';

    if (!teamMember && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Must be a member of the schedule\'s team'
      });
    }

    if (teamMember && teamMember.role === 'OBSERVER' && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Observers cannot create overrides'
      });
    }

    const override = await scheduleOverrideService.createOverride(input, user.id);
    return res.status(201).json(override);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid override data',
        details: error.errors
      });
    }
    if (error.message?.includes('conflicts with existing override')) {
      return res.status(409).json({
        error: error.message
      });
    }
    return res.status(500).json({
      error: error.message || 'Failed to create override'
    });
  }
});

// ============================================================================
// POST /api/schedules/:scheduleId/swaps - Create shift swap
// ============================================================================

scheduleOverrideRouter.post('/:scheduleId/swaps', async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { scheduleId } = req.params;

    // Parse and set scheduleId from params
    const input = CreateSwapInputSchema.parse({
      ...req.body,
      scheduleId
    });

    // Load schedule to check permissions
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { team: true }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Permission: Must be the originalUserId OR team admin
    const teamMember = user.teamMembers?.find(m => m.teamId === schedule.teamId);
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';
    const isOriginalUser = input.originalUserId === user.id;
    const isTeamAdmin = teamMember?.role === 'TEAM_ADMIN';

    if (!isOriginalUser && !isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Only the original shift holder or team admins can create swaps'
      });
    }

    const swap = await scheduleOverrideService.createSwap(input, user.id);
    return res.status(201).json(swap);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid swap data',
        details: error.errors
      });
    }
    if (error.message?.includes('conflicts with existing override')) {
      return res.status(409).json({
        error: error.message
      });
    }
    return res.status(500).json({
      error: error.message || 'Failed to create swap'
    });
  }
});

// ============================================================================
// GET /api/schedules/:scheduleId/overrides - List overrides for schedule
// ============================================================================

scheduleOverrideRouter.get('/:scheduleId/overrides', async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const query = OverrideListQuerySchema.parse(req.query);

    const overrides = await scheduleOverrideService.findBySchedule(scheduleId, query);
    return res.status(200).json(overrides);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message || 'Failed to fetch overrides'
    });
  }
});

// ============================================================================
// GET /api/schedules/:scheduleId/overrides/:overrideId - Get single override
// ============================================================================

scheduleOverrideRouter.get('/:scheduleId/overrides/:overrideId', async (req, res) => {
  try {
    const { scheduleId, overrideId } = req.params;

    const override = await scheduleOverrideService.findById(overrideId);

    if (!override) {
      return res.status(404).json({ error: 'Override not found' });
    }

    // Verify override.scheduleId matches params
    if (override.scheduleId !== scheduleId) {
      return res.status(404).json({ error: 'Override not found for this schedule' });
    }

    return res.status(200).json(override);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to fetch override'
    });
  }
});

// ============================================================================
// DELETE /api/schedules/:scheduleId/overrides/:overrideId - Delete override
// ============================================================================

scheduleOverrideRouter.delete('/:scheduleId/overrides/:overrideId', async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { overrideId } = req.params;

    await scheduleOverrideService.delete(overrideId, user.id);
    return res.status(204).send();
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('Only override creator')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({
      error: error.message || 'Failed to delete override'
    });
  }
});

export default scheduleOverrideRouter;
