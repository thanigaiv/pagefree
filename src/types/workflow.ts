/**
 * Workflow Automation Types
 *
 * TypeScript types for workflow definitions stored as JSON in database.
 * Compatible with React Flow for visual workflow builder.
 *
 * @module types/workflow
 */

// =============================================================================
// WORKFLOW DEFINITION (Top-level structure)
// =============================================================================

/**
 * Complete workflow definition stored in Workflow.definition JSON field
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;

  /** React Flow compatible node structure */
  nodes: WorkflowNode[];

  /** React Flow compatible edge structure */
  edges: WorkflowEdge[];

  /** Trigger configuration */
  trigger: TriggerConfig;

  /** Execution settings */
  settings: WorkflowSettings;
}

// =============================================================================
// NODES (React Flow compatible)
// =============================================================================

/**
 * Workflow node - React Flow compatible structure
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: NodePosition;
  data: TriggerData | ActionData | ConditionData | DelayData;
}

export type WorkflowNodeType = 'trigger' | 'action' | 'condition' | 'delay';

export interface NodePosition {
  x: number;
  y: number;
}

// =============================================================================
// EDGES (React Flow compatible)
// =============================================================================

/**
 * Workflow edge - connects nodes
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** For branching - 'true' or 'false' from condition nodes */
  sourceHandle?: 'true' | 'false';
}

// =============================================================================
// TRIGGER CONFIGURATION
// =============================================================================

export type TriggerType =
  | 'incident_created'
  | 'state_changed'
  | 'escalation'
  | 'manual'
  | 'age';

/**
 * Trigger configuration for workflow activation
 */
export interface TriggerConfig {
  type: TriggerType;
  /** Simple field matching conditions (no AND/OR per user decision) */
  conditions: TriggerCondition[];
  /** For 'age' trigger - minutes before triggering */
  ageThresholdMinutes?: number;
  /** For 'state_changed' trigger - state transition */
  stateTransition?: StateTransition;
}

/**
 * Simple field matching condition (priority = HIGH, service = api-gateway)
 * No AND/OR logic per user decision
 */
export interface TriggerCondition {
  /** Field to match: 'priority', 'service', 'metadata.service', 'team' */
  field: string;
  /** Value to match against */
  value: string;
}

export interface StateTransition {
  from?: string;
  to: string;
}

/**
 * Trigger node data
 */
export interface TriggerData {
  name: string;
  triggerType: TriggerType;
  conditions: TriggerCondition[];
  ageThresholdMinutes?: number;
  stateTransition?: StateTransition;
}

// =============================================================================
// ACTION DATA (Discriminated union)
// =============================================================================

export type ActionType = 'webhook' | 'jira' | 'linear' | 'runbook';

/**
 * Action node data - discriminated union by actionType
 */
export type ActionData = WebhookActionData | JiraActionData | LinearActionData | RunbookActionData;

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

/**
 * Runbook action configuration for workflow execution
 */
export interface RunbookActionConfig {
  /** ID of the runbook to execute */
  runbookId: string;
  /** Parameters to pass to the runbook */
  parameters: Record<string, unknown>;
}

// =============================================================================
// WEBHOOK CONFIGURATION
// =============================================================================

export type WebhookMethod = 'POST' | 'PUT' | 'PATCH';

/**
 * Webhook action configuration
 */
export interface WebhookConfig {
  /** URL - supports {{variable}} templates */
  url: string;
  method: WebhookMethod;
  /** Headers - supports {{variable}} templates in values */
  headers: Record<string, string>;
  /** Request body - JSON template string */
  body: string;
  auth: WebhookAuth;
}

/**
 * Webhook authentication configuration
 * Supports: Bearer, Basic, OAuth2 client credentials, custom headers
 */
export type WebhookAuth =
  | WebhookAuthNone
  | WebhookAuthBearer
  | WebhookAuthBasic
  | WebhookAuthOAuth2
  | WebhookAuthCustom;

export interface WebhookAuthNone {
  type: 'none';
}

export interface WebhookAuthBearer {
  type: 'bearer';
  /** Bearer token - can reference secret */
  token: string;
}

export interface WebhookAuthBasic {
  type: 'basic';
  username: string;
  password: string;
}

export interface WebhookAuthOAuth2 {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
}

export interface WebhookAuthCustom {
  type: 'custom';
  /** Custom headers for authentication */
  customHeaders: Record<string, string>;
}

// =============================================================================
// JIRA CONFIGURATION
// =============================================================================

/**
 * Jira ticket creation configuration
 */
export interface JiraConfig {
  /** Jira project key (e.g., 'ONCALL') */
  projectKey: string;
  /** Issue type (e.g., 'Bug', 'Task', 'Incident') */
  issueType: string;
  /** Summary - supports {{variable}} templates */
  summary: string;
  /** Description - supports {{variable}} templates */
  description: string;
  /** Priority name (e.g., 'High', 'Medium') */
  priority?: string;
  /** Labels to apply */
  labels?: string[];
}

// =============================================================================
// LINEAR CONFIGURATION
// =============================================================================

/**
 * Linear ticket creation configuration
 */
export interface LinearConfig {
  /** Linear team ID */
  teamId: string;
  /** Issue title - supports {{variable}} templates */
  title: string;
  /** Issue description - supports {{variable}} templates */
  description: string;
  /** Priority: 0 = no priority, 1 = urgent, 2 = high, 3 = normal, 4 = low */
  priority?: number;
  /** Label IDs to apply */
  labelIds?: string[];
}

// =============================================================================
// CONDITION NODE (Branching)
// =============================================================================

/**
 * Condition node data for if/else branching
 * Simple equality check per user decision (no advanced operators)
 */
export interface ConditionData {
  name: string;
  /** Field to check */
  field: string;
  /** Operator - simple equality per user decision */
  operator: '=';
  /** Value to compare against */
  value: string;
}

// =============================================================================
// DELAY NODE
// =============================================================================

/**
 * Delay node data for configurable waits
 */
export interface DelayData {
  name: string;
  /** Duration to wait in minutes */
  durationMinutes: number;
}

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Retry configuration for action nodes
 */
export interface RetryConfig {
  /** Number of retry attempts */
  attempts: number;
  /** Backoff strategy */
  backoff: 'exponential';
  /** Initial delay in milliseconds */
  initialDelayMs: number;
}

// =============================================================================
// WORKFLOW SETTINGS
// =============================================================================

export type WorkflowTimeout = '1min' | '5min' | '15min';

/**
 * Workflow execution settings
 */
export interface WorkflowSettings {
  /** Workflow timeout */
  timeout: WorkflowTimeout;
  /** Whether workflow is enabled */
  enabled: boolean;
}

// =============================================================================
// TEMPLATE CONTEXT (For Handlebars interpolation)
// =============================================================================

/**
 * Context available for {{variable}} interpolation in templates
 */
export interface TemplateContext {
  incident: IncidentContext;
  assignee?: AssigneeContext;
  team: TeamContext;
  workflow: WorkflowContext;
}

export interface IncidentContext {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  acknowledgedAt?: string;
  teamName: string;
  /** Alert metadata - integration-specific fields */
  metadata: Record<string, unknown>;
}

export interface AssigneeContext {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface TeamContext {
  id: string;
  name: string;
  slackChannel?: string;
}

export interface WorkflowContext {
  id: string;
  name: string;
  executionId: string;
}

// =============================================================================
// EXECUTION RESULTS
// =============================================================================

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  executionId: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  completedNodes: NodeResult[];
  error?: string;
  /** Duration in milliseconds */
  duration: number;
}

export type NodeResultStatus = 'completed' | 'failed' | 'skipped';

/**
 * Individual node execution result
 */
export interface NodeResult {
  nodeId: string;
  status: NodeResultStatus;
  /** Action-specific result (webhook response, ticket URL, etc.) */
  result?: WebhookResult | TicketResult | unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Webhook action result
 */
export interface WebhookResult {
  statusCode: number;
  responseBody?: string;
}

/**
 * Ticket creation result (Jira/Linear)
 */
export interface TicketResult {
  ticketId: string;
  ticketUrl: string;
}

// =============================================================================
// TRIGGER EVENTS (For workflow matching)
// =============================================================================

export type TriggerEventType =
  | 'incident_created'
  | 'state_changed'
  | 'escalation'
  | 'manual'
  | 'age';

/**
 * Event that may trigger workflows
 */
export interface TriggerEvent {
  type: TriggerEventType;
  incident: {
    id: string;
    priority: string;
    status: string;
    teamId: string;
    metadata?: Record<string, unknown>;
  };
  /** For state_changed - previous state */
  previousState?: string;
  /** For state_changed - new state */
  newState?: string;
}

// =============================================================================
// WORKFLOW SCOPE
// =============================================================================

export type WorkflowScope = 'team' | 'global';

export type TemplateCategory = 'Ticketing' | 'Communication' | 'Auto-resolution';

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for WebhookActionData
 */
export function isWebhookAction(data: ActionData): data is WebhookActionData {
  return data.actionType === 'webhook';
}

/**
 * Type guard for JiraActionData
 */
export function isJiraAction(data: ActionData): data is JiraActionData {
  return data.actionType === 'jira';
}

/**
 * Type guard for LinearActionData
 */
export function isLinearAction(data: ActionData): data is LinearActionData {
  return data.actionType === 'linear';
}

/**
 * Type guard for RunbookActionData
 */
export function isRunbookAction(data: ActionData): data is RunbookActionData {
  return data.actionType === 'runbook';
}

/**
 * Type guard for TriggerData
 */
export function isTriggerData(data: unknown): data is TriggerData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'triggerType' in data &&
    'conditions' in data
  );
}

/**
 * Type guard for ActionData
 */
export function isActionData(data: unknown): data is ActionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'actionType' in data &&
    'config' in data
  );
}

/**
 * Type guard for ConditionData
 */
export function isConditionData(data: unknown): data is ConditionData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'field' in data &&
    'operator' in data &&
    'value' in data
  );
}

/**
 * Type guard for DelayData
 */
export function isDelayData(data: unknown): data is DelayData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'durationMinutes' in data
  );
}
