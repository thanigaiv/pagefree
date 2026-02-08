import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { incidentService } from '../services/incident.service.js';
import { permissionService } from '../services/permission.service.js';

const router = Router();

// Validation schema for creating incidents
const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  teamId: z.string(),
  escalationPolicyId: z.string(),
  priority: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assignedUserId: z.string().optional(),
});

// POST /api/incidents - Create incident manually
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createIncidentSchema.parse(req.body);
    const user = (req as any).user;

    // Check team access - must be team member
    const permission = permissionService.canViewTeam(user, input.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const incident = await incidentService.create({
      ...input,
      createdByUserId: user.id,
    });

    return res.status(201).json({ incident });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid incident data',
        details: error.issues
      });
    }
    return next(error);
  }
});

// GET /api/incidents - List incidents with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      teamId,
      status,
      assignedUserId,
      priority,
      startDate,
      endDate,
      limit,
      cursor
    } = req.query;

    // If teamId specified, check team access
    if (teamId) {
      const permission = permissionService.canViewTeam(
        (req as any).user,
        teamId as string
      );

      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
    }

    const result = await incidentService.list(
      {
        teamId: teamId as string,
        status: status as string,
        assignedUserId: assignedUserId as string,
        priority: priority as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      },
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        cursor: cursor as string
      }
    );

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// GET /api/incidents/my - User's assigned incidents
router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit, cursor } = req.query;

    const result = await incidentService.list(
      {
        assignedUserId: (req as any).user.id,
        status: status ? (status as string).split(',') : ['OPEN', 'ACKNOWLEDGED']
      },
      {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        cursor: cursor as string
      }
    );

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// GET /api/incidents/:id - Get incident details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Check team access
    const permission = permissionService.canViewTeam(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    return res.json({ incident });
  } catch (error) {
    return next(error);
  }
});

// POST /api/incidents/:id/acknowledge - Acknowledge incident (ROUTE-05)
router.post('/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Any team member can acknowledge
    const permission = permissionService.canRespondToIncident(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { note } = req.body;
    const updated = await incidentService.acknowledge(
      req.params.id,
      (req as any).user.id,
      { note }
    );

    return res.json({ incident: updated });
  } catch (error: any) {
    if (error.message.includes('Cannot acknowledge')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// POST /api/incidents/:id/resolve - Resolve incident
router.post('/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const permission = permissionService.canRespondToIncident(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { resolutionNote } = req.body;
    const updated = await incidentService.resolve(
      req.params.id,
      (req as any).user.id,
      { resolutionNote }
    );

    res.json({ incident: updated });
  } catch (error: any) {
    if (error.message.includes('Cannot resolve')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// POST /api/incidents/:id/close - Close incident
router.post('/:id/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const permission = permissionService.canRespondToIncident(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const updated = await incidentService.close(req.params.id, (req as any).user.id);
    return res.json({ incident: updated });
  } catch (error: any) {
    if (error.message.includes('Only resolved')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// POST /api/incidents/:id/reassign - Reassign incident (ROUTE-04)
router.post('/:id/reassign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const permission = permissionService.canRespondToIncident(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updated = await incidentService.reassign(
      req.params.id,
      userId,
      (req as any).user.id,
      reason
    );

    res.json({ incident: updated });
  } catch (error: any) {
    if (error.message.includes('Cannot reassign') || error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// POST /api/incidents/:id/notes - Add note to incident
router.post('/:id/notes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const permission = permissionService.canViewTeam(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'note is required' });
    }

    await incidentService.addNote(req.params.id, (req as any).user.id, note);
    return res.status(201).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// GET /api/incidents/:id/timeline - Get incident timeline
router.get('/:id/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await incidentService.getById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const permission = permissionService.canViewTeam(
      (req as any).user,
      incident.teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const timeline = await incidentService.getTimeline(req.params.id);
    return res.json({ timeline });
  } catch (error) {
    return next(error);
  }
});

export const incidentRoutes = router;
