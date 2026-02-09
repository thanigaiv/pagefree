import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { partnerAuthService } from './auth.service.js';
import { loadPartnerUser, requirePartnerAuth } from './auth.middleware.js';
import { requirePartnerAccess } from './access.middleware.js';
import { auditService } from '../services/audit.service.js';
import { statusPageService } from '../services/statusPage.service.js';
import { statusComputationService } from '../services/statusComputation.service.js';
import { statusIncidentService } from '../services/statusIncident.service.js';
import { maintenanceService } from '../services/maintenance.service.js';
import { env } from '../config/env.js';

const router = Router();

// Schema for login request
const loginRequestSchema = z.object({
  email: z.string().email()
});

/**
 * POST /api/partner/auth/request-login
 * Request magic link email
 */
router.post('/auth/request-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = loginRequestSchema.parse(req.body);

    await partnerAuthService.requestLogin(
      email,
      req.ip,
      req.get('user-agent')
    );

    // Always return success to not reveal if email exists
    return res.json({
      success: true,
      message: 'If this email is registered, you will receive a login link.'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    return next(error);
  }
});

/**
 * GET /api/partner/auth/verify/:token
 * Verify magic link and create session
 */
router.get('/auth/verify/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const frontendUrl = env.FRONTEND_URL || 'http://localhost:3001';

    const result = await partnerAuthService.verifyToken(token);

    if (!result) {
      // Redirect to frontend with error
      return res.redirect(`${frontendUrl}/partner/login?error=invalid_token`);
    }

    const { partner, tokenId } = result;

    // Mark token as used
    await partnerAuthService.markTokenUsed(tokenId);

    // Create session
    req.session.partnerId = partner.id;
    req.session.partnerEmail = partner.email;

    // Audit log successful login
    await auditService.log({
      action: 'partner.login',
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { email: partner.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'INFO'
    });

    // Redirect to partner dashboard
    return res.redirect(`${frontendUrl}/partner/dashboard`);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/partner/auth/me
 * Get current partner user (requires auth)
 */
router.get('/auth/me', loadPartnerUser, requirePartnerAuth, async (req: Request, res: Response) => {
  const partner = (req as any).partnerUser;
  return res.json({
    id: partner.id,
    email: partner.email,
    name: partner.name,
    statusPages: partner.statusPageAccess.map((a: any) => ({
      id: a.statusPage.id,
      name: a.statusPage.name,
      slug: a.statusPage.slug
    }))
  });
});

/**
 * POST /api/partner/auth/logout
 * Destroy partner session
 */
router.post('/auth/logout', loadPartnerUser, (req: Request, res: Response) => {
  const partner = (req as any).partnerUser;

  if (partner) {
    auditService.log({
      action: 'partner.logout',
      resourceType: 'PartnerUser',
      resourceId: partner.id,
      metadata: { email: partner.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'INFO'
    });
  }

  req.session.destroy(() => {
    res.clearCookie('partner.sid');
    res.json({ success: true });
  });
});

// ============================================================================
// PARTNER STATUS PAGE VIEWING (Read-Only)
// ============================================================================

/**
 * GET /api/partner/status-pages
 * List status pages partner has access to
 */
router.get('/status-pages', loadPartnerUser, requirePartnerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partner = (req as any).partnerUser;

    // Log access
    await auditService.log({
      action: 'partner.access.statusPage',
      resourceType: 'StatusPage',
      metadata: {
        partnerEmail: partner.email,
        action: 'list'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'INFO'
    });

    return res.json({
      statusPages: partner.statusPageAccess.map((a: any) => ({
        id: a.statusPage.id,
        name: a.statusPage.name,
        slug: a.statusPage.slug
      }))
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/partner/status-pages/:statusPageId
 * Get status page with computed statuses (partner must have access)
 */
router.get('/status-pages/:statusPageId', loadPartnerUser, requirePartnerAuth, requirePartnerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partner = (req as any).partnerUser;
    const { statusPageId } = req.params;

    const statusPage = await statusPageService.getById(statusPageId);
    if (!statusPage) {
      return res.status(404).json({ error: 'Status page not found' });
    }

    // Compute status for each component
    const componentsWithStatus = await Promise.all(
      statusPage.components.map(async (component: any) => {
        const status = await statusComputationService.getStatus(component.id);
        return {
          id: component.id,
          name: component.name,
          description: component.description,
          status,
          statusUpdatedAt: component.statusUpdatedAt,
          displayOrder: component.displayOrder
        };
      })
    );

    // Compute overall status
    const overallStatus = statusComputationService.computeOverallStatus(
      componentsWithStatus.map(c => c.status)
    );

    // Log access
    await auditService.log({
      action: 'partner.access.statusPage',
      resourceType: 'StatusPage',
      resourceId: statusPageId,
      metadata: {
        partnerEmail: partner.email,
        partnerId: partner.id,
        statusPageName: statusPage.name
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'INFO'
    });

    return res.json({
      id: statusPage.id,
      name: statusPage.name,
      description: statusPage.description,
      overallStatus,
      components: componentsWithStatus,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/partner/status-pages/:statusPageId/incidents
 * Get active incidents (StatusIncident only, not internal Incident)
 */
router.get('/status-pages/:statusPageId/incidents', loadPartnerUser, requirePartnerAuth, requirePartnerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusPageId } = req.params;

    // Get only public status incidents (not internal incidents)
    const incidents = await statusIncidentService.listByStatusPage(statusPageId, {
      includeResolved: false
    });

    return res.json({ incidents });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/partner/status-pages/:statusPageId/maintenance
 * Get upcoming/active maintenance
 */
router.get('/status-pages/:statusPageId/maintenance', loadPartnerUser, requirePartnerAuth, requirePartnerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusPageId } = req.params;

    const maintenance = await maintenanceService.listByStatusPage(statusPageId, {
      upcoming: true
    });

    return res.json({ maintenance });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/partner/status-pages/:statusPageId/history
 * Get incident history (last N days)
 */
router.get('/status-pages/:statusPageId/history', loadPartnerUser, requirePartnerAuth, requirePartnerAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statusPageId } = req.params;
    const { days } = req.query;

    let daysCount = 7;
    if (days) {
      daysCount = Math.min(Math.max(parseInt(days as string, 10) || 7, 1), 90);
    }

    const history = await statusIncidentService.getHistory(statusPageId, daysCount);

    return res.json({ history });
  } catch (error) {
    return next(error);
  }
});

// Note: Partner routes do NOT include subscribe endpoint - partners cannot subscribe per PARTNER-03

export const partnerRoutes = router;
