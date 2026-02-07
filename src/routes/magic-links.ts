import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { incidentService } from '../services/incident.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

// Handle acknowledge magic link
router.get('/ack/:incidentId/:token', async (req: Request, res: Response) => {
  await handleMagicLink(req, res, 'acknowledge');
});

// Handle resolve magic link
router.get('/resolve/:incidentId/:token', async (req: Request, res: Response) => {
  await handleMagicLink(req, res, 'resolve');
});

async function handleMagicLink(req: Request, res: Response, action: 'acknowledge' | 'resolve'): Promise<void> {
  const { incidentId, token } = req.params;
  const dashboardUrl = env.FRONTEND_URL || 'http://localhost:3000';

  try {
    // Hash token for database lookup
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find token
    const magicToken = await prisma.magicLinkToken.findUnique({
      where: { tokenHash },
      include: { incident: true }
    });

    // Validate token
    if (!magicToken) {
      logger.warn({ incidentId, tokenHash: tokenHash.slice(0, 8) }, 'Magic link token not found');
      return res.redirect(`${dashboardUrl}/magic-link-error?reason=invalid`);
    }

    if (magicToken.used) {
      logger.warn({ incidentId, tokenId: magicToken.id }, 'Magic link already used');
      return res.redirect(`${dashboardUrl}/magic-link-error?reason=used`);
    }

    if (magicToken.expiresAt < new Date()) {
      logger.warn({ incidentId, tokenId: magicToken.id, expiresAt: magicToken.expiresAt }, 'Magic link expired');
      return res.redirect(`${dashboardUrl}/magic-link-error?reason=expired`);
    }

    if (magicToken.incidentId !== incidentId) {
      logger.warn({ incidentId, tokenIncidentId: magicToken.incidentId }, 'Magic link incident mismatch');
      return res.redirect(`${dashboardUrl}/magic-link-error?reason=invalid`);
    }

    if (magicToken.action !== action) {
      logger.warn({ action, tokenAction: magicToken.action }, 'Magic link action mismatch');
      return res.redirect(`${dashboardUrl}/magic-link-error?reason=invalid`);
    }

    // Mark token as used (one-time use per OWASP)
    await prisma.magicLinkToken.update({
      where: { id: magicToken.id },
      data: { used: true, usedAt: new Date() }
    });

    // Perform action
    // Note: We use a system user ID since the user is not authenticated
    // The magic link itself is proof of authorization
    const systemUserId = 'magic-link';

    try {
      if (action === 'acknowledge') {
        await incidentService.acknowledge(incidentId, systemUserId, { note: 'Acknowledged via email magic link' });
        logger.info({ incidentId }, 'Incident acknowledged via magic link');
        res.redirect(`${dashboardUrl}/incidents/${incidentId}?action=acknowledged`);
      } else {
        await incidentService.resolve(incidentId, systemUserId, { resolutionNote: 'Resolved via email magic link' });
        logger.info({ incidentId }, 'Incident resolved via magic link');
        res.redirect(`${dashboardUrl}/incidents/${incidentId}?action=resolved`);
      }
    } catch (actionError) {
      const msg = actionError instanceof Error ? actionError.message : 'Unknown error';
      logger.warn({ incidentId, action, error: msg }, 'Magic link action failed');
      res.redirect(`${dashboardUrl}/incidents/${incidentId}?error=${encodeURIComponent(msg)}`);
    }

  } catch (error) {
    logger.error({ error, incidentId, action }, 'Magic link handler error');
    res.redirect(`${dashboardUrl}/magic-link-error?reason=error`);
  }
}

export const magicLinksRouter = router;
