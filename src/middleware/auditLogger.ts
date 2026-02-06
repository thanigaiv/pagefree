import { Request, Response, NextFunction } from 'express';
import { AuditEvent } from '@prisma/client';
import { auditService } from '../services/audit.service.js';
import { AuditLogParams } from '../types/audit.js';

// Extend Express Request interface with audit helper
declare global {
  namespace Express {
    interface Request {
      audit: (action: string, params?: Partial<AuditLogParams>) => Promise<AuditEvent>;
    }
  }
}

/**
 * Middleware that attaches audit helper to request object
 * Automatically includes userId, ipAddress, and userAgent from request context
 */
export function auditMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.audit = async (action: string, params: Partial<AuditLogParams> = {}) => {
    return auditService.log({
      action,
      userId: (req.user as any)?.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      ...params,
    });
  };
  next();
}
