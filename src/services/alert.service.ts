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

interface AlertSearchQuery {
  teamId?: string;
  integrationId?: string;
  status?: string | string[];
  severity?: string | string[];
  searchTerm?: string;
  startDate?: Date;
  endDate?: Date;
  incidentId?: string;
  hasIncident?: boolean;
}

interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

interface AlertSearchResult {
  alerts: any[];
  nextCursor: string | null;
  total?: number;
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
   * Search alerts with filters (ALERT-04).
   */
  async search(
    query: AlertSearchQuery,
    options: PaginationOptions = {}
  ): Promise<AlertSearchResult> {
    const { limit = 50, cursor } = options;

    const where: any = {};

    // Filter by integration
    if (query.integrationId) {
      where.integrationId = query.integrationId;
    }

    // Filter by status (via incident)
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      where.incident = { status: { in: statuses } };
    }

    // Filter by severity
    if (query.severity) {
      const severities = Array.isArray(query.severity) ? query.severity : [query.severity];
      where.severity = { in: severities };
    }

    // Filter by team (via incident)
    if (query.teamId) {
      where.incident = { ...where.incident, teamId: query.teamId };
    }

    // Filter by incident
    if (query.incidentId) {
      where.incidentId = query.incidentId;
    }

    // Filter alerts with/without incidents
    if (query.hasIncident !== undefined) {
      where.incidentId = query.hasIncident ? { not: null } : null;
    }

    // Date range on triggeredAt
    if (query.startDate || query.endDate) {
      where.triggeredAt = {
        ...(query.startDate && { gte: query.startDate }),
        ...(query.endDate && { lte: query.endDate })
      };
    }

    // Full-text search on title and description
    if (query.searchTerm) {
      where.OR = [
        { title: { contains: query.searchTerm, mode: 'insensitive' } },
        { description: { contains: query.searchTerm, mode: 'insensitive' } }
      ];
    }

    // Execute query with cursor pagination
    const alerts = await prisma.alert.findMany({
      where,
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor }
      }),
      orderBy: { triggeredAt: 'desc' },
      include: {
        integration: { select: { id: true, name: true, type: true } },
        incident: {
          select: {
            id: true,
            status: true,
            priority: true,
            teamId: true,
            assignedUserId: true,
            createdAt: true,
            acknowledgedAt: true,
            resolvedAt: true
          }
        }
      }
    });

    return {
      alerts,
      nextCursor: alerts.length === limit ? alerts[alerts.length - 1].id : null
    };
  }

  /**
   * Gets an alert by ID with full details.
   */
  async getById(id: string): Promise<any> {
    return prisma.alert.findUnique({
      where: { id },
      include: {
        integration: { select: { id: true, name: true, type: true } },
        incident: {
          select: {
            id: true,
            status: true,
            priority: true,
            teamId: true,
            team: { select: { id: true, name: true } },
            assignedUserId: true,
            assignedUser: { select: { id: true, firstName: true, lastName: true } },
            alertCount: true,
            createdAt: true,
            acknowledgedAt: true,
            resolvedAt: true
          }
        },
        deliveries: {
          select: {
            id: true,
            statusCode: true,
            processedAt: true,
            errorMessage: true
          },
          orderBy: { processedAt: 'desc' },
          take: 5
        }
      }
    });
  }

  /**
   * Get alert history for a team (ALERT-05).
   */
  async getHistory(
    teamId: string,
    options: {
      days?: number;
      limit?: number;
      includeResolved?: boolean;
    } = {}
  ): Promise<any[]> {
    const { days = 30, limit = 100, includeResolved = true } = options;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const statuses = includeResolved
      ? ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED']
      : ['OPEN', 'ACKNOWLEDGED'];

    return prisma.alert.findMany({
      where: {
        incident: {
          teamId,
          status: { in: statuses }
        },
        triggeredAt: { gte: startDate }
      },
      take: limit,
      orderBy: { triggeredAt: 'desc' },
      include: {
        incident: {
          select: {
            id: true,
            status: true,
            priority: true,
            alertCount: true
          }
        }
      }
    });
  }

  /**
   * Get alert counts by severity for dashboard.
   */
  async getCountsBySeverity(
    teamId?: string,
    days: number = 7
  ): Promise<Record<string, number>> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = { triggeredAt: { gte: startDate } };

    if (teamId) {
      where.incident = { teamId };
    }

    const counts = await prisma.alert.groupBy({
      by: ['severity'],
      where,
      _count: { severity: true }
    });

    return counts.reduce((acc, { severity, _count }) => {
      acc[severity] = _count.severity;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Lists alerts with filters (legacy method for backwards compatibility).
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
