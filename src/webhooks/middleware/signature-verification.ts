import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database.js';
import { verifyHmacSignature } from '../../utils/hmac-verifier.js';
import { auditService } from '../../services/audit.service.js';
import { logger } from '../../config/logger.js';

export interface SignatureVerifierOptions {
  integrationId?: string;      // Lookup by ID
  integrationName?: string;    // Lookup by name
}

/**
 * Parse timestamp from various formats.
 * Supports: ISO 8601 strings, Unix timestamps (seconds), Unix timestamps (milliseconds)
 */
function parseTimestamp(value: string | number): Date | null {
  if (typeof value === 'number') {
    // Unix timestamp - detect if seconds or milliseconds
    // Timestamps in seconds are ~10 digits, milliseconds are ~13 digits
    if (value > 1e12) {
      return new Date(value); // milliseconds
    }
    return new Date(value * 1000); // seconds
  }

  if (typeof value === 'string') {
    // Try parsing as number first (string representation of Unix timestamp)
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return parseTimestamp(numValue);
    }
    // Try ISO string
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/**
 * Extract timestamp from request based on integration type or header config.
 * Returns null if no timestamp found or if timestamp validation is not configured.
 */
function extractTimestamp(
  req: Request,
  integration: { type: string; timestampHeader?: string | null }
): Date | null {
  // 1. Check configured timestamp header
  if (integration.timestampHeader) {
    const headerValue = req.headers[integration.timestampHeader.toLowerCase()];
    if (headerValue) {
      return parseTimestamp(Array.isArray(headerValue) ? headerValue[0] : headerValue);
    }
  }

  // 2. Provider-specific timestamp extraction from payload
  const body = req.body;
  if (!body) return null;

  switch (integration.type) {
    case 'datadog':
      // Datadog includes timestamp as 'date' (Unix seconds)
      if (body.date) {
        return parseTimestamp(body.date);
      }
      break;

    case 'newrelic':
      // New Relic includes timestamp as 'timestamp' (ISO string or Unix ms)
      if (body.timestamp) {
        return parseTimestamp(body.timestamp);
      }
      break;

    case 'generic':
      // Generic webhooks: check common timestamp fields
      const timestampFields = ['timestamp', 'time', 'date', 'created_at', 'triggered_at'];
      for (const field of timestampFields) {
        if (body[field]) {
          const parsed = parseTimestamp(body[field]);
          if (parsed) return parsed;
        }
      }
      break;
  }

  return null;
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

    // Timestamp validation (replay attack prevention)
    // Only validate if integration has timestamp header configured or uses provider-specific timestamps
    const maxAgeSeconds = integration.timestampMaxAge || 300; // Default 5 minutes
    const webhookTimestamp = extractTimestamp(req, integration);

    if (webhookTimestamp) {
      const now = Date.now();
      const webhookTime = webhookTimestamp.getTime();
      const ageSeconds = (now - webhookTime) / 1000;

      if (ageSeconds > maxAgeSeconds) {
        await auditService.log({
          action: 'webhook.timestamp_expired',
          severity: 'WARN',
          metadata: {
            integration: integration.name,
            path: req.path,
            webhookTimestamp: webhookTimestamp.toISOString(),
            ageSeconds: Math.round(ageSeconds),
            maxAgeSeconds
          }
        });

        logger.warn({
          integration: integration.name,
          webhookTimestamp: webhookTimestamp.toISOString(),
          ageSeconds: Math.round(ageSeconds),
          maxAgeSeconds
        }, 'Webhook rejected: timestamp too old');

        res.status(401).json({
          type: 'https://api.oncall.com/errors/webhook-expired',
          title: 'Webhook expired',
          status: 401,
          detail: `Webhook timestamp is older than ${maxAgeSeconds} seconds`,
          instance: req.path
        });
        return;
      }

      // Also reject webhooks from the future (clock skew > 60 seconds)
      if (ageSeconds < -60) {
        await auditService.log({
          action: 'webhook.timestamp_future',
          severity: 'WARN',
          metadata: {
            integration: integration.name,
            path: req.path,
            webhookTimestamp: webhookTimestamp.toISOString(),
            futureSeconds: Math.round(-ageSeconds)
          }
        });

        logger.warn({
          integration: integration.name,
          webhookTimestamp: webhookTimestamp.toISOString(),
          futureSeconds: Math.round(-ageSeconds)
        }, 'Webhook rejected: timestamp in future');

        res.status(401).json({
          type: 'https://api.oncall.com/errors/webhook-timestamp-future',
          title: 'Invalid webhook timestamp',
          status: 401,
          detail: 'Webhook timestamp is in the future',
          instance: req.path
        });
        return;
      }
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
