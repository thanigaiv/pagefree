import { z } from 'zod';
import { AlertSeverity } from '@prisma/client';
import type { NormalizedAlert } from './alert.schema.js';

/**
 * New Relic webhook payload schema.
 * Based on New Relic Alerts webhook payload format.
 */
export const newrelicWebhookSchema = z.object({
  // Required fields
  id: z.string(),
  title: z.string(),
  priority: z.string(), // "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"
  state: z.string(), // "open", "acknowledged", "closed"

  // Message/description
  message: z.string(),

  // Timing
  timestamp: z.string(), // ISO-8601 format

  // Optional fields
  labels: z.record(z.string(), z.string()).optional(), // Key-value pairs like { service: "api", env: "prod" }
  condition_name: z.string().optional(),
  condition_id: z.union([z.string(), z.number()]).optional(),
  account_id: z.union([z.string(), z.number()]).optional(),
  account_name: z.string().optional(),
  policy_name: z.string().optional(),
  policy_url: z.string().optional(),
  incident_url: z.string().optional(),
}).passthrough(); // Allow unknown fields to be preserved

export type NewRelicWebhookInput = z.input<typeof newrelicWebhookSchema>;
export type NewRelicWebhookParsed = z.output<typeof newrelicWebhookSchema>;

/**
 * Normalizes New Relic webhook payload to standard alert format.
 *
 * Severity mapping:
 * - CRITICAL -> CRITICAL
 * - HIGH -> HIGH
 * - MEDIUM -> MEDIUM
 * - LOW -> LOW
 * - INFO -> INFO
 * - Unknown -> MEDIUM (default fallback)
 *
 * Service extraction:
 * - Looks for "service" key in labels object
 * - Extracted for routing via metadata.service
 */
export function normalizeNewRelicPayload(
  payload: unknown,
  integrationName: string
): NormalizedAlert {
  const parsed = newrelicWebhookSchema.parse(payload);

  // Map New Relic priority to AlertSeverity
  const severityMap: Record<string, AlertSeverity> = {
    'CRITICAL': AlertSeverity.CRITICAL,
    'HIGH': AlertSeverity.HIGH,
    'MEDIUM': AlertSeverity.MEDIUM,
    'LOW': AlertSeverity.LOW,
    'INFO': AlertSeverity.INFO
  };

  const normalizedPriority = parsed.priority.toUpperCase();
  const severity = severityMap[normalizedPriority] || AlertSeverity.MEDIUM;

  // Extract service from labels
  const service = parsed.labels?.service;

  return {
    title: `[New Relic] ${parsed.title}`,
    description: parsed.message,
    severity,
    triggeredAt: new Date(parsed.timestamp),
    source: integrationName,
    externalId: parsed.id,
    metadata: {
      // Provider identification
      provider: 'newrelic',

      // Service for routing (Phase 4)
      service,

      // New Relic-specific fields preserved for debugging
      newrelic: {
        priority: parsed.priority,
        state: parsed.state,
        condition_name: parsed.condition_name,
        condition_id: parsed.condition_id,
        account_id: parsed.account_id,
        account_name: parsed.account_name,
        policy_name: parsed.policy_name,
        policy_url: parsed.policy_url,
        incident_url: parsed.incident_url,
        labels: parsed.labels
      },

      // Preserve entire raw payload for debugging
      raw: payload
    }
  };
}
