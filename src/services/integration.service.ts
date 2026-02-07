import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';

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
    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { alerts: true, webhookDeliveries: true }
        }
      }
    });

    return integrations.map(int => ({
      ...this.sanitize(int),
      alertCount: int._count.alerts,
      webhookCount: int._count.webhookDeliveries
    }));
  }

  /**
   * Gets a single integration by ID (secret redacted).
   */
  async getById(id: string) {
    const integration = await prisma.integration.findUnique({
      where: { id },
      include: {
        _count: {
          select: { alerts: true, webhookDeliveries: true }
        }
      }
    });

    if (!integration) return null;

    return {
      ...this.sanitize(integration),
      alertCount: integration._count.alerts,
      webhookCount: integration._count.webhookDeliveries
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
