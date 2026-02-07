import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database.js';
import { verifyHmacSignature } from '../../utils/hmac-verifier.js';
import { auditService } from '../../services/audit.service.js';

export interface SignatureVerifierOptions {
  integrationId?: string;      // Lookup by ID
  integrationName?: string;    // Lookup by name
}

/**
 * Creates middleware that verifies webhook signature for a specific integration.
 * Requires rawBodyCapture middleware to run first.
 *
 * @param options - Integration identifier (id or name)
 * @returns Express middleware
 */
export function createSignatureVerifier(options: SignatureVerifierOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Ensure rawBody was captured
    if (!req.rawBody) {
      res.status(500).json({
        type: 'https://api.oncall.com/errors/configuration-error',
        title: 'Raw body not captured',
        status: 500,
        detail: 'rawBodyCapture middleware must run before signature verification'
      });
      return;
    }

    // Load integration config
    const integration = await prisma.integration.findFirst({
      where: options.integrationId
        ? { id: options.integrationId, isActive: true }
        : { name: options.integrationName, isActive: true }
    });

    if (!integration) {
      res.status(404).json({
        type: 'https://api.oncall.com/errors/integration-not-found',
        title: 'Integration not found',
        status: 404,
        detail: 'The specified integration does not exist or is inactive'
      });
      return;
    }

    // Extract signature from configured header
    const signatureHeader = integration.signatureHeader.toLowerCase();
    const signature = req.headers[signatureHeader] as string;

    if (!signature) {
      await auditService.log({
        action: 'webhook.signature_missing',
        severity: 'HIGH',
        metadata: {
          integration: integration.name,
          expectedHeader: integration.signatureHeader,
          path: req.path
        }
      });

      res.status(401).json({
        type: 'https://api.oncall.com/errors/missing-signature',
        title: 'Missing signature header',
        status: 401,
        detail: `${integration.signatureHeader} header is required`,
        instance: req.path
      });
      return;
    }

    // Verify signature
    const isValid = verifyHmacSignature(
      req.rawBody,
      signature,
      integration.webhookSecret,
      {
        algorithm: integration.signatureAlgorithm as 'sha256' | 'sha512',
        format: integration.signatureFormat as 'hex' | 'base64',
        prefix: integration.signaturePrefix || undefined
      }
    );

    if (!isValid) {
      await auditService.log({
        action: 'webhook.signature_invalid',
        severity: 'HIGH',
        metadata: {
          integration: integration.name,
          path: req.path,
          // Don't log the actual signature (security)
        }
      });

      res.status(401).json({
        type: 'https://api.oncall.com/errors/invalid-signature',
        title: 'Invalid signature',
        status: 401,
        detail: 'Webhook signature verification failed',
        instance: req.path
      });
      return;
    }

    // Attach integration to request for downstream handlers
    (req as any).integration = integration;
    next();
  };
}

/**
 * Creates middleware that verifies signature using integration name from URL param.
 * Use this for routes like /webhooks/:integrationName
 */
export function createDynamicSignatureVerifier() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const integrationName = req.params.integrationName || req.params.integration;

    if (!integrationName) {
      res.status(400).json({
        type: 'https://api.oncall.com/errors/missing-integration',
        title: 'Missing integration parameter',
        status: 400,
        detail: 'Integration name must be provided in URL'
      });
      return;
    }

    // Delegate to the standard verifier
    const verifier = createSignatureVerifier({ integrationName });
    return verifier(req, res, next);
  };
}
