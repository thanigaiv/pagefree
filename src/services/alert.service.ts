import { prisma } from '../config/database.js';
import { AlertSeverity, AlertStatus } from '@prisma/client';
import { auditService } from './audit.service.js';

export interface CreateAlertParams {
  title: string;
  description: string | null;
  severity: AlertSeverity;
  triggeredAt: Date;
  source: string | null;
  externalId: string | null;
  metadata: Record<string, any>;
  integrationId: string;
}

export interface RecordDeliveryParams {
  integrationId: string;
  alertId?: string;
  idempotencyKey?: string;
  contentFingerprint: string;
  rawPayload: any;
  headers: Record<string, any>;
  statusCode: number;
  errorMessage?: string;
}

class AlertService {
  /**
   * Creates an alert and records the webhook delivery atomically.
   */
  async createWithDelivery(
    alertParams: CreateAlertParams,
    deliveryParams: Omit<RecordDeliveryParams, 'integrationId' | 'alertId'>
  ) {
    return prisma.$transaction(async (tx) => {
      // Create the alert
      const alert = await tx.alert.create({
        data: {
          title: alertParams.title,
          description: alertParams.description,
          severity: alertParams.severity,
          status: AlertStatus.OPEN,
          source: alertParams.source || 'unknown',
          externalId: alertParams.externalId,
          triggeredAt: alertParams.triggeredAt,
          metadata: alertParams.metadata,
          integrationId: alertParams.integrationId
        }
      });

      // Record the webhook delivery
      const delivery = await tx.webhookDelivery.create({
        data: {
          integrationId: alertParams.integrationId,
          alertId: alert.id,
          idempotencyKey: deliveryParams.idempotencyKey,
          contentFingerprint: deliveryParams.contentFingerprint,
          rawPayload: deliveryParams.rawPayload,
          headers: deliveryParams.headers,
          statusCode: deliveryParams.statusCode,
          errorMessage: deliveryParams.errorMessage,
          processedAt: new Date()
        }
      });

      return { alert, delivery };
    });
  }

  /**
   * Records a webhook delivery without creating an alert (for duplicates/failures).
   */
  async recordDeliveryOnly(params: RecordDeliveryParams) {
    return prisma.webhookDelivery.create({
      data: {
        integrationId: params.integrationId,
        alertId: params.alertId,
        idempotencyKey: params.idempotencyKey,
        contentFingerprint: params.contentFingerprint,
        rawPayload: params.rawPayload,
        headers: params.headers,
        statusCode: params.statusCode,
        errorMessage: params.errorMessage,
        processedAt: new Date()
      }
    });
  }

  /**
   * Gets an alert by ID.
   */
  async getById(id: string) {
    return prisma.alert.findUnique({
      where: { id },
      include: {
        integration: {
          select: { id: true, name: true, type: true }
        }
      }
    });
  }

  /**
   * Lists alerts with filters.
   */
  async list(options: {
    integrationId?: string;
    status?: AlertStatus;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
  } = {}) {
    const { integrationId, status, severity, limit = 50, offset = 0 } = options;

    return prisma.alert.findMany({
      where: {
        ...(integrationId && { integrationId }),
        ...(status && { status }),
        ...(severity && { severity })
      },
      orderBy: { triggeredAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        integration: {
          select: { id: true, name: true, type: true }
        }
      }
    });
  }

  /**
   * Acknowledges an alert.
   */
  async acknowledge(id: string, userId: string) {
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date()
      }
    });

    await auditService.log({
      action: 'alert.acknowledged',
      userId,
      resourceType: 'alert',
      resourceId: id,
      metadata: { title: alert.title }
    });

    return alert;
  }

  /**
   * Resolves an alert.
   */
  async resolve(id: string, userId: string) {
    const alert = await prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date()
      }
    });

    await auditService.log({
      action: 'alert.resolved',
      userId,
      resourceType: 'alert',
      resourceId: id,
      metadata: { title: alert.title }
    });

    return alert;
  }

  /**
   * Sanitizes headers for storage (remove sensitive values).
   */
  sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitivePatterns = [
      /authorization/i,
      /x-webhook-secret/i,
      /x-api-key/i,
      /cookie/i,
      /x-.*-token/i,
      /x-.*-signature/i
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers)) {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      sanitized[key] = isSensitive ? '[REDACTED]' : value;
    }

    return sanitized;
  }
}

export const alertService = new AlertService();
