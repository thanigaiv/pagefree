import { Request, Response, NextFunction } from 'express';
import { apiKeyService, ApiKeyScope } from '../services/apiKey.service.js';
import { auditService } from '../services/audit.service.js';

// Extend Express Request to include apiKey
declare global {
  namespace Express {
    interface Request {
      apiKey?: any;
    }
  }
}

// Middleware to authenticate via API key
export function apiKeyAuth(requiredScope?: ApiKeyScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Extract API key from Authorization header
    // Format: "Bearer sk_xxx" or "ApiKey sk_xxx"
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      await auditService.log({
        action: 'apikey.auth.missing',
        severity: 'WARN',
        metadata: { path: req.path },
        ipAddress: req.ip
      });

      res.status(401).json({ error: 'API key required' });
      return;
    }

    // Extract key (support both "Bearer" and "ApiKey" prefixes)
    let key: string;
    if (authHeader.startsWith('Bearer ')) {
      key = authHeader.substring(7);
    } else if (authHeader.startsWith('ApiKey ')) {
      key = authHeader.substring(7);
    } else {
      res.status(401).json({ error: 'Invalid authorization format. Use: Authorization: Bearer <key>' });
      return;
    }

    // Validate key
    const validation = await apiKeyService.validate(key);

    if (!validation.valid) {
      await auditService.log({
        action: 'apikey.auth.failed',
        severity: 'HIGH',
        metadata: {
          path: req.path,
          reason: validation.reason
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(401).json({ error: 'Invalid or expired API key' });
      return;
    }

    // Check required scope if specified
    if (requiredScope && !apiKeyService.hasScope(validation.apiKey, requiredScope)) {
      await auditService.log({
        action: 'apikey.auth.insufficient_scope',
        severity: 'WARN',
        metadata: {
          path: req.path,
          requiredScope,
          apiKeyId: validation.apiKey.id,
          service: validation.apiKey.service
        },
        ipAddress: req.ip
      });

      res.status(403).json({ error: `Insufficient scope. Required: ${requiredScope}` });
      return;
    }

    // Attach API key to request
    req.apiKey = validation.apiKey;

    // Log successful authentication (async, don't block)
    auditService.log({
      action: 'apikey.auth.success',
      metadata: {
        apiKeyId: validation.apiKey.id,
        service: validation.apiKey.service,
        path: req.path
      },
      ipAddress: req.ip
    }).catch(err => console.error('Audit log failed:', err));

    next();
  };
}
