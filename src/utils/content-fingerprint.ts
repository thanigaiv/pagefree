import crypto from 'crypto';

/**
 * Generates a deterministic fingerprint from webhook payload.
 * Used for content-based deduplication when no external idempotency key is provided.
 *
 * The fingerprint is based on semantic content only, ignoring:
 * - Delivery timestamps
 * - Request metadata
 * - Field ordering
 * - Array ordering
 *
 * @param payload - Parsed webhook payload (any shape)
 * @returns SHA-256 hex hash of normalized content
 */
export function generateContentFingerprint(payload: any): string {
  const normalized = normalizePayload(payload);
  const content = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Normalizes payload by extracting and standardizing semantic fields.
 */
function normalizePayload(payload: any): Record<string, any> {
  const normalized: Record<string, any> = {};

  // Core alert fields (stable across retries)
  if (payload.title) {
    normalized.title = String(payload.title).trim().toLowerCase();
  }

  if (payload.severity) {
    normalized.severity = String(payload.severity).toLowerCase();
  }

  if (payload.source) {
    normalized.source = String(payload.source).trim().toLowerCase();
  }

  // External ID from monitoring tool (most reliable dedup key)
  if (payload.external_id || payload.externalId || payload.id || payload.alert_id) {
    normalized.externalId = String(
      payload.external_id || payload.externalId || payload.id || payload.alert_id
    );
  }

  // Event/alert timestamp (not delivery timestamp)
  // Convert to ISO string for consistent hashing
  const timestamp = payload.timestamp || payload.triggered_at || payload.triggeredAt ||
                    payload.event_time || payload.eventTime || payload.occurred_at;
  if (timestamp) {
    try {
      // Handle both ISO strings and Unix timestamps
      const date = typeof timestamp === 'number'
        ? new Date(timestamp * (timestamp > 1e11 ? 1 : 1000)) // Handle ms vs seconds
        : new Date(timestamp);
      normalized.timestamp = date.toISOString();
    } catch {
      // Invalid timestamp - include raw value for uniqueness
      normalized.timestamp = String(timestamp);
    }
  }

  // Message/description - hash long content to fixed length
  const message = payload.message || payload.description || payload.body;
  if (message) {
    const messageStr = String(message).trim();
    if (messageStr.length > 100) {
      // Hash long messages to keep fingerprint consistent even with truncation
      normalized.messageHash = crypto
        .createHash('sha256')
        .update(messageStr)
        .digest('hex')
        .substring(0, 16);
    } else {
      normalized.message = messageStr.toLowerCase();
    }
  }

  // Tags - sort for order independence
  if (Array.isArray(payload.tags)) {
    normalized.tags = payload.tags
      .map((t: any) => String(t).trim().toLowerCase())
      .sort();
  }

  // Host/service identifier
  if (payload.host || payload.hostname || payload.service) {
    normalized.host = String(payload.host || payload.hostname || payload.service)
      .trim()
      .toLowerCase();
  }

  return normalized;
}

/**
 * Extracts common idempotency key headers from request.
 * Returns the first found key or undefined.
 */
export function extractIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Check common idempotency header patterns (case-insensitive)
  const headerNames = [
    'idempotency-key',
    'x-idempotency-key',
    'x-delivery-id',
    'x-request-id',
    'x-github-delivery',
    'x-datadog-delivery-id',
    'x-trace-id'
  ];

  for (const name of headerNames) {
    const value = headers[name] || headers[name.toLowerCase()];
    if (value) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}
