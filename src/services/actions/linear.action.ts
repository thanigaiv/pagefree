/**
 * Linear issue creation action for workflow automation
 *
 * Creates Linear issues using the official TypeScript SDK.
 * Stores ticket URL in incident metadata for visibility in timeline/details.
 */

import { LinearClient } from '@linear/sdk';
import { interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { logger } from '../../config/logger.js';
import { storeTicketInIncidentMetadata } from './jira.action.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Linear issue configuration
 */
export interface LinearConfig {
  teamId: string; // Linear team ID
  title: string; // Template string
  description: string; // Template string
  priority?: number; // 0 = no priority, 1 = urgent, 2 = high, 3 = medium, 4 = low
  labelIds?: string[];
  stateId?: string; // Workflow state ID
  assigneeId?: string;
}

/**
 * Result of Linear issue creation
 */
export interface LinearResult {
  success: boolean;
  ticketId?: string;
  ticketIdentifier?: string; // e.g., "ENG-123"
  ticketUrl?: string;
  error?: string;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Create a Linear issue with template interpolation.
 *
 * @param config - Linear issue configuration with templates
 * @param context - Template context for variable interpolation
 * @param apiKey - Linear API key
 * @returns Result with success status and issue details
 *
 * @example
 * const result = await createLinearTicket(
 *   {
 *     teamId: "team-id-123",
 *     title: "[OnCall] {{incident.title}}",
 *     description: "Incident from OnCall platform\n\nPriority: {{incident.priority}}",
 *     priority: 2
 *   },
 *   context,
 *   "lin_api_xxxxx"
 * );
 */
export async function createLinearTicket(
  config: LinearConfig,
  context: TemplateContext,
  apiKey: string
): Promise<LinearResult> {
  try {
    // Create Linear client
    const client = new LinearClient({ apiKey });

    // Interpolate templates
    const title = interpolateTemplate(config.title, context);
    const description = interpolateTemplate(config.description, context);

    // Create the issue
    const issuePayload = await client.createIssue({
      teamId: config.teamId,
      title,
      description,
      priority: config.priority,
      labelIds: config.labelIds,
      stateId: config.stateId,
      assigneeId: config.assigneeId
    });

    // Get the created issue to retrieve URL and identifier
    const issue = await issuePayload.issue;

    if (!issue) {
      throw new Error('Issue created but could not retrieve details');
    }

    const ticketUrl = issue.url;
    const ticketId = issue.id;
    const ticketIdentifier = issue.identifier;

    // Store ticket URL in incident metadata (per user decision)
    await storeTicketInIncidentMetadata(context.incident.id, {
      type: 'linear',
      ticketId,
      ticketKey: ticketIdentifier,
      ticketUrl,
      createdAt: new Date().toISOString()
    });

    logger.info(
      {
        ticketId,
        ticketIdentifier,
        ticketUrl,
        incidentId: context.incident.id,
        workflowId: context.workflow.id
      },
      'Linear issue created'
    );

    return {
      success: true,
      ticketId,
      ticketIdentifier,
      ticketUrl
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        incidentId: context.incident.id,
        workflowId: context.workflow.id
      },
      'Linear issue creation failed'
    );

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get available Linear teams for configuration UI.
 *
 * @param apiKey - Linear API key
 * @returns Array of team objects with id and name
 */
export async function getLinearTeams(
  apiKey: string
): Promise<Array<{ id: string; name: string; key: string }>> {
  try {
    const client = new LinearClient({ apiKey });
    const teams = await client.teams();

    return teams.nodes.map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch Linear teams');
    throw new Error(`Failed to fetch Linear teams: ${errorMessage}`);
  }
}

/**
 * Get available Linear labels for a team.
 *
 * @param apiKey - Linear API key
 * @param teamId - Linear team ID
 * @returns Array of label objects with id and name
 */
export async function getLinearLabels(
  apiKey: string,
  teamId: string
): Promise<Array<{ id: string; name: string; color: string }>> {
  try {
    const client = new LinearClient({ apiKey });
    const team = await client.team(teamId);
    const labels = await team.labels();

    return labels.nodes.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, teamId }, 'Failed to fetch Linear labels');
    throw new Error(`Failed to fetch Linear labels: ${errorMessage}`);
  }
}
