import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { auditService } from '../services/audit.service.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { permissionService } from '../services/permission.service.js';
import { getAdminTeamIds } from '../utils/permissions.js';
import { AuthenticatedUser } from '../types/auth.js';

export const auditRouter = Router();

// Zod schema for query parameter validation
const AuditQuerySchema = z.object({
  userId: z.string().optional(),
  teamId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  severity: z.enum(['INFO', 'WARN', 'HIGH']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * GET /api/audit - Query audit logs (paginated)
 * Access control:
 * - Platform admins: see all events
 * - Team admins: see only their team's events
 * - Regular users: no access
 */
auditRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as AuthenticatedUser;
  try {
    // Validate query parameters
    const queryParams = AuditQuerySchema.parse(req.query);

    // Check permissions
    const isPlatformAdmin = permissionService.isPlatformAdmin(user);
    const requestedTeamId = queryParams.teamId;

    if (!isPlatformAdmin) {
      // If teamId is provided, check if user can view that team's audit logs
      if (requestedTeamId) {
        const canView = permissionService.canViewAuditLogs(user, requestedTeamId);
        if (!canView.allowed) {
          return res.status(403).json({ error: canView.reason });
        }
      } else {
        // No teamId provided - return only teams where user is admin
        const adminTeamIds = getAdminTeamIds(user);
        if (adminTeamIds.length === 0) {
          return res.status(403).json({
            error: 'You must be a team admin to view audit logs'
          });
        }
        // Filter to only show events from teams where user is admin
        queryParams.teamId = undefined; // Clear any teamId filter
      }
    }

    // Parse date strings to Date objects
    const params: any = { ...queryParams };
    if (queryParams.startDate) {
      params.startDate = new Date(queryParams.startDate);
    }
    if (queryParams.endDate) {
      params.endDate = new Date(queryParams.endDate);
    }

    // For non-platform-admins, filter to their admin teams only
    let result;
    if (!isPlatformAdmin && !requestedTeamId) {
      const adminTeamIds = getAdminTeamIds(user);
      // Query events for each admin team and combine
      const teamResults = await Promise.all(
        adminTeamIds.map(teamId =>
          auditService.query({ ...params, teamId })
        )
      );
      // Combine and sort by timestamp
      const allEvents = teamResults.flatMap(r => r.events);
      allEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      result = {
        events: allEvents.slice(params.offset || 0, (params.offset || 0) + (params.limit || 100)),
        total: allEvents.length
      };
    } else {
      result = await auditService.query(params);
    }

    return res.json({
      events: result.events,
      total: result.total,
      limit: queryParams.limit,
      offset: queryParams.offset,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues,
      });
    }
    console.error('Error querying audit logs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/audit/:resourceType/:resourceId - Get audit trail for specific resource
 * Access control: Same as main audit log endpoint
 */
auditRouter.get('/:resourceType/:resourceId', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as AuthenticatedUser;
  try {
    const { resourceType, resourceId } = req.params;

    const events = await auditService.getByResource(resourceType, resourceId);

    // Filter events based on user permissions
    const isPlatformAdmin = permissionService.isPlatformAdmin(user);
    const filteredEvents = isPlatformAdmin
      ? events
      : events.filter(event => {
          if (!event.teamId) return false;
          const canView = permissionService.canViewAuditLogs(user, event.teamId);
          return canView.allowed;
        });

    return res.json({
      events: filteredEvents,
      total: filteredEvents.length,
    });
  } catch (error) {
    console.error('Error getting resource audit trail:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/audit/cleanup - Trigger manual cleanup (platform admin only)
 * Access control: Only platform admins can manually trigger cleanup
 */
auditRouter.post('/cleanup', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const retentionDays = req.body.retentionDays || 90;

    if (retentionDays < 1 || retentionDays > 365) {
      return res.status(400).json({
        error: 'Retention days must be between 1 and 365',
      });
    }

    const result = await auditService.cleanup(retentionDays);

    return res.json({
      deletedCount: result.deletedCount,
      retentionDays,
    });
  } catch (error) {
    console.error('Error running audit cleanup:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
