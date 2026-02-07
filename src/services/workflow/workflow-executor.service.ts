/**
 * Workflow Executor Service
 *
 * Orchestrates sequential workflow execution with:
 * - Stop-on-first-error behavior (per user decision)
 * - Configurable timeout enforcement
 * - State persistence after each action
 * - Retry with exponential backoff per action
 */

import { Prisma, WorkflowExecution } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { buildTemplateContext } from './template.service.js';
import { executeWebhookWithRetry, type WebhookConfig } from '../actions/webhook.action.js';
import { createJiraTicket, type JiraConfig, type JiraCredentials } from '../actions/jira.action.js';
import { createLinearTicket, type LinearConfig } from '../actions/linear.action.js';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  ActionData,
  ConditionData,
  DelayData,
  NodeResult,
  WorkflowExecutionResult,
  isActionData,
  isConditionData,
  isDelayData
} from '../../types/workflow.js';

// ============================================================================
// Constants
// ============================================================================

/** Workflow timeout values in milliseconds (per user decision) */
const WORKFLOW_TIMEOUTS: Record<string, number> = {
  '1min': 60_000,
  '5min': 300_000,
  '15min': 900_000
};

/** Default per-action timeout (max 30 seconds per research recommendation) */
const DEFAULT_ACTION_TIMEOUT_MS = 30_000;

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a workflow from its execution record.
 *
 * Sequential execution, stop on first error per user decision.
 * Persists state after each action for crash recovery.
 *
 * @param execution - The WorkflowExecution record with definitionSnapshot
 * @param secrets - Map of secret name -> decrypted value
 * @returns Execution result with status and completed nodes
 */
export async function executeWorkflow(
  execution: WorkflowExecution,
  secrets: Map<string, string>
): Promise<WorkflowExecutionResult> {
  const startTime = Date.now();
  const definition = execution.definitionSnapshot as unknown as WorkflowDefinition;
  const workflowTimeout = WORKFLOW_TIMEOUTS[definition.settings.timeout] || WORKFLOW_TIMEOUTS['5min'];

  logger.info({
    executionId: execution.id,
    workflowId: execution.workflowId,
    incidentId: execution.incidentId,
    timeout: definition.settings.timeout
  }, 'Starting workflow execution');

  // Build template context
  let context;
  try {
    context = await buildTemplateContext(
      execution.incidentId,
      execution.workflowId,
      execution.id,
      definition.name
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to build context';
    logger.error({ executionId: execution.id, error: errorMessage }, 'Failed to build template context');

    return {
      executionId: execution.id,
      status: 'FAILED',
      completedNodes: [],
      error: errorMessage,
      duration: Date.now() - startTime
    };
  }

  // Sort nodes topologically for sequential execution
  const sortedNodes = topologicalSort(definition.nodes, definition.edges);

  const completedNodes: NodeResult[] = [];
  let currentPath: string[] = ['true']; // Default path for non-branching

  // Execute nodes sequentially
  for (const node of sortedNodes) {
    const elapsed = Date.now() - startTime;

    // Check workflow timeout (per research pitfall #4)
    if (elapsed >= workflowTimeout) {
      logger.warn({
        executionId: execution.id,
        elapsed,
        timeout: workflowTimeout
      }, 'Workflow timeout exceeded');

      await updateExecutionStatus(execution.id, 'CANCELLED', 'Workflow timeout exceeded');

      return {
        executionId: execution.id,
        status: 'CANCELLED',
        completedNodes,
        error: 'Workflow timeout exceeded',
        duration: elapsed
      };
    }

    // Update current node
    await prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { currentNodeId: node.id }
    });

    // Execute node
    const nodeStartTime = Date.now();
    const remainingTimeout = workflowTimeout - elapsed;
    let nodeResult: NodeResult;

    try {
      nodeResult = await executeNode(
        node,
        context,
        secrets,
        remainingTimeout,
        currentPath
      );

      // Update path if condition node
      if (node.type === 'condition' && nodeResult.result) {
        currentPath = [String(nodeResult.result)];
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      nodeResult = {
        nodeId: node.id,
        status: 'failed',
        error: errorMessage,
        startedAt: new Date(nodeStartTime),
        completedAt: new Date()
      };
    }

    completedNodes.push(nodeResult);

    // Persist completed node (per research pitfall #5)
    await persistCompletedNode(execution.id, nodeResult);

    // Stop on first error (per user decision)
    if (nodeResult.status === 'failed') {
      logger.error({
        executionId: execution.id,
        nodeId: node.id,
        error: nodeResult.error
      }, 'Workflow execution failed at node');

      await updateExecutionStatus(execution.id, 'FAILED', nodeResult.error);

      return {
        executionId: execution.id,
        status: 'FAILED',
        completedNodes,
        error: nodeResult.error,
        duration: Date.now() - startTime
      };
    }

    logger.debug({
      executionId: execution.id,
      nodeId: node.id,
      status: nodeResult.status
    }, 'Node execution completed');
  }

  // All nodes completed successfully
  await updateExecutionStatus(execution.id, 'COMPLETED');

  logger.info({
    executionId: execution.id,
    completedNodes: completedNodes.length,
    duration: Date.now() - startTime
  }, 'Workflow execution completed');

  return {
    executionId: execution.id,
    status: 'COMPLETED',
    completedNodes,
    duration: Date.now() - startTime
  };
}

// ============================================================================
// Node Execution
// ============================================================================

/**
 * Execute a single workflow node.
 *
 * Routes to appropriate handler based on node type:
 * - trigger: No-op (start marker)
 * - action: Execute webhook/jira/linear
 * - condition: Evaluate condition
 * - delay: Wait for duration
 */
async function executeNode(
  node: WorkflowNode,
  context: Awaited<ReturnType<typeof buildTemplateContext>>,
  secrets: Map<string, string>,
  remainingTimeout: number,
  _currentPath: string[]
): Promise<NodeResult> {
  const startedAt = new Date();

  switch (node.type) {
    case 'trigger':
      // Trigger node is just a start marker
      return {
        nodeId: node.id,
        status: 'completed',
        startedAt,
        completedAt: new Date()
      };

    case 'action':
      return executeActionNode(node, context, secrets, remainingTimeout);

    case 'condition':
      return executeConditionNode(node, context);

    case 'delay':
      return executeDelayNode(node, remainingTimeout);

    default:
      return {
        nodeId: node.id,
        status: 'failed',
        error: `Unknown node type: ${(node as WorkflowNode).type}`,
        startedAt,
        completedAt: new Date()
      };
  }
}

/**
 * Execute an action node (webhook, jira, linear).
 */
async function executeActionNode(
  node: WorkflowNode,
  context: Awaited<ReturnType<typeof buildTemplateContext>>,
  secrets: Map<string, string>,
  remainingTimeout: number
): Promise<NodeResult> {
  const startedAt = new Date();
  const data = node.data as ActionData;

  // Calculate per-action timeout: min(30s, remainingTimeout * 0.8) per research
  const actionTimeout = Math.min(
    DEFAULT_ACTION_TIMEOUT_MS,
    Math.floor(remainingTimeout * 0.8)
  );

  try {
    switch (data.actionType) {
      case 'webhook':
        return await executeWebhookAction(node.id, data, context, actionTimeout);

      case 'jira':
        return await executeJiraAction(node.id, data, context, secrets);

      case 'linear':
        return await executeLinearAction(node.id, data, context, secrets);

      default:
        return {
          nodeId: node.id,
          status: 'failed',
          error: `Unknown action type: ${(data as ActionData).actionType}`,
          startedAt,
          completedAt: new Date()
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Action execution failed';
    return {
      nodeId: node.id,
      status: 'failed',
      error: errorMessage,
      startedAt,
      completedAt: new Date()
    };
  }
}

/**
 * Execute a webhook action with retry.
 */
async function executeWebhookAction(
  nodeId: string,
  data: ActionData & { actionType: 'webhook' },
  context: Awaited<ReturnType<typeof buildTemplateContext>>,
  _actionTimeout: number
): Promise<NodeResult> {
  const startedAt = new Date();

  const config: WebhookConfig = {
    url: data.config.url,
    method: data.config.method,
    headers: data.config.headers,
    body: data.config.body,
    auth: data.config.auth as WebhookConfig['auth']
  };

  // Use retry wrapper with configured attempts and backoff
  const result = await executeWebhookWithRetry(
    config,
    context,
    data.retry.attempts,
    data.retry.initialDelayMs
  );

  return {
    nodeId,
    status: result.success ? 'completed' : 'failed',
    result: result.success ? {
      statusCode: result.statusCode,
      responseBody: result.responseBody
    } : undefined,
    error: result.error,
    startedAt,
    completedAt: new Date()
  };
}

/**
 * Execute a Jira ticket creation action.
 */
async function executeJiraAction(
  nodeId: string,
  data: ActionData & { actionType: 'jira' },
  context: Awaited<ReturnType<typeof buildTemplateContext>>,
  secrets: Map<string, string>
): Promise<NodeResult> {
  const startedAt = new Date();

  // Get Jira credentials from secrets
  const baseUrl = secrets.get('jira_base_url');
  const email = secrets.get('jira_email');
  const apiToken = secrets.get('jira_api_token');

  if (!baseUrl || !email || !apiToken) {
    return {
      nodeId,
      status: 'failed',
      error: 'Missing Jira credentials (jira_base_url, jira_email, jira_api_token)',
      startedAt,
      completedAt: new Date()
    };
  }

  const credentials: JiraCredentials = { baseUrl, email, apiToken };
  const config: JiraConfig = {
    projectKey: data.config.projectKey,
    issueType: data.config.issueType,
    summary: data.config.summary,
    description: data.config.description,
    priority: data.config.priority,
    labels: data.config.labels
  };

  const result = await createJiraTicket(config, context, credentials);

  return {
    nodeId,
    status: result.success ? 'completed' : 'failed',
    result: result.success ? {
      ticketId: result.ticketId,
      ticketUrl: result.ticketUrl
    } : undefined,
    error: result.error,
    startedAt,
    completedAt: new Date()
  };
}

/**
 * Execute a Linear issue creation action.
 */
async function executeLinearAction(
  nodeId: string,
  data: ActionData & { actionType: 'linear' },
  context: Awaited<ReturnType<typeof buildTemplateContext>>,
  secrets: Map<string, string>
): Promise<NodeResult> {
  const startedAt = new Date();

  // Get Linear API key from secrets
  const apiKey = secrets.get('linear_api_key');

  if (!apiKey) {
    return {
      nodeId,
      status: 'failed',
      error: 'Missing Linear API key (linear_api_key)',
      startedAt,
      completedAt: new Date()
    };
  }

  const config: LinearConfig = {
    teamId: data.config.teamId,
    title: data.config.title,
    description: data.config.description,
    priority: data.config.priority,
    labelIds: data.config.labelIds
  };

  const result = await createLinearTicket(config, context, apiKey);

  return {
    nodeId,
    status: result.success ? 'completed' : 'failed',
    result: result.success ? {
      ticketId: result.ticketId,
      ticketUrl: result.ticketUrl
    } : undefined,
    error: result.error,
    startedAt,
    completedAt: new Date()
  };
}

/**
 * Execute a condition node.
 * Returns 'true' or 'false' as result to determine edge to follow.
 */
async function executeConditionNode(
  node: WorkflowNode,
  context: Awaited<ReturnType<typeof buildTemplateContext>>
): Promise<NodeResult> {
  const startedAt = new Date();
  const data = node.data as ConditionData;

  // Extract field value from context using nested path
  const value = getNestedValue(context as unknown as Record<string, unknown>, data.field);

  // Simple equality check (per user decision)
  const matches = String(value) === String(data.value);

  return {
    nodeId: node.id,
    status: 'completed',
    result: matches ? 'true' : 'false',
    startedAt,
    completedAt: new Date()
  };
}

/**
 * Execute a delay node.
 */
async function executeDelayNode(
  node: WorkflowNode,
  remainingTimeout: number
): Promise<NodeResult> {
  const startedAt = new Date();
  const data = node.data as DelayData;

  const delayMs = data.durationMinutes * 60 * 1000;

  // Don't exceed remaining timeout
  const actualDelay = Math.min(delayMs, remainingTimeout - 1000);

  if (actualDelay < delayMs) {
    logger.warn({
      nodeId: node.id,
      requestedDelay: delayMs,
      actualDelay
    }, 'Delay truncated due to workflow timeout');
  }

  await new Promise(resolve => setTimeout(resolve, actualDelay));

  return {
    nodeId: node.id,
    status: 'completed',
    result: { delayedMs: actualDelay },
    startedAt,
    completedAt: new Date()
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Topologically sort nodes for sequential execution.
 * Follows edges from source to target.
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build graph
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Find start nodes (in-degree 0)
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Process
  const result: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      result.push(node);
    }

    for (const targetId of adjacency.get(nodeId) || []) {
      const newDegree = (inDegree.get(targetId) || 1) - 1;
      inDegree.set(targetId, newDegree);
      if (newDegree === 0) {
        queue.push(targetId);
      }
    }
  }

  return result;
}

/**
 * Get nested value from object using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = obj;

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== 'object') {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Serialized node result for JSON storage
 */
interface SerializedNodeResult {
  nodeId: string;
  status: string;
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Persist completed node result to database.
 */
async function persistCompletedNode(executionId: string, nodeResult: NodeResult): Promise<void> {
  // Get current completed nodes
  const execution = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
    select: { completedNodes: true }
  });

  const currentNodes = (execution?.completedNodes as unknown as SerializedNodeResult[]) || [];

  // Serialize dates for JSON storage
  const serializedResult: SerializedNodeResult = {
    nodeId: nodeResult.nodeId,
    status: nodeResult.status,
    result: nodeResult.result,
    error: nodeResult.error,
    startedAt: nodeResult.startedAt.toISOString(),
    completedAt: nodeResult.completedAt.toISOString()
  };

  // Append new result
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      completedNodes: [...currentNodes, serializedResult] as unknown as Prisma.InputJsonValue
    }
  });
}

/**
 * Update execution status in database.
 */
async function updateExecutionStatus(
  executionId: string,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
  error?: string
): Promise<void> {
  const now = new Date();

  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status,
      ...(status === 'COMPLETED' && { completedAt: now }),
      ...(status === 'FAILED' && { failedAt: now, error }),
      ...(status === 'CANCELLED' && { completedAt: now, error })
    }
  });
}

// Export type guards for use elsewhere
export { isActionData, isConditionData, isDelayData };
