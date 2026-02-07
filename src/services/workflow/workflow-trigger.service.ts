/**
 * Workflow Trigger Matching Service
 *
 * Finds workflows matching incident events and evaluates trigger conditions.
 * Supports cycle detection to prevent infinite workflow loops.
 *
 * Event types: incident_created, state_changed, escalation, manual, age
 */

import { Workflow } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import type { WorkflowDefinition, TriggerEvent, TriggerCondition } from '../../types/workflow.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum workflow chain depth to prevent infinite loops */
const MAX_WORKFLOW_DEPTH = 3;

// ============================================================================
// Types
// ============================================================================

/**
 * Execution context for cycle detection
 */
export interface ExecutionContext {
  /** Chain of workflow IDs that triggered this execution */
  executionChain: string[];
  /** ID of the current incident */
  incidentId: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Find all enabled workflows matching a trigger event.
 *
 * Queries workflows for:
 * - The incident's team OR global scope
 * - Matching trigger type
 * - All conditions satisfied (simple field matching, no AND/OR)
 *
 * Per user decision: Allow all matching workflows to run in parallel.
 *
 * @param event - The trigger event with incident data
 * @param context - Execution context for cycle detection (optional)
 * @returns Array of matching Workflow objects
 */
export async function findMatchingWorkflows(
  event: TriggerEvent,
  context?: ExecutionContext
): Promise<Workflow[]> {
  // Query all enabled workflows for the incident's team OR global scope
  const workflows = await prisma.workflow.findMany({
    where: {
      isEnabled: true,
      OR: [
        { scopeType: 'global' },
        { teamId: event.incident.teamId }
      ]
    }
  });

  // Filter workflows by trigger conditions
  const matching = workflows.filter((workflow) => {
    // Check for cycle detection
    if (context && !canTriggerWorkflow(workflow.id, context)) {
      return false;
    }

    // Evaluate trigger conditions
    return evaluateTrigger(workflow, event);
  });

  logger.info({
    eventType: event.type,
    incidentId: event.incident.id,
    totalWorkflows: workflows.length,
    matchingWorkflows: matching.map(w => ({ id: w.id, name: w.name }))
  }, 'Found matching workflows for event');

  // Per Claude's discretion: allow all matching workflows to run in parallel
  return matching;
}

/**
 * Evaluate if a single workflow should trigger for an event.
 *
 * @param workflow - The workflow to evaluate
 * @param event - The trigger event
 * @returns True if workflow should trigger
 */
export function evaluateTrigger(workflow: Workflow, event: TriggerEvent): boolean {
  const definition = workflow.definition as unknown as WorkflowDefinition;
  const trigger = definition.trigger;

  // Check trigger type matches
  if (trigger.type !== event.type) {
    return false;
  }

  // For state_changed: check state transition matches
  if (trigger.type === 'state_changed') {
    if (trigger.stateTransition) {
      // Check 'to' state matches
      if (trigger.stateTransition.to !== event.newState) {
        return false;
      }
      // Optionally check 'from' state if specified
      if (trigger.stateTransition.from && trigger.stateTransition.from !== event.previousState) {
        return false;
      }
    }
  }

  // For age trigger: check incident age exceeds threshold
  if (trigger.type === 'age' && trigger.ageThresholdMinutes) {
    const incidentAge = getIncidentAgeMinutes(event.incident);
    if (incidentAge < trigger.ageThresholdMinutes) {
      return false;
    }
  }

  // Check all conditions (simple field matching, no AND/OR per user decision)
  return trigger.conditions.every((condition) => {
    return matchCondition(condition, event.incident);
  });
}

/**
 * Check if a workflow can be triggered (cycle detection).
 *
 * Prevents:
 * - Max depth exceeded (more than MAX_WORKFLOW_DEPTH in chain)
 * - Same workflow appearing twice in chain (direct cycle)
 *
 * @param workflowId - The workflow to check
 * @param context - Current execution context with chain
 * @returns True if workflow can be triggered
 */
export function canTriggerWorkflow(workflowId: string, context: ExecutionContext): boolean {
  // Check max depth
  if (context.executionChain.length >= MAX_WORKFLOW_DEPTH) {
    logger.warn({
      workflowId,
      chain: context.executionChain,
      maxDepth: MAX_WORKFLOW_DEPTH
    }, 'Max workflow depth reached, rejecting trigger');
    return false;
  }

  // Check for cycles (workflow already in chain)
  if (context.executionChain.includes(workflowId)) {
    logger.warn({
      workflowId,
      chain: context.executionChain
    }, 'Workflow cycle detected, rejecting trigger');
    return false;
  }

  return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Match a single condition against incident data.
 * Simple equality check: field value === condition value
 *
 * @param condition - The condition to evaluate
 * @param incident - The incident data to check against
 * @returns True if condition matches
 */
function matchCondition(
  condition: TriggerCondition,
  incident: TriggerEvent['incident']
): boolean {
  const value = getFieldValue(incident, condition.field);
  const matches = String(value) === String(condition.value);

  logger.debug({
    field: condition.field,
    expectedValue: condition.value,
    actualValue: value,
    matches
  }, 'Evaluating trigger condition');

  return matches;
}

/**
 * Get a field value from an object using dot notation.
 * Supports nested paths like 'metadata.service'.
 *
 * @param obj - The object to extract from
 * @param field - The field path (e.g., 'priority', 'metadata.service')
 * @returns The field value, or undefined if not found
 */
function getFieldValue(obj: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
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
 * Calculate incident age in minutes.
 * Used for age-based triggers.
 *
 * @param _incident - The incident data (with id for lookup or createdAt if available)
 * @returns Age in minutes (defaults to 0 if cannot calculate)
 */
function getIncidentAgeMinutes(_incident: TriggerEvent['incident']): number {
  // For age calculation, we need the incident's createdAt timestamp
  // This would typically be passed in the event or fetched from DB
  // For now, return 0 - actual age calculation happens in executor
  // when we have full incident data from database
  return 0;
}

/**
 * Build execution context for a new workflow execution.
 *
 * @param workflowId - The workflow being triggered
 * @param incidentId - The incident ID
 * @param parentChain - Parent execution chain (optional)
 * @returns New execution context with updated chain
 */
export function buildExecutionContext(
  workflowId: string,
  incidentId: string,
  parentChain: string[] = []
): ExecutionContext {
  return {
    executionChain: [...parentChain, workflowId],
    incidentId
  };
}
