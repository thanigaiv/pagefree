import { Request, Response, NextFunction } from 'express';
import { partnerAccessService } from './partnerAccess.service.js';
import { auditService } from '../services/audit.service.js';

/**
 * Middleware to verify partner has access to the requested status page
 * Must be used after loadPartnerUser and requirePartnerAuth
 */
export async function requirePartnerAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const partner = (req as any).partnerUser;
  const { statusPageId } = req.params;

  if (!partner) {
    res.status(401).json({ error: 'Partner authentication required' });
    return;
  }

  if (!statusPageId) {
    res.status(400).json({ error: 'Status page ID required' });
    return;
  }

  const hasAccess = await partnerAccessService.hasAccess(partner.id, statusPageId);

  if (!hasAccess) {
    // Log access denial
    await auditService.log({
      action: 'partner.access.denied',
      resourceType: 'StatusPage',
      resourceId: statusPageId,
      metadata: {
        partnerEmail: partner.email,
        partnerId: partner.id,
        reason: 'no_access_grant'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'WARN'
    });

    res.status(403).json({ error: 'Access denied to this status page' });
    return;
  }

  next();
}
