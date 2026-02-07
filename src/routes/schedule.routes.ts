import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { scheduleService } from '../services/schedule.service.js';
import {
  CreateScheduleInputSchema,
  UpdateScheduleInputSchema,
  ScheduleListQuerySchema
} from '../types/schedule.js';
import { AuthenticatedUser } from '../types/auth.js';

export const scheduleRouter = Router();

// All schedule routes require authentication
scheduleRouter.use(requireAuth);

// ============================================================================
// POST /api/schedules - Create schedule
// ============================================================================

scheduleRouter.post('/', async (req, res) => {
  try {
    const input = CreateScheduleInputSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    // Check if user is team admin of the target team
    const isTeamAdmin = user.teamMembers?.some(
      m => m.teamId === input.teamId && m.role === 'TEAM_ADMIN'
    );
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';

    if (!isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Must be team admin to create schedules'
      });
    }

    const schedule = await scheduleService.create(input, user.id);
    return res.status(201).json(schedule);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid schedule data',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message || 'Failed to create schedule'
    });
  }
});

// ============================================================================
// GET /api/schedules - List schedules
// ============================================================================

scheduleRouter.get('/', async (req, res) => {
  try {
    const query = ScheduleListQuerySchema.parse(req.query);
    const schedules = await scheduleService.findAll(query);
    return res.json(schedules);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: 'Failed to list schedules'
    });
  }
});

// ============================================================================
// GET /api/schedules/:id - Get schedule by ID
// ============================================================================

scheduleRouter.get('/:id', async (req, res) => {
  try {
    const schedule = await scheduleService.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    return res.json(schedule);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get schedule' });
  }
});

// ============================================================================
// GET /api/teams/:teamId/schedules - List schedules by team
// ============================================================================

scheduleRouter.get('/teams/:teamId/schedules', async (req, res) => {
  try {
    const schedules = await scheduleService.findByTeam(req.params.teamId);
    return res.json(schedules);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list team schedules' });
  }
});

// ============================================================================
// PATCH /api/schedules/:id - Update schedule
// ============================================================================

scheduleRouter.patch('/:id', async (req, res) => {
  try {
    // Get schedule to check team membership
    const existing = await scheduleService.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const user = req.user as AuthenticatedUser;

    // Check if user is team admin of the schedule's team
    const isTeamAdmin = user.teamMembers?.some(
      m => m.teamId === existing.teamId && m.role === 'TEAM_ADMIN'
    );
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';

    if (!isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Must be team admin to update schedules'
      });
    }

    const input = UpdateScheduleInputSchema.parse({ id: req.params.id, ...req.body });
    const schedule = await scheduleService.update(req.params.id, input, user.id);
    return res.json(schedule);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid schedule data',
        details: error.errors
      });
    }
    return res.status(500).json({
      error: error.message || 'Failed to update schedule'
    });
  }
});

// ============================================================================
// DELETE /api/schedules/:id - Delete schedule
// ============================================================================

scheduleRouter.delete('/:id', async (req, res) => {
  try {
    // Get schedule to check team membership
    const existing = await scheduleService.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const user = req.user as AuthenticatedUser;

    // Only team admin or platform admin can delete
    const isTeamAdmin = user.teamMembers?.some(
      m => m.teamId === existing.teamId && m.role === 'TEAM_ADMIN'
    );
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';

    if (!isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Must be team admin or platform admin to delete schedules'
      });
    }

    await scheduleService.delete(req.params.id, user.id);
    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to delete schedule'
    });
  }
});

// ============================================================================
// POST /api/schedules/:id/archive - Archive schedule
// ============================================================================

scheduleRouter.post('/:id/archive', async (req, res) => {
  try {
    // Get schedule to check team membership
    const existing = await scheduleService.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const user = req.user as AuthenticatedUser;

    // Check if user is team admin of the schedule's team
    const isTeamAdmin = user.teamMembers?.some(
      m => m.teamId === existing.teamId && m.role === 'TEAM_ADMIN'
    );
    const isPlatformAdmin = user.platformRole === 'PLATFORM_ADMIN';

    if (!isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Must be team admin to archive schedules'
      });
    }

    const schedule = await scheduleService.archive(req.params.id, user.id);
    return res.json(schedule);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Failed to archive schedule'
    });
  }
});
