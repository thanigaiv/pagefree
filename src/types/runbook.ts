/**
 * Runbook Type Definitions
 *
 * Provides TypeScript types for runbook definitions, parameters,
 * and execution status tracking.
 *
 * @module types/runbook
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Runbook approval status lifecycle
 * DRAFT -> APPROVED -> DEPRECATED
 */
export type RunbookApprovalStatus = 'DRAFT' | 'APPROVED' | 'DEPRECATED';

/**
 * Runbook execution status
 */
export type RunbookExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

/**
 * How the runbook was triggered
 */
export type RunbookTriggerType = 'workflow' | 'manual';

// ============================================================================
// Parameter Schema Types
// ============================================================================

/**
 * Supported parameter types (flat object only per research recommendation)
 */
export type RunbookParameterType = 'string' | 'number' | 'boolean';

/**
 * Individual parameter definition
 */
export interface RunbookParameterDefinition {
  type: RunbookParameterType;
  description?: string;
  default?: string | number | boolean;
  enum?: (string | number)[]; // For select/dropdown inputs
}

/**
 * JSON Schema-like parameter schema for runbooks
 * Per research: start with flat object (string/number/boolean properties only)
 */
export interface RunbookParameterSchema {
  type: 'object';
  properties: Record<string, RunbookParameterDefinition>;
  required?: string[];
}

// ============================================================================
// Webhook Configuration Types
// ============================================================================

/**
 * Webhook authentication configuration
 * Reuses pattern from workflow webhook actions
 */
export interface RunbookWebhookAuth {
  type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  customHeaders?: Record<string, string>;
}

// ============================================================================
// Runbook Definition Types
// ============================================================================

/**
 * Complete runbook definition stored in database JSON fields
 * Used for version snapshots and execution snapshots
 */
export interface RunbookDefinition {
  name: string;
  description: string;
  webhookUrl: string;
  webhookMethod: 'POST' | 'PUT';
  webhookHeaders: Record<string, string>;
  webhookAuth?: RunbookWebhookAuth;
  parameters: RunbookParameterSchema;
  payloadTemplate: string;
  timeoutSeconds: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Result of a runbook webhook execution
 */
export interface RunbookExecutionResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration: number;
}

/**
 * Parameters to trigger a runbook execution
 */
export interface TriggerRunbookParams {
  runbookId: string;
  incidentId?: string;
  parameters: Record<string, unknown>;
  triggeredBy: RunbookTriggerType;
  executedById?: string;
}
