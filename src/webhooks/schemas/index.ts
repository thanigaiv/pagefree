import { normalizeAlertPayload, alertWebhookSchema } from './alert.schema.js';
import { normalizeDatadogPayload } from './datadog.schema.js';
import { normalizeNewRelicPayload } from './newrelic.schema.js';
import type { NormalizedAlert } from './alert.schema.js';

/**
 * Provider-specific payload normalizer function type.
 * Takes raw payload and integration name, returns normalized alert.
 */
type ProviderNormalizer = (payload: unknown, integrationName: string) => NormalizedAlert;

/**
 * Generic normalizer wrapper that validates then normalizes.
 * Throws ZodError on validation failure (consistent with provider normalizers).
 */
function normalizeGenericPayload(payload: unknown, integrationName: string): NormalizedAlert {
  const parsed = alertWebhookSchema.parse(payload); // Throws on validation failure
  return normalizeAlertPayload(parsed, integrationName);
}

/**
 * Registry of provider-specific normalizers.
 * Maps integration type to its normalizer function.
 */
const normalizers: Record<string, ProviderNormalizer> = {
  generic: normalizeGenericPayload,
  datadog: normalizeDatadogPayload,
  newrelic: normalizeNewRelicPayload
};

/**
 * Returns the appropriate normalizer for the given integration type.
 * Falls back to generic normalizer for unknown types.
 *
 * @param integrationType - The type of integration (e.g., "datadog", "newrelic", "generic")
 * @returns The normalizer function for that provider
 */
export function getNormalizer(integrationType: string): ProviderNormalizer {
  return normalizers[integrationType] || normalizers.generic;
}

// Re-export types and generic validation function for backward compatibility
export { validateAlertPayload, type NormalizedAlert } from './alert.schema.js';
