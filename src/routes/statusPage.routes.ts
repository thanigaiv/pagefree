import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { statusPageService } from '../services/statusPage.service.js';
import { statusComponentService } from '../services/statusComponent.service.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { statusIncidentService } from '../services/statusIncident.service.js';
import { auditService } from '../services/audit.service.js';
import { permissionService } from '../services/permission.service.js';
import { AuthenticatedUser } from '../types/auth.js';
import type { StatusIncidentSeverity, StatusIncidentStatus } from '../types/statusPage.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// STATUS PAGE CRUD
// ============================================================================

/**
 * POST /api/status-pages - Create status page
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { name, description, teamId, isPublic } = req.body;

    if (!name || !teamId) {
      return res.status(400).json({ error: 'name and teamId are required' });
    }

    // Verify user is team admin or platform admin
    const canManage = permissionService.hasMinimumTeamRole(user, teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    const statusPage = await statusPageService.create({
      name,
      description,
      teamId,
      createdById: user.id,
      isPublic
    });

    // Log audit event
    await auditService.log({
      action: 'status.page.created',
      userId: user.id,
      teamId,
      resourceType: 'StatusPage',
      resourceId: statusPage.id,
      metadata: { name, isPublic: statusPage.isPublic },
      severity: 'INFO'
    });

    return res.status(201).json({ statusPage });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/status-pages - List user's team's status pages
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { teamId } = req.query;

    console.log('[STATUS-PAGES] GET request - User:', user.id, 'TeamMembers:', user.teamMembers?.length, 'PlatformAdmin:', permissionService.isPlatformAdmin(user));

    // If teamId specified, check access
    if (teamId) {
      const permission = permissionService.canViewTeam(user, teamId as string);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }

      const statusPages = await statusPageService.listByTeam(teamId as string);
      console.log('[STATUS-PAGES] Found pages for team', teamId, ':', statusPages.length);
      return res.json({ statusPages });
    }

    // Platform admins can see all status pages
    if (permissionService.isPlatformAdmin(user)) {
      const allPages = await prisma.statusPage.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          isPublic: true,
          teamId: true,
          createdAt: true,
          updatedAt: true,
          team: {
            select: { id: true, name: true },
          },
          components: {
            orderBy: { displayOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              displayOrder: true,
              currentStatus: true,
              statusUpdatedAt: true,
              teamId: true,
              serviceIdentifier: true,
            },
          },
          _count: {
            select: { components: true },
          },
        },
      });
      console.log('[STATUS-PAGES] Platform admin - returning all pages:', allPages.length);
      return res.json({ statusPages: allPages });
    }

    // Return pages from all user's teams
    const allPages: any[] = [];
    for (const membership of user.teamMembers || []) {
      const pages = await statusPageService.listByTeam(membership.teamId);
      console.log('[STATUS-PAGES] Found pages for team', membership.teamId, ':', pages.length);
      allPages.push(...pages);
    }

    console.log('[STATUS-PAGES] Total pages returned:', allPages.length);
    return res.json({ statusPages: allPages });
  } catch (error) {
    console.error('[STATUS-PAGES] Error:', error);
    return next(error);
  }
});

/**
 * GET /api/status-pages/:id - Get status page details
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const statusPage = await statusPageService.getById(req.params.id);

    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify user has access to team
    const permission = permissionService.canViewTeam(user, statusPage.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    return res.json({ statusPage });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/status-pages/:id - Update status page
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { name, description, isPublic } = req.body;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    const updated = await statusPageService.update(req.params.id, {
      name,
      description,
      isPublic
    });

    // Log audit event
    await auditService.log({
      action: 'status.page.updated',
      userId: user.id,
      teamId: statusPage.teamId,
      resourceType: 'StatusPage',
      resourceId: req.params.id,
      metadata: { name, isPublic },
      severity: 'INFO'
    });

    return res.json({ statusPage: updated });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/status-pages/:id - Delete status page
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    await statusPageService.delete(req.params.id);

    // Log audit event
    await auditService.log({
      action: 'status.page.deleted',
      userId: user.id,
      teamId: statusPage.teamId,
      resourceType: 'StatusPage',
      resourceId: req.params.id,
      severity: 'HIGH'
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/status-pages/:id/regenerate-token - Regenerate access token
 */
router.post('/:id/regenerate-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    const newToken = await statusPageService.regenerateAccessToken(req.params.id);

    // Log audit event
    await auditService.log({
      action: 'status.page.token.regenerated',
      userId: user.id,
      teamId: statusPage.teamId,
      resourceType: 'StatusPage',
      resourceId: req.params.id,
      severity: 'HIGH'
    });

    return res.json({ accessToken: newToken });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// COMPONENT ROUTES
// ============================================================================

/**
 * POST /api/status-pages/:id/components - Add component
 */
router.post('/:id/components', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { name, description, teamId, serviceIdentifier } = req.body;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const component = await statusComponentService.create(req.params.id, {
      name,
      description,
      teamId,
      serviceIdentifier
    });

    return res.status(201).json({ component });
  } catch (error: any) {
    if (error.message?.includes('Team not found')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * PUT /api/status-pages/:pageId/components/:componentId - Update component
 */
router.put('/:pageId/components/:componentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { name, description, teamId, serviceIdentifier } = req.body;

    const statusPage = await statusPageService.getById(req.params.pageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    // Verify component belongs to this status page
    const component = await statusComponentService.getById(req.params.componentId);
    if (!component || component.statusPage.id !== req.params.pageId) {
      return res.status(404).json({ error: 'Component not found' });
    }

    const updated = await statusComponentService.update(req.params.componentId, {
      name,
      description,
      teamId,
      serviceIdentifier
    });

    return res.json({ component: updated });
  } catch (error: any) {
    if (error.message?.includes('Team not found')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * DELETE /api/status-pages/:pageId/components/:componentId - Delete component
 */
router.delete('/:pageId/components/:componentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const statusPage = await statusPageService.getById(req.params.pageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    // Verify component belongs to this status page
    const component = await statusComponentService.getById(req.params.componentId);
    if (!component || component.statusPage.id !== req.params.pageId) {
      return res.status(404).json({ error: 'Component not found' });
    }

    await statusComponentService.delete(req.params.componentId);

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/status-pages/:id/components/reorder - Reorder components
 */
router.put('/:id/components/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { componentIds } = req.body;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    if (!Array.isArray(componentIds)) {
      return res.status(400).json({ error: 'componentIds array is required' });
    }

    await statusComponentService.reorder(req.params.id, componentIds);

    return res.json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('Invalid component IDs')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// ============================================================================
// MAINTENANCE ROUTES
// ============================================================================

/**
 * POST /api/status-pages/:id/maintenance - Schedule maintenance
 */
router.post('/:id/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const {
      title,
      description,
      componentIds,
      startTime,
      endTime,
      autoUpdateStatus,
      notifySubscribers,
      recurrenceRule
    } = req.body;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    if (!title || !componentIds || !startTime || !endTime) {
      return res.status(400).json({ error: 'title, componentIds, startTime, and endTime are required' });
    }

    const maintenance = await maintenanceService.create(req.params.id, user.id, {
      title,
      description,
      componentIds,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      autoUpdateStatus: autoUpdateStatus ?? true,
      notifySubscribers: notifySubscribers ?? true,
      recurrenceRule
    });

    return res.status(201).json({ maintenance });
  } catch (error: any) {
    if (error.message?.includes('must be after') || error.message?.includes('do not belong')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * GET /api/status-pages/:id/maintenance - List maintenance windows
 */
router.get('/:id/maintenance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { status } = req.query;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify user has access to team
    const permission = permissionService.canViewTeam(user, statusPage.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const maintenance = await maintenanceService.listByStatusPage(req.params.id, {
      status: status as any
    });

    return res.json({ maintenance });
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/status-pages/:pageId/maintenance/:maintenanceId - Update maintenance
 */
router.put('/:pageId/maintenance/:maintenanceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { title, description, startTime, endTime, autoUpdateStatus, notifySubscribers } = req.body;

    const statusPage = await statusPageService.getById(req.params.pageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    // Verify maintenance belongs to this status page
    const existing = await maintenanceService.getById(req.params.maintenanceId);
    if (!existing || existing.statusPage.id !== req.params.pageId) {
      return res.status(404).json({ error: 'Maintenance window not found' });
    }

    const maintenance = await maintenanceService.update(req.params.maintenanceId, {
      title,
      description,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      autoUpdateStatus,
      notifySubscribers
    });

    return res.json({ maintenance });
  } catch (error: any) {
    if (error.message?.includes('must be after')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * DELETE /api/status-pages/:pageId/maintenance/:maintenanceId - Cancel/delete maintenance
 */
router.delete('/:pageId/maintenance/:maintenanceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const statusPage = await statusPageService.getById(req.params.pageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    // Verify maintenance belongs to this status page
    const existing = await maintenanceService.getById(req.params.maintenanceId);
    if (!existing || existing.statusPage.id !== req.params.pageId) {
      return res.status(404).json({ error: 'Maintenance window not found' });
    }

    // If scheduled, cancel; if in progress or other, delete
    if (existing.status === 'SCHEDULED') {
      await maintenanceService.cancel(req.params.maintenanceId);
    } else {
      await maintenanceService.delete(req.params.maintenanceId);
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// STATUS INCIDENT ROUTES
// ============================================================================

/**
 * POST /api/status-pages/:id/incidents - Create status incident
 */
router.post('/:id/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { title, message, severity, affectedComponentIds, incidentId } = req.body;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    if (!title || !severity) {
      return res.status(400).json({ error: 'title and severity are required' });
    }

    const statusIncident = await statusIncidentService.create(req.params.id, {
      title,
      message,
      severity: severity as StatusIncidentSeverity,
      affectedComponentIds,
      incidentId
    });

    return res.status(201).json({ statusIncident });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/status-pages/:pageId/incidents/:incidentId/updates - Add update
 */
router.post('/:pageId/incidents/:incidentId/updates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { status, message } = req.body;

    const statusPage = await statusPageService.getById(req.params.pageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    if (!status || !message) {
      return res.status(400).json({ error: 'status and message are required' });
    }

    // Verify incident belongs to this status page
    const existing = await statusIncidentService.getById(req.params.incidentId);
    if (!existing || existing.statusPage.id !== req.params.pageId) {
      return res.status(404).json({ error: 'Status incident not found' });
    }

    const statusIncident = await statusIncidentService.addUpdate(req.params.incidentId, {
      status: status as StatusIncidentStatus,
      message
    });

    return res.json({ statusIncident });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/status-pages/:id/incidents - List status incidents
 */
router.get('/:id/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { status, includeResolved } = req.query;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify user has access to team
    const permission = permissionService.canViewTeam(user, statusPage.teamId);
    if (!permission.allowed) {
      return res.status(403).json({ error: permission.reason });
    }

    const incidents = await statusIncidentService.listByStatusPage(req.params.id, {
      status: status as any,
      includeResolved: includeResolved === 'true'
    });

    return res.json({ incidents });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// SUBSCRIBER ROUTES (ADMIN VIEW)
// ============================================================================

/**
 * GET /api/status-pages/:id/subscribers - List subscribers
 * Note: statusSubscriberService will be implemented in a later plan
 */
router.get('/:id/subscribers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;

    const statusPage = await statusPageService.getById(req.params.id);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Verify team admin
    const canManage = permissionService.hasMinimumTeamRole(user, statusPage.teamId, 'TEAM_ADMIN');
    if (!canManage) {
      return res.status(403).json({ error: 'Team admin access required' });
    }

    // Subscribers will be implemented in statusSubscriber.service.ts (future plan)
    // For now, return empty array
    return res.json({ subscribers: [] });
  } catch (error) {
    return next(error);
  }
});

export const statusPageRoutes = router;
