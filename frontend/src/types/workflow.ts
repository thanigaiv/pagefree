/**
 * Workflow Types for Frontend
 *
 * TypeScript types for workflow definitions and React Flow integration.
 * These types match the backend types in src/types/workflow.ts
 */

// =============================================================================
// TRIGGER TYPES
// =============================================================================

export type TriggerType =
  | 'incident_created'
  | 'state_changed'
  | 'escalation'
  | 'manual'
  | 'age';

export interface TriggerCondition {
  field: string;
  value: string;
}

export interface StateTransition {
  from?: string;
  to: string;
}

export interface TriggerData {
  name: string;
  triggerType: TriggerType;
  conditions: TriggerCondition[];
  ageThresholdMinutes?: number;
  stateTransition?: StateTransition;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type ActionType = 'webhook' | 'jira' | 'linear' | 'runbook';

export type WebhookMethod = 'POST' | 'PUT' | 'PATCH';

export interface WebhookAuth {
  type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  customHeaders?: Record<string, string>;
}

export interface WebhookConfig {
  url: string;
  method: WebhookMethod;
  headers: Record<string, string>;
  body: string;
  auth: WebhookAuth;
}

export interface JiraConfig {
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  priority?: string;
  labels?: string[];
}

export interface LinearConfig {
  teamId: string;
  title: string;
  description: string;
  priority?: number;
  labelIds?: string[];
}

export interface RunbookActionConfig {
  runbookId: string;
  parameters: Record<string, unknown>;
}

export interface RetryConfig {
  attempts: number;
  backoff: 'exponential';
  initialDelayMs: number;
}

interface BaseActionData {
  name: string;
  retry: RetryConfig;
}

export interface WebhookActionData extends BaseActionData {
  actionType: 'webhook';
  config: WebhookConfig;
}

export interface JiraActionData extends BaseActionData {
  actionType: 'jira';
  config: JiraConfig;
}

export interface LinearActionData extends BaseActionData {
  actionType: 'linear';
  config: LinearConfig;
}

export interface RunbookActionData extends BaseActionData {
  actionType: 'runbook';
  config: RunbookActionConfig;
}

export type ActionData = WebhookActionData | JiraActionData | LinearActionData | RunbookActionData;

// Type guards
export function isRunbookAction(data: ActionData): data is RunbookActionData {
  return data.actionType === 'runbook';
}

// =============================================================================
// CONDITION AND DELAY TYPES
// =============================================================================

export interface ConditionData {
  name: string;
  field: string;
  operator: '=';
  value: string;
}

export interface DelayData {
  name: string;
  durationMinutes: number;
}

// =============================================================================
// WORKFLOW DEFINITION
// =============================================================================

export type WorkflowNodeType = 'trigger' | 'action' | 'condition' | 'delay';

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: NodePosition;
  data: TriggerData | ActionData | ConditionData | DelayData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'true' | 'false';
}

export type WorkflowTimeout = '1min' | '5min' | '15min';

export interface WorkflowSettings {
  timeout: WorkflowTimeout;
  enabled: boolean;
}

export interface TriggerConfig {
  type: TriggerType;
  conditions: TriggerCondition[];
  ageThresholdMinutes?: number;
  stateTransition?: StateTransition;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trigger: TriggerConfig;
  settings: WorkflowSettings;
}

// =============================================================================
// API TYPES
// =============================================================================

export type WorkflowScope = 'team' | 'global';

export type TemplateCategory = 'Ticketing' | 'Communication' | 'Auto-resolution';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: number;
  definition: WorkflowDefinition;
  scopeType: WorkflowScope;
  teamId: string | null;
  isEnabled: boolean;
  isTemplate: boolean;
  templateCategory: TemplateCategory | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  definition: WorkflowDefinition;
  changedById: string;
  changeNote: string | null;
  createdAt: string;
}

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowVersion: number;
  incidentId: string;
  triggeredBy: 'event' | 'manual';
  triggerEvent: string | null;
  status: ExecutionStatus;
  currentNodeId: string | null;
  completedNodes: NodeResult[];
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface NodeResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: {
    statusCode?: number;
    responseBody?: string;
    ticketId?: string;
    ticketUrl?: string;
  };
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  definition: WorkflowDefinition;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export interface WorkflowAnalytics {
  workflowId: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDurationMs: number;
  failurePoints: FailurePoint[];
}

export interface FailurePoint {
  nodeId: string;
  nodeName: string;
  failureCount: number;
  commonErrors: string[];
}

// =============================================================================
// LIST PARAMS
// =============================================================================

export interface WorkflowListParams {
  teamId?: string;
  scopeType?: WorkflowScope;
  isEnabled?: boolean;
  page?: number;
  limit?: number;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  total: number;
  page: number;
  limit: number;
}

export interface WorkflowTemplateListParams {
  category?: TemplateCategory;
  search?: string;
}

export interface WorkflowTemplateListResponse {
  templates: WorkflowTemplate[];
  total: number;
}

// =============================================================================
// MUTATION INPUTS
// =============================================================================

export interface CreateWorkflowInput {
  name: string;
  description: string;
  definition: WorkflowDefinition;
  scopeType: WorkflowScope;
  teamId?: string;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  definition?: WorkflowDefinition;
  changeNote?: string;
}
