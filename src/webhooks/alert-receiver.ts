import { Router, Request, Response } from 'express';
import { rawBodyCapture } from './middleware/raw-body-capture.js';
import { createDynamicSignatureVerifier } from './middleware/signature-verification.js';
import { idempotencyService } from '../services/idempotency.service.js';
import { alertService } from '../services/alert.service.js';
import { getNormalizer, validateAlertPayload } from './schemas/index.js';
import { formatValidationError, createProblemDetails } from '../utils/problem-details.js';
import { auditService } from '../services/audit.service.js';
import { logger } from '../config/logger.js';
import { deduplicationService } from '../services/deduplication.service.js';
import { escalationService } from '../services/escalation.service.js';
import { generateContentFingerprint } from '../utils/content-fingerprint.js';
import { webhookRateLimiter } from '../middleware/rateLimiter.js';

export const alertWebhookRouter = Router();

// Rate limit: 1000 req/min per IP (webhook tier for high-volume monitoring tools)
alertWebhookRouter.use(webhookRateLimiter);

// Apply raw body capture (required for signature verification)
alertWebhookRouter.use(rawBodyCapture('1mb'));

/**
 * POST /webhooks/alerts/:integrationName
 * Receives alerts from monitoring tools.
 */
alertWebhookRouter.post(
  '/:integrationName',
  createDynamicSignatureVerifier(),
  async (req: Request, res: Response): Promise<void> => {
    // Integration attached by signature verifier
    const integration = (req as any).integration;

    if (!integration) {
      // This shouldn't happen if signature verifier ran, but guard anyway
      res.status(500).json(createProblemDetails(
        'internal-error',
        'Integration context missing',
        500
      ));
      return;
    }

    const headers = req.headers as Record<string, string | string[] | undefined>;
    const fingerprint = idempotencyService.generateFingerprint(req.body);
    const idempotencyKey = idempotencyService.extractKey(headers);

    try {
      // 1. Check for duplicate
      const duplicateCheck = await idempotencyService.checkDuplicate(
        integration.id,
        headers,
        req.body,
        integration.deduplicationWindowMinutes
      );

      if (duplicateCheck.isDuplicate) {
        // Record the delivery attempt (duplicate)
        await alertService.recordDeliveryOnly({
          integrationId: integration.id,
          alertId: duplicateCheck.existingAlertId,
          idempotencyKey,
          contentFingerprint: fingerprint,
          rawPayload: req.body,
          headers: alertService.sanitizeHeaders(req.headers),
          statusCode: 200,
          errorMessage: 'Duplicate webhook'
        });

        await auditService.log({
          action: 'webhook.duplicate',
          resourceType: 'alert',
          resourceId: duplicateCheck.existingAlertId,
          metadata: {
            integration: integration.name,
            idempotencyKey,
            fingerprint: fingerprint.substring(0, 16)
          }
        });

        // Return 200 with existing alert ID (idempotent behavior per locked decision)
        res.status(200).json({
          alert_id: duplicateCheck.existingAlertId,
          status: 'duplicate',
          message: 'Alert already processed',
          idempotent: true
        });
        return;
      }

      // 2. Validate and normalize payload
      // Provider-specific types (datadog, newrelic) use direct normalization with Zod validation
      // Generic type uses existing validation path for backward compatibility
      let normalizedData;

      if (integration.type === 'datadog' || integration.type === 'newrelic') {
        // Provider-specific normalization (includes Zod validation)
        const normalizer = getNormalizer(integration.type);

        try {
          normalizedData = normalizer(req.body, integration.name);
        } catch (error) {
          // Record validation failure
          await alertService.recordDeliveryOnly({
            integrationId: integration.id,
            idempotencyKey,
            contentFingerprint: fingerprint,
            rawPayload: req.body,
            headers: alertService.sanitizeHeaders(req.headers),
            statusCode: 400,
            errorMessage: error instanceof Error ? error.message : 'Validation failed'
          });

          await auditService.log({
            action: 'webhook.validation_failed',
            severity: 'WARN',
            metadata: {
              integration: integration.name,
              type: integration.type,
              error: error instanceof Error ? error.message : 'Validation failed'
            }
          });

          res.status(400).json(createProblemDetails(
            'validation-failed',
            'Invalid webhook payload',
            400,
            { detail: error instanceof Error ? error.message : 'Validation failed' }
          ));
          return;
        }
      } else {
        // Generic validation path (existing behavior)
        const validation = validateAlertPayload(req.body, integration.name);

        if (!validation.success) {
          // Record the delivery attempt (validation failure)
          await alertService.recordDeliveryOnly({
            integrationId: integration.id,
            idempotencyKey,
            contentFingerprint: fingerprint,
            rawPayload: req.body,
            headers: alertService.sanitizeHeaders(req.headers),
            statusCode: 400,
            errorMessage: validation.error.message
          });

          await auditService.log({
            action: 'webhook.validation_failed',
            severity: 'WARN',
            metadata: {
              integration: integration.name,
              errors: validation.error.issues.length
            }
          });

          res.status(400).json(formatValidationError(validation.error, req.path));
          return;
        }

        normalizedData = validation.data;
      }

      // 3. Create alert with delivery log
      const { alert } = await alertService.createWithDelivery(
        {
          title: normalizedData.title,
          description: normalizedData.description,
          severity: normalizedData.severity,
          triggeredAt: normalizedData.triggeredAt,
          source: normalizedData.source,
          externalId: normalizedData.externalId,
          metadata: normalizedData.metadata,
          integrationId: integration.id
        },
        {
          idempotencyKey,
          contentFingerprint: fingerprint,
          rawPayload: req.body,
          headers: alertService.sanitizeHeaders(req.headers),
          statusCode: 201
        }
      );

      await auditService.log({
        action: 'alert.created',
        resourceType: 'alert',
        resourceId: alert.id,
        metadata: {
          integration: integration.name,
          title: alert.title,
          severity: alert.severity
        }
      });

      // 4. Generate fingerprint for deduplication
      const deduplicationFingerprint = generateContentFingerprint({
        title: alert.title,
        source: alert.source,
        severity: alert.severity,
        // Include service metadata if present
        service: (alert.metadata as any)?.service || alert.source
      });

      // 5. Deduplicate and create/link incident (pass integration for service routing fallback)
      const { incident, isDuplicate } = await deduplicationService.deduplicateAndCreateIncident(
        alert.id,
        deduplicationFingerprint,
        alert,
        integration.deduplicationWindowMinutes,
        { defaultServiceId: integration.defaultServiceId }
      );

      // 6. If new incident, start escalation
      if (!isDuplicate) {
        await escalationService.startEscalation(incident.id);
      }

      logger.info({
        msg: isDuplicate ? 'Alert grouped to existing incident' : 'New incident created from alert',
        alertId: alert.id,
        incidentId: incident.id,
        isDuplicate,
        integration: integration.name,
        severity: alert.severity,
        fingerprint: deduplicationFingerprint.substring(0, 16)
      });

      res.status(201).json({
        alert_id: alert.id,
        incident_id: incident.id,
        status: isDuplicate ? 'grouped' : 'created',
        title: alert.title,
        severity: alert.severity,
        triggered_at: alert.triggeredAt.toISOString()
      });

    } catch (error) {
      // Record delivery failure
      try {
        await alertService.recordDeliveryOnly({
          integrationId: integration.id,
          idempotencyKey,
          contentFingerprint: fingerprint,
          rawPayload: req.body,
          headers: alertService.sanitizeHeaders(req.headers),
          statusCode: 500,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (logError) {
        logger.error({ error: logError }, 'Failed to log delivery failure');
      }

      await auditService.log({
        action: 'webhook.processing_failed',
        severity: 'HIGH',
        metadata: {
          integration: integration.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      logger.error({ error }, 'Webhook processing failed');

      res.status(500).json(createProblemDetails(
        'processing-failed',
        'Internal processing error',
        500,
        { detail: 'An unexpected error occurred while processing the webhook' }
      ));
    }
  }
);

/**
 * GET /webhooks/alerts/:integrationName/test
 * Test endpoint to verify webhook URL is reachable (no auth required).
 */
alertWebhookRouter.get('/:integrationName/test', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Webhook endpoint is reachable. POST alerts to this URL.',
    timestamp: new Date().toISOString()
  });
});
