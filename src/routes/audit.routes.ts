import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { auditService } from '../services/audit.service.js';

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
 * TODO: Add access control in Plan 03 (RBAC) - platform admins see all, team admins see their team only
 */
auditRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const queryParams = AuditQuerySchema.parse(req.query);

    // Parse date strings to Date objects
    const params: any = { ...queryParams };
    if (queryParams.startDate) {
      params.startDate = new Date(queryParams.startDate);
    }
    if (queryParams.endDate) {
      params.endDate = new Date(queryParams.endDate);
    }

    const result = await auditService.query(params);

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
 * TODO: Add access control in Plan 03 (RBAC)
 */
auditRouter.get('/:resourceType/:resourceId', async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;

    const events = await auditService.getByResource(resourceType, resourceId);

    return res.json({
      events,
      total: events.length,
    });
  } catch (error) {
    console.error('Error getting resource audit trail:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/audit/cleanup - Trigger manual cleanup (admin only)
 * TODO: Add admin auth check in Plan 03 (RBAC)
 */
auditRouter.post('/cleanup', async (req: Request, res: Response) => {
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
