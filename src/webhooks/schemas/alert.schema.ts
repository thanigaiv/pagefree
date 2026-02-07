import { z } from 'zod';
import { AlertSeverity } from '@prisma/client';

/**
 * Coerces various timestamp formats to Date.
 * Handles ISO-8601 strings and Unix timestamps (seconds or milliseconds).
 */
const timestampSchema = z.union([
  z.string().datetime(),           // ISO-8601 with timezone
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/), // ISO without timezone
  z.number()                       // Unix timestamp
]).transform((val): Date => {
  if (typeof val === 'number') {
    // Determine if seconds or milliseconds (timestamps after 2001 in ms are > 1e12)
    const ms = val > 1e11 ? val : val * 1000;
    return new Date(ms);
  }
  return new Date(val);
});

/**
 * Normalizes severity strings to AlertSeverity enum values.
 * Case-insensitive, maps common aliases.
 */
const severitySchema = z.string().transform((val): AlertSeverity => {
  const normalized = val.toUpperCase().trim();

  // Map common aliases
  const aliases: Record<string, AlertSeverity> = {
    'CRITICAL': AlertSeverity.CRITICAL,
    'EMERGENCY': AlertSeverity.CRITICAL,
    'P1': AlertSeverity.CRITICAL,
    'SEV1': AlertSeverity.CRITICAL,
    'HIGH': AlertSeverity.HIGH,
    'ERROR': AlertSeverity.HIGH,
    'P2': AlertSeverity.HIGH,
    'SEV2': AlertSeverity.HIGH,
    'MEDIUM': AlertSeverity.MEDIUM,
    'WARNING': AlertSeverity.MEDIUM,
    'WARN': AlertSeverity.MEDIUM,
    'P3': AlertSeverity.MEDIUM,
    'SEV3': AlertSeverity.MEDIUM,
    'LOW': AlertSeverity.LOW,
    'NOTICE': AlertSeverity.LOW,
    'P4': AlertSeverity.LOW,
    'SEV4': AlertSeverity.LOW,
    'INFO': AlertSeverity.INFO,
    'INFORMATIONAL': AlertSeverity.INFO,
    'DEBUG': AlertSeverity.INFO,
    'P5': AlertSeverity.INFO,
    'SEV5': AlertSeverity.INFO
  };

  const mapped = aliases[normalized];
  if (!mapped) {
    // Default to MEDIUM for unknown severities (lenient parsing)
    return AlertSeverity.MEDIUM;
  }

  return mapped;
});

/**
 * Base alert webhook schema with required fields.
 * Uses passthrough() to allow unknown fields.
 */
export const alertWebhookSchema = z.object({
  // Required fields
  title: z.string().min(1, 'Title is required').max(500),
  severity: severitySchema,
  timestamp: timestampSchema,

  // Optional but extracted fields
  description: z.string().max(5000).optional().nullable(),
  source: z.string().max(200).optional().nullable(),
  external_id: z.string().max(200).optional().nullable(),
  // Also accept camelCase variants
  externalId: z.string().max(200).optional().nullable(),

  // Flexible metadata
  metadata: z.record(z.string(), z.any()).optional().nullable(),

  // Common alternate field names (mapped during normalization)
  message: z.string().max(5000).optional().nullable(),  // -> description
  body: z.string().max(5000).optional().nullable(),     // -> description
  alert_id: z.string().max(200).optional().nullable(), // -> external_id
  id: z.string().max(200).optional().nullable(),       // -> external_id
  triggered_at: timestampSchema.optional().nullable(), // -> timestamp
  triggeredAt: timestampSchema.optional().nullable(),  // -> timestamp
  event_time: timestampSchema.optional().nullable(),   // -> timestamp
  eventTime: timestampSchema.optional().nullable(),    // -> timestamp

}).passthrough();  // Allow unknown fields

export type AlertWebhookInput = z.input<typeof alertWebhookSchema>;
export type AlertWebhookParsed = z.output<typeof alertWebhookSchema>;

/**
 * Normalized alert data ready for database insertion.
 */
export interface NormalizedAlert {
  title: string;
  description: string | null;
  severity: AlertSeverity;
  triggeredAt: Date;
  source: string | null;
  externalId: string | null;
  metadata: Record<string, any>;
}

/**
 * Normalizes parsed webhook payload to Alert model fields.
 * Handles field name variations and provides defaults.
 */
export function normalizeAlertPayload(
  parsed: AlertWebhookParsed,
  integrationName: string
): NormalizedAlert {
  return {
    title: parsed.title,

    // Prefer description, fall back to message/body
    description: parsed.description || parsed.message || parsed.body || null,

    severity: parsed.severity,

    // Prefer timestamp, fall back to triggered_at variants
    triggeredAt: parsed.timestamp ||
                 parsed.triggered_at ||
                 parsed.triggeredAt ||
                 parsed.event_time ||
                 parsed.eventTime ||
                 new Date(),

    // Source defaults to integration name
    source: parsed.source || integrationName,

    // Prefer external_id, fall back to externalId, alert_id, id
    externalId: parsed.external_id ||
                parsed.externalId ||
                parsed.alert_id ||
                parsed.id ||
                null,

    // Preserve any extra fields in metadata
    metadata: parsed.metadata || {}
  };
}

/**
 * Validates payload and returns result with normalized data or error.
 */
export function validateAlertPayload(
  payload: unknown,
  integrationName: string
): { success: true; data: NormalizedAlert } | { success: false; error: z.ZodError } {
  const result = alertWebhookSchema.safeParse(payload);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: normalizeAlertPayload(result.data, integrationName)
  };
}
