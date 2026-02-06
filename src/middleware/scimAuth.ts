import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { auditService } from '../services/audit.service.js';

export async function scimAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await auditService.log({
      action: 'scim.auth.missing',
      severity: 'WARN',
      metadata: { path: req.path },
      ipAddress: req.ip
    });

    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Authentication required'
    });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  // Constant-time comparison to prevent timing attacks
  const expectedToken = env.SCIM_BEARER_TOKEN;
  if (!expectedToken) {
    console.error('SCIM_BEARER_TOKEN not configured');
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'SCIM not configured'
    });
    return;
  }

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    );

    if (!isValid) {
      throw new Error('Token mismatch');
    }
  } catch {
    await auditService.log({
      action: 'scim.auth.invalid',
      severity: 'HIGH',
      metadata: { path: req.path },
      ipAddress: req.ip
    });

    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid authentication'
    });
    return;
  }

  next();
}
