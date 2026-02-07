import { z } from 'zod';
import { AlertSeverity } from '@prisma/client';
import type { NormalizedAlert } from './alert.schema.js';

/**
 * DataDog webhook payload schema.
 * Based on DataDog Monitor webhook payload format.
 */
export const datadogWebhookSchema = z.object({
  // Required fields
  alert_id: z.string(),
  alert_title: z.string(),
  alert_status: z.string(), // "alert", "warning", "no data", "ok"
  alert_priority: z.string(), // "P1", "P2", "P3", "P4", "P5"

  // Event details
  event_msg: z.string(),
  date: z.number(), // Unix timestamp in seconds

  // Optional fields
  alert_metric: z.string().optional(),
  org_id: z.union([z.string(), z.number()]).optional(),
  org_name: z.string().optional(),

  // Tags and metadata
  tags: z.array(z.string()).optional(),
  snapshot: z.string().optional(), // Graph snapshot URL

  // Monitor details
  monitor_id: z.union([z.string(), z.number()]).optional(),
  monitor_name: z.string().optional(),
  monitor_tags: z.array(z.string()).optional(),

  // Event type
  event_type: z.string().optional(),
}).passthrough(); // Allow unknown fields to be preserved

export type DatadogWebhookInput = z.input<typeof datadogWebhookSchema>;
export type DatadogWebhookParsed = z.output<typeof datadogWebhookSchema>;

/**
 * Normalizes DataDog webhook payload to standard alert format.
 *
 * Severity mapping:
 * - P1 -> CRITICAL
 * - P2 -> HIGH
 * - P3 -> MEDIUM
 * - P4 -> LOW
 * - P5 -> INFO
 * - Unknown -> MEDIUM (default fallback)
 *
 * Service extraction:
 * - Looks for "service:" tag (e.g., "service:api")
 * - Extracted for routing via metadata.service
 */
export function normalizeDatadogPayload(
  payload: unknown,
  integrationName: string
): NormalizedAlert {
  const parsed = datadogWebhookSchema.parse(payload);

  // Map DataDog priority to AlertSeverity
  const severityMap: Record<string, AlertSeverity> = {
    'P1': AlertSeverity.CRITICAL,
    'P2': AlertSeverity.HIGH,
    'P3': AlertSeverity.MEDIUM,
    'P4': AlertSeverity.LOW,
    'P5': AlertSeverity.INFO
  };

  const severity = severityMap[parsed.alert_priority] || AlertSeverity.MEDIUM;

  // Extract service from tags (e.g., "service:api")
  const serviceTag = parsed.tags?.find(tag => tag.startsWith('service:'));
  const service = serviceTag ? serviceTag.split(':')[1] : undefined;

  // Extract all tags into a structured format
  const allTags = parsed.tags || [];
  const tagMap: Record<string, string> = {};
  allTags.forEach(tag => {
    const [key, value] = tag.split(':', 2);
    if (key && value) {
      tagMap[key] = value;
    }
  });

  return {
    title: `[DataDog] ${parsed.alert_title}`,
    description: parsed.event_msg,
    severity,
    triggeredAt: new Date(parsed.date * 1000), // Unix timestamp to Date
    source: integrationName,
    externalId: parsed.alert_id,
    metadata: {
      // Provider identification
      provider: 'datadog',

      // Service for routing (Phase 4)
      service,

      // DataDog-specific fields preserved for debugging
      datadog: {
        priority: parsed.alert_priority,
        status: parsed.alert_status,
        metric: parsed.alert_metric,
        org_id: parsed.org_id,
        org_name: parsed.org_name,
        monitor_id: parsed.monitor_id,
        monitor_name: parsed.monitor_name,
        snapshot: parsed.snapshot,
        event_type: parsed.event_type,
        tags: allTags,
        monitor_tags: parsed.monitor_tags
      },

      // Structured tag mapping
      tags: tagMap,

      // Preserve entire raw payload for debugging
      raw: payload
    }
  };
}
