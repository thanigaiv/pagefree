import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { partnerAuthService } from './auth.service.js';
import { loadPartnerUser, requirePartnerAuth } from './auth.middleware.js';
import { auditService } from '../services/audit.service.js';
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

export const partnerRoutes = router;
