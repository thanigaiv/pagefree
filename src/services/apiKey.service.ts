import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';

export type ApiKeyScope =
  | 'webhooks:write'
  | 'alerts:write'
  | 'incidents:read'
  | 'incidents:write'
  | 'admin:read'
  | 'admin:write';

export interface CreateApiKeyParams {
  name: string;
  service: string;
  description?: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date;
  createdById: string;
}

export class ApiKeyService {
  private readonly KEY_LENGTH = 32; // 32 bytes = 64 hex chars

  // Generate a new API key
  private generateKey(prefix: string = 'sk'): string {
    const randomBytes = crypto.randomBytes(this.KEY_LENGTH);
    const keyBody = randomBytes.toString('hex');
    return `${prefix}_${keyBody}`;
  }

  // Hash API key for storage (never store plaintext)
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // Extract prefix from key (first 8 chars for display)
  private extractPrefix(key: string): string {
    return key.substring(0, 8);
  }

  // Create a new API key
  async create(params: CreateApiKeyParams): Promise<{ key: string; record: any }> {
    // Generate key with service-specific prefix
    const servicePrefix = params.service === 'datadog' ? 'dd' :
                         params.service === 'newrelic' ? 'nr' :
                         'sk';

    const key = this.generateKey(servicePrefix);
    const keyHash = this.hashKey(key);
    const keyPrefix = this.extractPrefix(key);

    // Create database record
    const record = await prisma.apiKey.create({
      data: {
        name: params.name,
        keyHash,
        keyPrefix,
        service: params.service,
        description: params.description,
        scopes: params.scopes,
        createdById: params.createdById,
        expiresAt: params.expiresAt
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    await auditService.log({
      action: 'apikey.created',
      userId: params.createdById,
      resourceType: 'apikey',
      resourceId: record.id,
      severity: 'HIGH',
      metadata: {
        name: params.name,
        service: params.service,
        scopes: params.scopes,
        keyPrefix
      }
    });

    // Return plaintext key (ONLY time it's visible)
    return { key, record };
  }

  // Validate API key and return associated record
  async validate(key: string): Promise<{
    valid: boolean;
    apiKey?: any;
    reason?: string;
  }> {
    const keyHash = this.hashKey(key);

    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            platformRole: true
          }
        }
      }
    });

    if (!apiKey) {
      return { valid: false, reason: 'invalid_key' };
    }

    // Check expiry
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, reason: 'expired_key' };
    }

    // Update usage stats (async, don't block validation)
    this.recordUsage(apiKey.id).catch(err =>
      console.error('Failed to record API key usage:', err)
    );

    return { valid: true, apiKey };
  }

  // Check if key has required scope
  hasScope(apiKey: any, requiredScope: ApiKeyScope): boolean {
    return apiKey.scopes.includes(requiredScope);
  }

  // Record API key usage
  private async recordUsage(apiKeyId: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      }
    });
  }

  // List API keys (for admin UI)
  async list(params: {
    service?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (!params.includeInactive) {
      where.isActive = true;
    }

    if (params.service) {
      where.service = params.service;
    }

    const [keys, total] = await Promise.all([
      prisma.apiKey.findMany({
        where,
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          service: true,
          description: true,
          scopes: true,
          isActive: true,
          lastUsedAt: true,
          usageCount: true,
          expiresAt: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        skip: params.offset || 0,
        take: params.limit || 50,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.apiKey.count({ where })
    ]);

    return { keys, total };
  }

  // Revoke API key
  async revoke(apiKeyId: string, revokedById: string): Promise<void> {
    const apiKey = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { isActive: false }
    });

    await auditService.log({
      action: 'apikey.revoked',
      userId: revokedById,
      resourceType: 'apikey',
      resourceId: apiKeyId,
      severity: 'HIGH',
      metadata: {
        name: apiKey.name,
        service: apiKey.service,
        keyPrefix: apiKey.keyPrefix
      }
    });
  }

  // Delete API key (hard delete - use with caution)
  async delete(apiKeyId: string, deletedById: string): Promise<void> {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId }
    });

    if (!apiKey) {
      throw new Error('API key not found');
    }

    await prisma.apiKey.delete({
      where: { id: apiKeyId }
    });

    await auditService.log({
      action: 'apikey.deleted',
      userId: deletedById,
      resourceType: 'apikey',
      resourceId: apiKeyId,
      severity: 'HIGH',
      metadata: {
        name: apiKey.name,
        service: apiKey.service,
        keyPrefix: apiKey.keyPrefix
      }
    });
  }
}

export const apiKeyService = new ApiKeyService();
