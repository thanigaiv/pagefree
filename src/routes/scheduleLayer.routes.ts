import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { scheduleLayerService } from '../services/scheduleLayer.service.js';
import { requireAuth } from '../middleware/auth.js';
import {
  CreateLayerInputSchema,
  UpdateLayerInputSchema
} from '../types/schedule.js';
import { prisma } from '../config/database.js';

export const scheduleLayerRouter = Router();

// ============================================================================
// HELPER: Check if user is team admin for schedule
// ============================================================================

async function isTeamAdmin(userId: string, scheduleId: string): Promise<boolean> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { teamId: true }
  });

  if (!schedule) {
    return false;
  }

  // Check if user is platform admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true }
  });

  if (user?.platformRole === 'PLATFORM_ADMIN') {
    return true;
  }

  // Check if user is team admin
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      teamId: schedule.teamId,
      role: 'TEAM_ADMIN'
    }
  });

  return !!membership;
}

// ============================================================================
// POST /api/schedules/:scheduleId/layers - Create layer
// ============================================================================

scheduleLayerRouter.post(
  '/:scheduleId/layers',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;

      // Check permission
      const hasPermission = await isTeamAdmin(req.user!.id, scheduleId);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Must be team admin to create schedule layers'
        });
      }

      // Validate input
      const input = CreateLayerInputSchema.parse({
        ...req.body,
        scheduleId
      });

      // Create layer
      const layer = await scheduleLayerService.create(input, req.user!.id);

      return res.status(201).json(layer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.issues
        });
      }

      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// GET /api/schedules/:scheduleId/layers - List layers
// ============================================================================

scheduleLayerRouter.get(
  '/:scheduleId/layers',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;

      // Get layers (ordered by priority DESC)
      const layers = await scheduleLayerService.findBySchedule(scheduleId);

      return res.status(200).json(layers);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// GET /api/schedules/:scheduleId/layers/:layerId - Get layer by ID
// ============================================================================

scheduleLayerRouter.get(
  '/:scheduleId/layers/:layerId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId, layerId } = req.params;

      // Get layer
      const layer = await scheduleLayerService.findById(layerId);

      if (!layer) {
        return res.status(404).json({
          error: 'Layer not found'
        });
      }

      // Verify layer belongs to this schedule
      if (layer.scheduleId !== scheduleId) {
        return res.status(400).json({
          error: 'Layer does not belong to this schedule'
        });
      }

      return res.status(200).json(layer);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// PATCH /api/schedules/:scheduleId/layers/:layerId - Update layer
// ============================================================================

scheduleLayerRouter.patch(
  '/:scheduleId/layers/:layerId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId, layerId } = req.params;

      // Check permission
      const hasPermission = await isTeamAdmin(req.user!.id, scheduleId);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Must be team admin to update schedule layers'
        });
      }

      // Validate input
      const input = UpdateLayerInputSchema.parse(req.body);

      // Update layer
      const layer = await scheduleLayerService.update(layerId, input, req.user!.id);

      // Verify layer belongs to this schedule
      if (layer.scheduleId !== scheduleId) {
        return res.status(400).json({
          error: 'Layer does not belong to this schedule'
        });
      }

      return res.status(200).json(layer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.issues
        });
      }

      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// DELETE /api/schedules/:scheduleId/layers/:layerId - Delete layer
// ============================================================================

scheduleLayerRouter.delete(
  '/:scheduleId/layers/:layerId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId, layerId } = req.params;

      // Check permission (team admin or platform admin)
      const hasPermission = await isTeamAdmin(req.user!.id, scheduleId);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Must be team admin or platform admin to delete schedule layers'
        });
      }

      // Delete layer
      await scheduleLayerService.delete(layerId, req.user!.id);

      return res.status(204).send();
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

// ============================================================================
// POST /api/schedules/:scheduleId/layers/reorder - Reorder layers
// ============================================================================

scheduleLayerRouter.post(
  '/:scheduleId/layers/reorder',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;

      // Check permission
      const hasPermission = await isTeamAdmin(req.user!.id, scheduleId);
      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Must be team admin to reorder schedule layers'
        });
      }

      // Validate input
      const { layerIds } = z.object({
        layerIds: z.array(z.string().cuid()).min(1)
      }).parse(req.body);

      // Reorder layers
      const layers = await scheduleLayerService.reorderPriorities(
        scheduleId,
        layerIds,
        req.user!.id
      );

      return res.status(200).json(layers);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.issues
        });
      }

      if (error instanceof Error) {
        return res.status(400).json({
          error: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);
