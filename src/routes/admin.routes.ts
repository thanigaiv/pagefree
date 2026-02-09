import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { partnerService } from '../partner/partner.service.js';
import { partnerAccessService } from '../partner/partnerAccess.service.js';
import { auditService } from '../services/audit.service.js';
import type { AuthenticatedUser } from '../types/auth.js';

const router = Router();

// All admin routes require platform admin
router.use(requireAuth, requirePlatformAdmin);

// ============================================================================
// PARTNER MANAGEMENT
// ============================================================================

const createPartnerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100)
});

/**
 * POST /api/admin/partners
 * Create partner account
 */
router.post('/partners', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createPartnerSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;

    const partner = await partnerService.create(input, user.id);

    return res.status(201).json(partner);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid partner data' });
    }
    // Handle unique constraint violation
    if ((error as any).code === 'P2002') {
      return res.status(409).json({ error: 'Partner with this email already exists' });
    }
    return next(error);
  }
});

/**
 * GET /api/admin/partners
 * List all partners
 */
router.get('/partners', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = req.query;
    const options: { isActive?: boolean } = {};

    if (isActive === 'true') options.isActive = true;
    if (isActive === 'false') options.isActive = false;

    const partners = await partnerService.list(options);

    return res.json({ partners });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/admin/partners/:partnerId
 * Get partner details with access
 */
router.get('/partners/:partnerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId } = req.params;
    const partner = await partnerService.getById(partnerId);

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    return res.json(partner);
  } catch (error) {
    return next(error);
  }
});

/**
 * PUT /api/admin/partners/:partnerId
 * Update partner
 */
router.put('/partners/:partnerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId } = req.params;
    const user = req.user as AuthenticatedUser;
    const { name, isActive } = req.body;

    const partner = await partnerService.update(partnerId, { name, isActive }, user.id);

    return res.json(partner);
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/admin/partners/:partnerId
 * Deactivate partner (soft delete)
 */
router.delete('/partners/:partnerId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId } = req.params;
    const user = req.user as AuthenticatedUser;

    await partnerService.deactivate(partnerId, user.id);

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// PARTNER ACCESS MANAGEMENT
// ============================================================================

/**
 * POST /api/admin/partners/:partnerId/access
 * Grant status page access to partner
 */
router.post('/partners/:partnerId/access', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId } = req.params;
    const { statusPageId } = req.body;
    const user = req.user as AuthenticatedUser;

    if (!statusPageId) {
      return res.status(400).json({ error: 'statusPageId is required' });
    }

    const access = await partnerAccessService.grantAccess(partnerId, statusPageId, user.id);

    return res.status(201).json(access);
  } catch (error) {
    // Handle unique constraint (already has access)
    if ((error as any).code === 'P2002') {
      return res.status(409).json({ error: 'Partner already has access to this status page' });
    }
    return next(error);
  }
});

/**
 * DELETE /api/admin/partners/:partnerId/access/:statusPageId
 * Revoke status page access from partner
 */
router.delete('/partners/:partnerId/access/:statusPageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId, statusPageId } = req.params;
    const user = req.user as AuthenticatedUser;

    const revoked = await partnerAccessService.revokeAccess(partnerId, statusPageId, user.id);

    if (!revoked) {
      return res.status(404).json({ error: 'Access grant not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// ============================================================================
// PARTNER AUDIT LOGS
// ============================================================================

/**
 * GET /api/admin/partners/audit-logs
 * Get partner-specific audit logs (90-day retention per PARTNER-04)
 */
router.get('/partners/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { partnerId, action, limit, offset } = req.query;

    // Query audit events with partner.* action prefix
    const result = await auditService.query({
      action: action as string || undefined,
      resourceType: partnerId ? 'PartnerUser' : undefined,
      resourceId: partnerId as string || undefined,
      limit: parseInt(limit as string, 10) || 100,
      offset: parseInt(offset as string, 10) || 0,
      // Filter to partner.* actions
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // 90 days back
    });

    // Additional filter for partner.* actions in application layer
    const partnerEvents = result.events.filter(e => e.action.startsWith('partner.'));

    return res.json({
      events: partnerEvents,
      total: partnerEvents.length
    });
  } catch (error) {
    return next(error);
  }
});

export const adminRoutes = router;
