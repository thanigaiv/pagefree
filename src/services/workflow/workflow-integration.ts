/**
 * Workflow Integration with Incident Lifecycle
 *
 * Hooks workflow triggers into incident lifecycle events:
 * - Incident created
 * - State changes (acknowledged, resolved, closed)
 * - Escalation events
 * - Age-based triggers (polling)
 * - Manual trigger
 *
 * Per user decisions:
 * - In-flight workflows use old version (definitionSnapshot)
 * - Workflow failures don't break incident operations
 * - All workflow actions logged to incident timeline
 *
 * @module services/workflow/workflow-integration
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { auditService } from '../audit.service.js';
import { findMatchingWorkflows, type ExecutionContext } from './workflow-trigger.service.js';
import { scheduleWorkflow } from '../../queues/workflow.queue.js';
import type { TriggerEvent, WorkflowDefinition } from '../../types/workflow.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Incident data used for trigger events
 */
export interface IncidentData {
  id: string;
  priority: string;
  status: string;
  teamId: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Age-based Trigger State
// ============================================================================

/** Interval handle for age-based trigger polling */
let agePollingInterval: NodeJS.Timeout | null = null;

/** Polling interval in milliseconds (5 minutes) */
const AGE_POLLING_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================================
// Main Trigger Functions
// ============================================================================

/**
 * Trigger workflows matching an event.
 *
 * For each matching workflow:
 * 1. Create WorkflowExecution record with PENDING status
 * 2. Snapshot definition to definitionSnapshot (per user decision)
 * 3. Schedule workflow job via scheduleWorkflow
 * 4. Log audit event
 *
 * @param event - The trigger event with incident data
 * @param context - Optional execution context for cycle detection
 */
export async function triggerWorkflows(
  event: TriggerEvent,
  context?: ExecutionContext
): Promise<void> {
  try {
    // Find all matching workflows
    const matchingWorkflows = await findMatchingWorkflows(event, context);

    if (matchingWorkflows.length === 0) {
      logger.debug(
        { eventType: event.type, incidentId: event.incident.id },
        'No matching workflows found for event'
      );
      return;
    }

    logger.info(
      { eventType: event.type, incidentId: event.incident.id, count: matchingWorkflows.length },
      'Triggering matching workflows'
    );

    // Trigger each matching workflow
    for (const workflow of matchingWorkflows) {
      try {
        // Create execution record with definition snapshot (per user decision)
        const execution = await prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            workflowVersion: workflow.version,
            definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
            incidentId: event.incident.id,
            triggeredBy: 'event',
            triggerEvent: event.type,
            status: 'PENDING',
            completedNodes: []
          }
        });

        // Build execution chain for cycle detection
        const executionChain = context
          ? [...context.executionChain, workflow.id]
          : [workflow.id];

        // Schedule workflow for execution
        await scheduleWorkflow(
          execution.id,
          event.incident.id,
          workflow.id,
          'event',
          executionChain
        );

        // Audit log for workflow triggered
        await auditService.log({
          action: 'workflow.triggered',
          teamId: workflow.teamId ?? undefined,
          resourceType: 'workflow',
          resourceId: workflow.id,
          metadata: {
            executionId: execution.id,
            incidentId: event.incident.id,
            triggerEvent: event.type,
            workflowName: workflow.name
          }
        });

        logger.debug(
          { workflowId: workflow.id, executionId: execution.id, incidentId: event.incident.id },
          'Workflow triggered and scheduled'
        );
      } catch (error) {
        // Log error but continue with other workflows
        logger.error(
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            workflowId: workflow.id,
            incidentId: event.incident.id
          },
          'Failed to trigger workflow'
        );
      }
    }

    logger.info(
      { eventType: event.type, incidentId: event.incident.id, triggeredCount: matchingWorkflows.length },
      'Workflows triggered successfully'
    );
  } catch (error) {
    // Log but don't throw - workflows shouldn't break incident flow
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        incidentId: event.incident.id
      },
      'Error triggering workflows'
    );
  }
}

// ============================================================================
// Incident Lifecycle Hooks
// ============================================================================

/**
 * Hook for incident creation.
 * Call this after successfully creating an incident.
 *
 * @param incident - The created incident
 */
export async function onIncidentCreated(incident: IncidentData): Promise<void> {
  const event: TriggerEvent = {
    type: 'incident_created',
    incident: {
      id: incident.id,
      priority: incident.priority,
      status: incident.status,
      teamId: incident.teamId,
      metadata: incident.metadata
    }
  };

  await triggerWorkflows(event);
}

/**
 * Hook for incident state changes.
 * Call this after successfully changing incident state.
 *
 * @param incident - The updated incident
 * @param previousState - The previous status
 * @param newState - The new status
 */
export async function onIncidentStateChanged(
  incident: IncidentData,
  previousState: string,
  newState: string
): Promise<void> {
  const event: TriggerEvent = {
    type: 'state_changed',
    incident: {
      id: incident.id,
      priority: incident.priority,
      status: newState,
      teamId: incident.teamId,
      metadata: incident.metadata
    },
    previousState,
    newState
  };

  await triggerWorkflows(event);
}

/**
 * Hook for escalation events.
 * Call this after an incident is escalated to a new level.
 *
 * @param incident - The escalated incident
 */
export async function onIncidentEscalated(incident: IncidentData): Promise<void> {
  const event: TriggerEvent = {
    type: 'escalation',
    incident: {
      id: incident.id,
      priority: incident.priority,
      status: incident.status,
      teamId: incident.teamId,
      metadata: incident.metadata
    }
  };

  await triggerWorkflows(event);
}

/**
 * Manually trigger a workflow for an incident.
 *
 * @param workflowId - The workflow to trigger
 * @param incidentId - The incident to execute against
 * @param userId - The user triggering the workflow
 * @returns The execution ID
 */
export async function triggerManualWorkflow(
  workflowId: string,
  incidentId: string,
  userId: string
): Promise<string> {
  // Load workflow
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId }
  });

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  if (!workflow.isEnabled) {
    throw new Error('Cannot trigger disabled workflow');
  }

  // Load incident
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId }
  });

  if (!incident) {
    throw new Error('Incident not found');
  }

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      workflowVersion: workflow.version,
      definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
      incidentId,
      triggeredBy: 'manual',
      triggerEvent: 'manual',
      status: 'PENDING',
      completedNodes: []
    }
  });

  // Schedule workflow execution
  await scheduleWorkflow(
    execution.id,
    incidentId,
    workflowId,
    'manual',
    [workflowId]
  );

  // Audit log
  await auditService.log({
    action: 'workflow.triggered',
    userId,
    resourceType: 'workflow',
    resourceId: workflowId,
    metadata: {
      executionId: execution.id,
      incidentId,
      triggeredBy: 'manual',
      workflowName: workflow.name
    }
  });

  logger.info(
    { workflowId, executionId: execution.id, incidentId, userId },
    'Workflow manually triggered'
  );

  return execution.id;
}

// ============================================================================
// Age-based Trigger Polling
// ============================================================================

/**
 * Check for age-based triggers.
 *
 * Finds all enabled workflows with trigger.type='age', then queries
 * OPEN incidents older than their threshold without recent execution.
 *
 * Per user decision: incident age triggers enabled.
 */
export async function checkAgeBasedTriggers(): Promise<void> {
  try {
    // Find all enabled workflows with age trigger
    const ageWorkflows = await prisma.workflow.findMany({
      where: {
        isEnabled: true,
        isTemplate: false
      }
    });

    // Filter to only age-type triggers
    const ageTriggeredWorkflows = ageWorkflows.filter((workflow) => {
      const definition = workflow.definition as unknown as WorkflowDefinition;
      return definition.trigger?.type === 'age';
    });

    if (ageTriggeredWorkflows.length === 0) {
      return;
    }

    logger.debug(
      { count: ageTriggeredWorkflows.length },
      'Checking age-based triggers'
    );

    for (const workflow of ageTriggeredWorkflows) {
      const definition = workflow.definition as unknown as WorkflowDefinition;
      const ageThresholdMinutes = definition.trigger.ageThresholdMinutes || 60;
      const thresholdTime = new Date(Date.now() - ageThresholdMinutes * 60 * 1000);

      // Build incident where clause
      const incidentWhere: Prisma.IncidentWhereInput = {
        status: 'OPEN',
        createdAt: { lt: thresholdTime }
      };

      // Add team filter for team-scoped workflows
      if (workflow.scopeType === 'team' && workflow.teamId) {
        incidentWhere.teamId = workflow.teamId;
      }

      // Find OPEN incidents older than threshold
      const eligibleIncidents = await prisma.incident.findMany({
        where: incidentWhere,
        select: {
          id: true,
          priority: true,
          status: true,
          teamId: true,
          createdAt: true
        }
      });

      for (const incident of eligibleIncidents) {
        // Check if workflow already ran for this incident recently (within threshold)
        const recentExecution = await prisma.workflowExecution.findFirst({
          where: {
            workflowId: workflow.id,
            incidentId: incident.id,
            createdAt: { gt: thresholdTime }
          }
        });

        if (recentExecution) {
          // Skip - already triggered for this incident recently
          continue;
        }

        // Evaluate conditions
        const definition = workflow.definition as unknown as WorkflowDefinition;
        const conditionsMet = definition.trigger.conditions.every((condition) => {
          const value = getIncidentFieldValue(incident, condition.field);
          return String(value) === String(condition.value);
        });

        if (conditionsMet) {
          // Trigger the workflow
          try {
            const execution = await prisma.workflowExecution.create({
              data: {
                workflowId: workflow.id,
                workflowVersion: workflow.version,
                definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
                incidentId: incident.id,
                triggeredBy: 'event',
                triggerEvent: 'age',
                status: 'PENDING',
                completedNodes: []
              }
            });

            await scheduleWorkflow(
              execution.id,
              incident.id,
              workflow.id,
              'event',
              [workflow.id]
            );

            await auditService.log({
              action: 'workflow.triggered',
              teamId: workflow.teamId ?? undefined,
              resourceType: 'workflow',
              resourceId: workflow.id,
              metadata: {
                executionId: execution.id,
                incidentId: incident.id,
                triggerEvent: 'age',
                workflowName: workflow.name,
                ageMinutes: Math.round((Date.now() - incident.createdAt.getTime()) / 60000)
              }
            });

            logger.info(
              {
                workflowId: workflow.id,
                incidentId: incident.id,
                ageMinutes: Math.round((Date.now() - incident.createdAt.getTime()) / 60000)
              },
              'Age-based workflow triggered'
            );
          } catch (error) {
            logger.error(
              {
                error: error instanceof Error ? error.message : 'Unknown error',
                workflowId: workflow.id,
                incidentId: incident.id
              },
              'Failed to trigger age-based workflow'
            );
          }
        }
      }
    }
  } catch (error) {
    // Log but don't throw - age polling shouldn't crash the system
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Error checking age-based triggers'
    );
  }
}

/**
 * Helper to get field value from incident for condition matching.
 */
function getIncidentFieldValue(incident: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let value: unknown = incident;

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

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Setup age-based trigger polling.
 *
 * Runs checkAgeBasedTriggers every 5 minutes.
 */
export function setupWorkflowTriggers(): void {
  if (agePollingInterval) {
    logger.warn('Workflow age triggers already initialized');
    return;
  }

  // Run immediately on startup
  checkAgeBasedTriggers().catch((error) => {
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Initial age trigger check failed'
    );
  });

  // Then run on interval
  agePollingInterval = setInterval(() => {
    checkAgeBasedTriggers().catch((error) => {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Age trigger check failed'
      );
    });
  }, AGE_POLLING_INTERVAL_MS);

  logger.info(
    { intervalMs: AGE_POLLING_INTERVAL_MS },
    'Workflow age triggers initialized'
  );
}

/**
 * Stop age-based trigger polling.
 * Call this during graceful shutdown.
 */
export function stopWorkflowTriggers(): void {
  if (agePollingInterval) {
    clearInterval(agePollingInterval);
    agePollingInterval = null;
    logger.info('Workflow age triggers stopped');
  }
}
