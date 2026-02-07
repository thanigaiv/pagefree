import { Router, Request, Response, NextFunction } from 'express';
import { alertService } from '../services/alert.service.js';
import { permissionService } from '../services/permission.service.js';

const router = Router();

// GET /api/alerts - Search alerts (ALERT-04)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      teamId,
      integrationId,
      status,
      severity,
      searchTerm,
      startDate,
      endDate,
      incidentId,
      hasIncident,
      limit,
      cursor
    } = req.query;

    // If teamId specified, check access
    if (teamId) {
      const permission = permissionService.canViewTeam(
        (req as any).user,
        teamId as string
      );

      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
    }

    const result = await alertService.search(
      {
        teamId: teamId as string,
        integrationId: integrationId as string,
        status: status as string,
        severity: severity as string,
        searchTerm: searchTerm as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        incidentId: incidentId as string,
        hasIncident: hasIncident === 'true' ? true : hasIncident === 'false' ? false : undefined
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

// GET /api/alerts/history/:teamId - Team alert history (ALERT-05)
router.get('/history/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.params;
    const { days, limit, includeResolved } = req.query;

    const permission = permissionService.canViewTeam(
      (req as any).user,
      teamId
    );

    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const alerts = await alertService.getHistory(teamId, {
      days: days ? parseInt(days as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      includeResolved: includeResolved !== 'false'
    });

    return res.json({ alerts });
  } catch (error) {
    return next(error);
  }
});

// GET /api/alerts/stats - Alert statistics
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, days } = req.query;

    if (teamId) {
      const permission = permissionService.canViewTeam(
        (req as any).user,
        teamId as string
      );

      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
    }

    const counts = await alertService.getCountsBySeverity(
      teamId as string,
      days ? parseInt(days as string, 10) : undefined
    );

    return res.json({ counts });
  } catch (error) {
    return next(error);
  }
});

// GET /api/alerts/:id - Get alert details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await alertService.getById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Check team access if alert has incident
    if (alert.incident?.teamId) {
      const permission = permissionService.canViewTeam(
        (req as any).user,
        alert.incident.teamId
      );

      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
    }

    return res.json({ alert });
  } catch (error) {
    return next(error);
  }
});

export const alertRoutes = router;
