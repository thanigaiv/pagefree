import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

// Extend Express session type for partner
declare module 'express-session' {
  interface SessionData {
    partnerId?: string;
    partnerEmail?: string;
  }
}

/**
 * Load partner user from session if present
 * Attaches to req.partnerUser
 */
export async function loadPartnerUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.session?.partnerId) {
    const partner = await prisma.partnerUser.findUnique({
      where: { id: req.session.partnerId },
      include: {
        statusPageAccess: {
          include: {
            statusPage: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });

    if (partner && partner.isActive) {
      (req as any).partnerUser = partner;
    } else {
      // Partner deactivated, destroy session
      req.session.destroy(() => {});
    }
  }
  next();
}

/**
 * Require partner authentication
 * Returns 401 if not authenticated
 */
export function requirePartnerAuth(req: Request, res: Response, next: NextFunction): void {
  if (!(req as any).partnerUser) {
    res.status(401).json({ error: 'Partner authentication required' });
    return;
  }
  next();
}
