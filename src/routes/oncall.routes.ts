import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { onCallService } from '../services/oncall.service.js';
import { z } from 'zod';

const router = Router();

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

const OnCallNowQuerySchema = z.object({
  scheduleId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  at: z.string().datetime().optional()
});

const OnCallAtQuerySchema = z.object({
  at: z.string().datetime().optional()
});

const TimelineQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

const UpcomingShiftsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
});

// ============================================================================
// GET /api/oncall/now
// ============================================================================

router.get('/now', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = OnCallNowQuerySchema.parse(req.query);

    // Validate that at least one filter is provided
    if (!query.scheduleId && !query.teamId) {
      return res.status(400).json({
        error: 'Must provide either scheduleId or teamId parameter'
      });
    }

    const result = await onCallService.getCurrentOnCall({
      scheduleId: query.scheduleId,
      teamId: query.teamId,
      at: query.at ? new Date(query.at) : undefined
    });

    if (!result) {
      return res.status(404).json({
        error: 'No on-call user found for the specified query'
      });
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }

    console.error('Error fetching on-call:', error);
    return res.status(500).json({
      error: 'Failed to fetch on-call information'
    });
  }
});

// ============================================================================
// GET /api/teams/:teamId/oncall
// ============================================================================

router.get('/teams/:teamId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const query = OnCallAtQuerySchema.parse(req.query);

    const results = await onCallService.getOnCallForTeam(
      teamId,
      query.at ? new Date(query.at) : undefined
    );

    return res.json(results);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }

    console.error('Error fetching team on-call:', error);
    return res.status(500).json({
      error: 'Failed to fetch team on-call information'
    });
  }
});

// ============================================================================
// GET /api/schedules/:scheduleId/oncall
// ============================================================================

router.get('/schedules/:scheduleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const query = OnCallAtQuerySchema.parse(req.query);

    const result = await onCallService.getCurrentOnCall({
      scheduleId,
      at: query.at ? new Date(query.at) : undefined
    });

    if (!result) {
      return res.status(404).json({
        error: 'No on-call user found for the specified schedule'
      });
    }

    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }

    console.error('Error fetching schedule on-call:', error);
    return res.status(500).json({
      error: 'Failed to fetch schedule on-call information'
    });
  }
});

// ============================================================================
// GET /api/schedules/:scheduleId/timeline
// ============================================================================

router.get('/schedules/:scheduleId/timeline', requireAuth, async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const query = TimelineQuerySchema.parse(req.query);

    const timeline = await onCallService.getScheduleTimeline(
      scheduleId,
      new Date(query.startDate),
      new Date(query.endDate)
    );

    return res.json(timeline);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }

    console.error('Error fetching schedule timeline:', error);
    return res.status(500).json({
      error: 'Failed to fetch schedule timeline'
    });
  }
});

// ============================================================================
// GET /api/users/me/shifts/upcoming
// ============================================================================

router.get('/users/me/shifts', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'User not authenticated'
      });
    }

    const query = UpcomingShiftsQuerySchema.parse(req.query);

    const shifts = await onCallService.getUpcomingShifts(
      req.user.id,
      query.days
    );

    return res.json(shifts);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues
      });
    }

    console.error('Error fetching upcoming shifts:', error);
    return res.status(500).json({
      error: 'Failed to fetch upcoming shifts'
    });
  }
});

export const onCallRouter = router;
