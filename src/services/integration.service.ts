import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { AlertSeverity } from '@prisma/client';
import { auditService } from './audit.service.js';
import { scheduleAutoResolve } from '../queues/test-resolve.queue.js';
import { alertService } from './alert.service.js';
import { deduplicationService } from './deduplication.service.js';
import { generateContentFingerprint } from '../utils/content-fingerprint.js';

export interface CreateIntegrationParams {
  name: string;
  type: 'datadog' | 'newrelic' | 'pagerduty' | 'generic';
  signatureHeader?: string;
  signatureAlgorithm?: 'sha256' | 'sha512';
  signatureFormat?: 'hex' | 'base64';
  signaturePrefix?: string;
  deduplicationWindowMinutes?: number;
}

export interface UpdateIntegrationParams {
  name?: string;
  signatureHeader?: string;
  signatureAlgorithm?: 'sha256' | 'sha512';
  signatureFormat?: 'hex' | 'base64';
  signaturePrefix?: string;
  deduplicationWindowMinutes?: number;
  isActive?: boolean;
}

// Default configurations per integration type
const TYPE_DEFAULTS: Record<string, Partial<CreateIntegrationParams>> = {
  datadog: {
    signatureHeader: 'X-Datadog-Signature',
    signatureAlgorithm: 'sha256',
    signatureFormat: 'hex',
    signaturePrefix: '',
    deduplicationWindowMinutes: 15
  },
  newrelic: {
    signatureHeader: 'X-NewRelic-Signature',
    signatureAlgorithm: 'sha256',
    signatureFormat: 'hex',
    signaturePrefix: '',
    deduplicationWindowMinutes: 15
  },
  pagerduty: {
    signatureHeader: 'X-PagerDuty-Signature',
    signatureAlgorithm: 'sha256',
    signatureFormat: 'base64',
    signaturePrefix: 'v1=',
    deduplicationWindowMinutes: 10
  },
  generic: {
    signatureHeader: 'X-Webhook-Signature',
    signatureAlgorithm: 'sha256',
    signatureFormat: 'hex',
    signaturePrefix: '',
    deduplicationWindowMinutes: 15
  }
};

class IntegrationService {
  /**
   * Creates a new integration with a generated webhook secret.
   * Returns the secret ONCE - it cannot be retrieved later.
   */
  async create(params: CreateIntegrationParams, userId: string) {
    // Generate cryptographically secure secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Merge type defaults with provided params
    const defaults = TYPE_DEFAULTS[params.type] || TYPE_DEFAULTS.generic;

    const integration = await prisma.integration.create({
      data: {
        name: params.name,
        type: params.type,
        webhookSecret,
        signatureHeader: params.signatureHeader || defaults.signatureHeader!,
        signatureAlgorithm: params.signatureAlgorithm || defaults.signatureAlgorithm!,
        signatureFormat: params.signatureFormat || defaults.signatureFormat!,
        signaturePrefix: params.signaturePrefix ?? defaults.signaturePrefix ?? null,
        deduplicationWindowMinutes: params.deduplicationWindowMinutes || defaults.deduplicationWindowMinutes!
      }
    });

    await auditService.log({
      action: 'integration.created',
      userId,
      resourceType: 'integration',
      resourceId: integration.id,
      severity: 'HIGH',
      metadata: {
        name: integration.name,
        type: integration.type
      }
    });

    // Return integration with secret (one-time only)
    return {
      ...this.sanitize(integration),
      webhookSecret  // Include secret on creation only
    };
  }

  /**
   * Lists all integrations (secrets redacted).
   */
  async list() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { alerts: true, webhookDeliveries: true }
        },
        webhookDeliveries: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        }
      }
    });

    // Count errors separately (24h window)
    const errorCounts = await prisma.webhookDelivery.groupBy({
      by: ['integrationId'],
      where: {
        statusCode: { gte: 400 },
        createdAt: { gte: twentyFourHoursAgo }
      },
      _count: true
    });

    const errorCountMap = Object.fromEntries(
      errorCounts.map(e => [e.integrationId, e._count])
    );

    return integrations.map(int => ({
      ...this.sanitize(int),
      alertCount: int._count.alerts,
      webhookCount: int._count.webhookDeliveries,
      lastWebhookAt: int.webhookDeliveries[0]?.createdAt || null,
      errorCount: errorCountMap[int.id] || 0
    }));
  }

  /**
   * Gets a single integration by ID (secret redacted).
   */
  async getById(id: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const integration = await prisma.integration.findUnique({
      where: { id },
      include: {
        _count: {
          select: { alerts: true, webhookDeliveries: true }
        },
        webhookDeliveries: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        }
      }
    });

    if (!integration) return null;

    // Count errors in 24h window
    const errorCount = await prisma.webhookDelivery.count({
      where: {
        integrationId: id,
        statusCode: { gte: 400 },
        createdAt: { gte: twentyFourHoursAgo }
      }
    });

    return {
      ...this.sanitize(integration),
      alertCount: integration._count.alerts,
      webhookCount: integration._count.webhookDeliveries,
      lastWebhookAt: integration.webhookDeliveries[0]?.createdAt || null,
      errorCount
    };
  }

  /**
   * Gets a single integration by name (secret redacted).
   */
  async getByName(name: string) {
    const integration = await prisma.integration.findUnique({
      where: { name }
    });

    if (!integration) return null;

    return this.sanitize(integration);
  }

  /**
   * Updates integration configuration (cannot change secret).
   */
  async update(id: string, params: UpdateIntegrationParams, userId: string) {
    const existing = await prisma.integration.findUnique({ where: { id } });
    if (!existing) return null;

    const integration = await prisma.integration.update({
      where: { id },
      data: {
        name: params.name,
        signatureHeader: params.signatureHeader,
        signatureAlgorithm: params.signatureAlgorithm,
        signatureFormat: params.signatureFormat,
        signaturePrefix: params.signaturePrefix,
        deduplicationWindowMinutes: params.deduplicationWindowMinutes,
        isActive: params.isActive
      }
    });

    await auditService.log({
      action: 'integration.updated',
      userId,
      resourceType: 'integration',
      resourceId: integration.id,
      severity: 'INFO',
      metadata: {
        name: integration.name,
        changes: params
      }
    });

    return this.sanitize(integration);
  }

  /**
   * Rotates the webhook secret for an integration.
   * Returns the new secret ONCE.
   */
  async rotateSecret(id: string, userId: string) {
    const existing = await prisma.integration.findUnique({ where: { id } });
    if (!existing) return null;

    const newSecret = crypto.randomBytes(32).toString('hex');

    const integration = await prisma.integration.update({
      where: { id },
      data: { webhookSecret: newSecret }
    });

    await auditService.log({
      action: 'integration.secret_rotated',
      userId,
      resourceType: 'integration',
      resourceId: integration.id,
      severity: 'HIGH',
      metadata: { name: integration.name }
    });

    return {
      ...this.sanitize(integration),
      webhookSecret: newSecret  // Include new secret on rotation
    };
  }

  /**
   * Deletes an integration (hard delete).
   * WARNING: This will orphan related alerts and webhook deliveries.
   */
  async delete(id: string, userId: string) {
    const existing = await prisma.integration.findUnique({ where: { id } });
    if (!existing) return false;

    await prisma.integration.delete({ where: { id } });

    await auditService.log({
      action: 'integration.deleted',
      userId,
      resourceType: 'integration',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: existing.name }
    });

    return true;
  }

  /**
   * Test webhook integration by generating mock payload and processing it.
   * Creates test alert that auto-resolves after 5 minutes.
   */
  async testWebhook(integrationId: string, userId: string) {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration) throw new Error('Integration not found');

    // Generate mock payload based on type
    const mockPayload = this.generateMockPayload(integration.type);

    // Create alert with test flag
    const fingerprint = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const { alert } = await alertService.createWithDelivery(
      {
        title: mockPayload.title,
        description: mockPayload.description,
        severity: mockPayload.severity,
        triggeredAt: new Date(),
        source: integration.name,
        externalId: `test-${Date.now()}`,
        metadata: {
          ...mockPayload.metadata,
          isTest: true,
          provider: integration.type
        },
        integrationId: integration.id
      },
      {
        idempotencyKey: fingerprint,
        contentFingerprint: fingerprint,
        rawPayload: mockPayload.raw,
        headers: { 'x-test-webhook': 'true' },
        statusCode: 201
      }
    );

    // Create incident from alert (like real pipeline)
    const deduplicationFingerprint = generateContentFingerprint({
      title: alert.title,
      source: alert.source,
      severity: alert.severity,
      service: (alert.metadata as any)?.service || alert.source
    });

    const { incident, isDuplicate } = await deduplicationService.deduplicateAndCreateIncident(
      alert.id,
      deduplicationFingerprint,
      alert,
      integration.deduplicationWindowMinutes
    );

    // Schedule auto-resolve (5 minutes) per user decision
    await scheduleAutoResolve(incident.id, 5 * 60 * 1000);

    await auditService.log({
      action: 'integration.test_webhook',
      userId,
      resourceType: 'integration',
      resourceId: integration.id,
      severity: 'INFO',
      metadata: {
        alertId: alert.id,
        incidentId: incident.id,
        autoResolveIn: '5 minutes'
      }
    });

    return {
      success: true,
      alert: {
        id: alert.id,
        title: alert.title,
        severity: alert.severity
      },
      incident: {
        id: incident.id,
        isDuplicate
      },
      validation: {
        severityMapped: `${mockPayload.inputPriority} -> ${alert.severity}`,
        serviceRouted: (alert.metadata as any)?.service || 'default',
        providerDetected: integration.type
      },
      autoResolveIn: '5 minutes'
    };
  }

  /**
   * Generate mock payload based on integration type.
   */
  private generateMockPayload(type: string) {
    if (type === 'datadog') {
      return {
        title: '[DataDog] Test Alert - CPU Usage High',
        description: 'Test alert from DataDog integration. CPU usage exceeded 90% threshold.',
        severity: 'HIGH' as AlertSeverity,
        inputPriority: 'P2',
        metadata: {
          provider: 'datadog',
          service: 'test-service',
          priority: 'P2',
          status: 'alert',
          metric: 'system.cpu.user',
          tags: ['env:test', 'service:test-service', 'team:platform']
        },
        raw: {
          alert_id: `dd-test-${Date.now()}`,
          alert_title: 'Test Alert - CPU Usage High',
          alert_status: 'alert',
          alert_priority: 'P2',
          alert_metric: 'system.cpu.user',
          event_msg: 'Test alert from DataDog integration. CPU usage exceeded 90% threshold.',
          tags: ['env:test', 'service:test-service', 'team:platform'],
          date: Math.floor(Date.now() / 1000)
        }
      };
    }

    if (type === 'newrelic') {
      return {
        title: '[New Relic] Test Alert - Error Rate Elevated',
        description: 'Test alert from New Relic integration. Error rate exceeded 5% threshold.',
        severity: 'HIGH' as AlertSeverity,
        inputPriority: 'HIGH',
        metadata: {
          provider: 'newrelic',
          service: 'test-service',
          state: 'open',
          labels: { service: 'test-service', env: 'test' }
        },
        raw: {
          id: `nr-test-${Date.now()}`,
          title: 'Test Alert - Error Rate Elevated',
          priority: 'HIGH',
          state: 'open',
          message: 'Test alert from New Relic integration. Error rate exceeded 5% threshold.',
          timestamp: new Date().toISOString(),
          labels: { service: 'test-service', env: 'test' }
        }
      };
    }

    // Generic type
    return {
      title: 'Test Alert - Generic Integration',
      description: 'Test alert from generic webhook integration.',
      severity: 'MEDIUM' as AlertSeverity,
      inputPriority: 'MEDIUM',
      metadata: {
        provider: 'generic',
        service: 'test-service'
      },
      raw: {
        title: 'Test Alert - Generic Integration',
        severity: 'MEDIUM',
        timestamp: new Date().toISOString(),
        description: 'Test alert from generic webhook integration.'
      }
    };
  }

  /**
   * Get recent webhook deliveries for an integration.
   */
  async getDeliveries(integrationId: string, limit: number = 10) {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        statusCode: true,
        errorMessage: true,
        createdAt: true,
        alertId: true
      }
    });

    return deliveries;
  }

  /**
   * Removes webhook secret from integration object.
   */
  private sanitize(integration: any) {
    const { webhookSecret, ...rest } = integration;
    return {
      ...rest,
      // Show first 8 chars of secret for identification
      secretPrefix: webhookSecret.substring(0, 8) + '...'
    };
  }
}

export const integrationService = new IntegrationService();
