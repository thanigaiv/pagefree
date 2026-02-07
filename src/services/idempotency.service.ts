import { prisma } from '../config/database.js';
import { generateContentFingerprint, extractIdempotencyKey } from '../utils/content-fingerprint.js';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingAlertId?: string;
  existingDeliveryId?: string;
}

export interface RecordDeliveryParams {
  integrationId: string;
  alertId?: string;        // Null for duplicates or failures
  idempotencyKey?: string;
  contentFingerprint: string;
  rawPayload: any;
  headers: Record<string, any>;
  statusCode: number;
  errorMessage?: string;
}

class IdempotencyService {
  /**
   * Checks if a webhook payload is a duplicate using hybrid detection.
   *
   * 1. First checks external idempotency key (if provided in headers)
   * 2. Falls back to content fingerprint matching
   *
   * @param integrationId - Integration ID for scoping
   * @param headers - Request headers (to extract idempotency key)
   * @param payload - Parsed webhook payload
   * @param windowMinutes - Deduplication window (from integration config)
   * @returns DuplicateCheckResult
   */
  async checkDuplicate(
    integrationId: string,
    headers: Record<string, string | string[] | undefined>,
    payload: any,
    windowMinutes: number
  ): Promise<DuplicateCheckResult> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    // 1. Check external idempotency key first (most reliable)
    const idempotencyKey = extractIdempotencyKey(headers);

    if (idempotencyKey) {
      const existingByKey = await prisma.webhookDelivery.findFirst({
        where: {
          integrationId,
          idempotencyKey,
          createdAt: { gte: windowStart }
        },
        select: {
          id: true,
          alertId: true
        }
      });

      if (existingByKey) {
        return {
          isDuplicate: true,
          existingAlertId: existingByKey.alertId || undefined,
          existingDeliveryId: existingByKey.id
        };
      }
    }

    // 2. Fall back to content fingerprint
    const fingerprint = generateContentFingerprint(payload);

    const existingByFingerprint = await prisma.webhookDelivery.findFirst({
      where: {
        integrationId,
        contentFingerprint: fingerprint,
        createdAt: { gte: windowStart }
      },
      select: {
        id: true,
        alertId: true
      }
    });

    if (existingByFingerprint) {
      return {
        isDuplicate: true,
        existingAlertId: existingByFingerprint.alertId || undefined,
        existingDeliveryId: existingByFingerprint.id
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Records a webhook delivery attempt.
   * Should be called for every webhook received (success, duplicate, or failure).
   *
   * @param params - Delivery details
   * @returns Created WebhookDelivery record
   */
  async recordDelivery(params: RecordDeliveryParams) {
    return prisma.webhookDelivery.create({
      data: {
        integrationId: params.integrationId,
        alertId: params.alertId,
        idempotencyKey: params.idempotencyKey,
        contentFingerprint: params.contentFingerprint,
        rawPayload: params.rawPayload,
        headers: this.sanitizeHeaders(params.headers),
        statusCode: params.statusCode,
        errorMessage: params.errorMessage,
        processedAt: new Date()
      }
    });
  }

  /**
   * Generates fingerprint for a payload.
   * Exposed for use when recording deliveries.
   */
  generateFingerprint(payload: any): string {
    return generateContentFingerprint(payload);
  }

  /**
   * Extracts idempotency key from headers.
   * Exposed for use when recording deliveries.
   */
  extractKey(headers: Record<string, string | string[] | undefined>): string | undefined {
    return extractIdempotencyKey(headers);
  }

  /**
   * Sanitizes headers by removing sensitive values.
   * Stored for debugging but secrets should not be persisted.
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitivePatterns = [
      /authorization/i,
      /x-webhook-secret/i,
      /x-api-key/i,
      /cookie/i,
      /x-.*-token/i,
      /x-.*-signature/i  // Signatures are sensitive
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers)) {
      const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
      sanitized[key] = isSensitive ? '[REDACTED]' : value;
    }

    return sanitized;
  }
}

export const idempotencyService = new IdempotencyService();
