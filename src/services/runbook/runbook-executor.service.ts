/**
 * Runbook Executor Service
 *
 * Handles runbook webhook execution with:
 * - Parameter validation against JSON Schema
 * - Handlebars template interpolation
 * - Webhook execution with exponential backoff retry
 * - Execution status tracking and audit logging
 *
 * Per AUTO-08 requirements:
 * - 3 retries with exponential backoff
 * - Full audit trail
 * - Definition snapshot at execution time
 *
 * @module services/runbook/runbook-executor.service
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { auditService } from '../audit.service.js';
import { logger } from '../../config/logger.js';
import { buildTemplateContext, interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { executeWebhookWithRetry, type WebhookConfig, type WebhookAuth } from '../actions/webhook.action.js';
import type {
  RunbookParameterSchema,
  RunbookDefinition,
  RunbookExecutionResult
} from '../../types/runbook.js';

// =============================================================================
// PARAMETER VALIDATION
// =============================================================================

/**
 * Validate parameters against a JSON Schema-like definition using Zod.
 *
 * @param schema - Parameter schema from runbook definition
 * @param values - Parameter values to validate
 * @returns Validation result with errors if invalid
 */
export function validateParameters(
  schema: RunbookParameterSchema,
  values: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  try {
    // Build Zod schema from JSON Schema definition
    const zodSchema = z.object(
      Object.fromEntries(
        Object.entries(schema.properties).map(([key, prop]) => {
          let fieldSchema: z.ZodTypeAny;

          switch (prop.type) {
            case 'string':
              if (prop.enum && prop.enum.length > 0) {
                // Type assertion needed for Zod enum
                const enumValues = prop.enum as [string, ...string[]];
                fieldSchema = z.enum(enumValues);
              } else {
                fieldSchema = z.string();
              }
              break;
            case 'number':
              if (prop.enum && prop.enum.length > 0) {
                const enumValues = prop.enum as number[];
                fieldSchema = z.number().refine(
                  (val) => enumValues.includes(val),
                  { message: `Must be one of: ${enumValues.join(', ')}` }
                );
              } else {
                fieldSchema = z.number();
              }
              break;
            case 'boolean':
              fieldSchema = z.boolean();
              break;
            default:
              fieldSchema = z.unknown();
          }

          // Handle default values
          if (prop.default !== undefined) {
            fieldSchema = fieldSchema.default(prop.default);
          }

          // Handle optional vs required
          const isRequired = schema.required?.includes(key) ?? false;
          return [key, isRequired ? fieldSchema : fieldSchema.optional()];
        })
      )
    );

    const result = zodSchema.safeParse(values);

    if (result.success) {
      return { valid: true };
    }

    return {
      valid: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
    return {
      valid: false,
      errors: [errorMessage]
    };
  }
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

/**
 * Extended template context for runbooks.
 * Adds runbook-specific fields and user parameters.
 */
interface RunbookTemplateContext extends TemplateContext {
  runbook: {
    id: string;
    name: string;
    version: number;
  };
  params: Record<string, unknown>;
}

/**
 * Build extended template context for runbook execution.
 *
 * @param incidentId - Optional incident ID for context
 * @param runbookId - Runbook ID
 * @param executionId - Execution ID
 * @param runbookName - Runbook name
 * @param runbookVersion - Runbook version
 * @param parameters - User-provided parameters
 * @returns Extended template context
 */
async function buildRunbookContext(
  incidentId: string | null,
  runbookId: string,
  executionId: string,
  runbookName: string,
  runbookVersion: number,
  parameters: Record<string, unknown>
): Promise<RunbookTemplateContext> {
  // If we have an incident, use the standard context builder
  if (incidentId) {
    const baseContext = await buildTemplateContext(
      incidentId,
      runbookId,
      executionId,
      runbookName
    );

    return {
      ...baseContext,
      runbook: {
        id: runbookId,
        name: runbookName,
        version: runbookVersion
      },
      params: parameters
    };
  }

  // For manual execution without incident, build minimal context
  return {
    incident: {
      id: '',
      title: 'Manual Execution',
      priority: 'MEDIUM',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      teamName: '',
      metadata: {}
    },
    team: {
      id: '',
      name: ''
    },
    workflow: {
      id: runbookId,
      name: runbookName,
      executionId
    },
    runbook: {
      id: runbookId,
      name: runbookName,
      version: runbookVersion
    },
    params: parameters
  };
}

// =============================================================================
// EXECUTOR SERVICE
// =============================================================================

export const runbookExecutor = {
  /**
   * Execute a runbook against its webhook endpoint.
   *
   * Per AUTO-08 requirements:
   * - Validates runbook is still APPROVED before executing
   * - Builds execution context with incident data + parameters
   * - Posts to webhook with 3 retries + exponential backoff
   * - Stores execution result
   *
   * @param executionId - ID of the RunbookExecution record
   * @returns Execution result
   */
  async execute(executionId: string): Promise<RunbookExecutionResult> {
    const startTime = Date.now();

    // Load execution record
    const execution = await prisma.runbookExecution.findUnique({
      where: { id: executionId },
      include: {
        runbook: true
      }
    });

    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    // Per research pitfall #1: Re-check approval status
    // (Status may have changed between queue add and worker processing)
    if (execution.runbook.approvalStatus !== 'APPROVED') {
      logger.warn(
        { executionId, runbookId: execution.runbookId, status: execution.runbook.approvalStatus },
        'Runbook no longer APPROVED, skipping execution'
      );

      await prisma.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          error: `Runbook is ${execution.runbook.approvalStatus}, not APPROVED`,
          completedAt: new Date()
        }
      });

      return {
        success: false,
        error: `Runbook is ${execution.runbook.approvalStatus}, not APPROVED`,
        duration: Date.now() - startTime
      };
    }

    // Update status to RUNNING
    await prisma.runbookExecution.update({
      where: { id: executionId },
      data: {
        status: 'RUNNING',
        startedAt: new Date()
      }
    });

    try {
      // Use snapshotted definition (per research pitfall #2)
      const definition = execution.definitionSnapshot as unknown as RunbookDefinition;
      const parameters = execution.parameters as Record<string, unknown>;

      // Build template context
      const context = await buildRunbookContext(
        execution.incidentId,
        execution.runbookId,
        executionId,
        definition.name,
        execution.runbookVersion,
        parameters
      );

      // Interpolate payload template
      const payload = interpolateTemplate(definition.payloadTemplate, context as TemplateContext);

      // Build webhook config
      const webhookConfig: WebhookConfig = {
        url: definition.webhookUrl,
        method: definition.webhookMethod as 'POST' | 'PUT' | 'PATCH',
        headers: definition.webhookHeaders,
        body: payload,
        auth: (definition.webhookAuth ?? { type: 'none' }) as WebhookAuth
      };

      // Execute with retry (3 attempts per AUTO-08)
      // Use runbook timeout or default 30s per request
      const result = await executeWebhookWithRetry(
        webhookConfig,
        context as TemplateContext,
        3,  // maxAttempts per AUTO-08 requirement
        1000  // initialDelayMs (1s, 2s, 4s backoff)
      );

      const duration = Date.now() - startTime;

      // Update execution record with result
      await prisma.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: result.success ? 'SUCCESS' : 'FAILED',
          result: result.success ? {
            statusCode: result.statusCode,
            responseBody: result.responseBody
          } as Prisma.InputJsonValue : Prisma.JsonNull,
          error: result.error ?? null,
          completedAt: new Date()
        }
      });

      // Audit log
      await auditService.log({
        action: result.success ? 'runbook.execution.succeeded' : 'runbook.execution.failed',
        resourceType: 'runbook',
        resourceId: execution.runbookId,
        severity: result.success ? 'INFO' : 'HIGH',
        metadata: {
          executionId,
          incidentId: execution.incidentId,
          duration,
          statusCode: result.statusCode,
          error: result.error
        }
      });

      logger.info(
        {
          executionId,
          runbookId: execution.runbookId,
          success: result.success,
          duration,
          statusCode: result.statusCode
        },
        result.success ? 'Runbook execution succeeded' : 'Runbook execution failed'
      );

      return {
        ...result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update execution record with error
      await prisma.runbookExecution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          error: errorMessage,
          completedAt: new Date()
        }
      });

      // Audit log
      await auditService.log({
        action: 'runbook.execution.failed',
        resourceType: 'runbook',
        resourceId: execution.runbookId,
        severity: 'HIGH',
        metadata: {
          executionId,
          incidentId: execution.incidentId,
          duration,
          error: errorMessage
        }
      });

      logger.error(
        {
          executionId,
          runbookId: execution.runbookId,
          error: errorMessage,
          duration
        },
        'Runbook execution error'
      );

      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }
};
