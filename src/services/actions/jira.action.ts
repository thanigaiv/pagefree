/**
 * Jira ticket creation action for workflow automation
 *
 * Creates Jira tickets using REST API v3 with template interpolation.
 * Stores ticket URL in incident metadata for visibility in timeline/details.
 */

import { Prisma } from '@prisma/client';
import { interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Jira ticket configuration
 */
export interface JiraConfig {
  projectKey: string;
  issueType: string; // e.g., "Bug", "Task", "Story"
  summary: string; // Template string
  description: string; // Template string
  priority?: string; // e.g., "High", "Medium", "Low"
  labels?: string[];
  customFields?: Record<string, unknown>;
}

/**
 * Jira API credentials
 */
export interface JiraCredentials {
  baseUrl: string; // e.g., "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
}

/**
 * Result of Jira ticket creation
 */
export interface JiraResult {
  success: boolean;
  ticketId?: string;
  ticketKey?: string;
  ticketUrl?: string;
  error?: string;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Create a Jira ticket with template interpolation.
 *
 * @param config - Jira ticket configuration with templates
 * @param context - Template context for variable interpolation
 * @param credentials - Jira API credentials (baseUrl, email, apiToken)
 * @returns Result with success status and ticket details
 *
 * @example
 * const result = await createJiraTicket(
 *   {
 *     projectKey: "OPS",
 *     issueType: "Bug",
 *     summary: "[OnCall] {{incident.title}}",
 *     description: "Incident: {{incident.title}}\nPriority: {{incident.priority}}"
 *   },
 *   context,
 *   { baseUrl: "https://example.atlassian.net", email: "...", apiToken: "..." }
 * );
 */
export async function createJiraTicket(
  config: JiraConfig,
  context: TemplateContext,
  credentials: JiraCredentials
): Promise<JiraResult> {
  try {
    // Interpolate templates
    const summary = interpolateTemplate(config.summary, context);
    const description = interpolateTemplate(config.description, context);

    // Build Jira API request body
    // Using Atlassian Document Format (ADF) for description
    const requestBody = {
      fields: {
        project: {
          key: config.projectKey
        },
        issuetype: {
          name: config.issueType
        },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description
                }
              ]
            }
          ]
        },
        ...(config.priority && {
          priority: { name: config.priority }
        }),
        ...(config.labels && config.labels.length > 0 && {
          labels: config.labels
        }),
        ...config.customFields
      }
    };

    // Create Basic auth header
    const authHeader = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');

    // POST to Jira REST API v3
    const response = await fetch(`${credentials.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        {
          statusCode: response.status,
          error: errorBody,
          projectKey: config.projectKey,
          incidentId: context.incident.id
        },
        'Jira ticket creation failed'
      );

      return {
        success: false,
        error: `Jira API error: ${response.status} - ${errorBody}`
      };
    }

    const data = await response.json() as { id: string; key: string; self: string };

    // Build ticket URL
    const ticketUrl = `${credentials.baseUrl}/browse/${data.key}`;

    // Store ticket URL in incident metadata (per user decision)
    await storeTicketInIncidentMetadata(context.incident.id, {
      type: 'jira',
      ticketId: data.id,
      ticketKey: data.key,
      ticketUrl,
      createdAt: new Date().toISOString()
    });

    logger.info(
      {
        ticketId: data.id,
        ticketKey: data.key,
        ticketUrl,
        incidentId: context.incident.id,
        workflowId: context.workflow.id
      },
      'Jira ticket created'
    );

    return {
      success: true,
      ticketId: data.id,
      ticketKey: data.key,
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
      'Jira ticket creation failed'
    );

    return {
      success: false,
      error: errorMessage
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

interface TicketMetadata {
  type: 'jira' | 'linear';
  ticketId: string;
  ticketKey?: string;
  ticketUrl: string;
  createdAt: string;
}

/**
 * Store ticket information in incident metadata.
 * Merges with existing metadata, maintaining a tickets array.
 */
async function storeTicketInIncidentMetadata(
  incidentId: string,
  ticket: TicketMetadata
): Promise<void> {
  // First, get the incident with its first alert to access metadata
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      alerts: {
        take: 1,
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!incident || incident.alerts.length === 0) {
    logger.warn({ incidentId }, 'Could not find incident or alert to store ticket metadata');
    return;
  }

  const alert = incident.alerts[0];
  const existingMetadata = (alert.metadata as Record<string, unknown>) || {};
  const existingTickets = (existingMetadata.tickets as TicketMetadata[]) || [];

  // Add new ticket to the array
  const updatedTickets = [...existingTickets, ticket];

  // Update alert metadata with tickets array
  const updatedMetadata = {
    ...existingMetadata,
    tickets: updatedTickets
  };

  await prisma.alert.update({
    where: { id: alert.id },
    data: {
      metadata: updatedMetadata as unknown as Prisma.InputJsonValue
    }
  });

  logger.debug(
    { incidentId, alertId: alert.id, ticketType: ticket.type },
    'Stored ticket in incident metadata'
  );
}

// Export for use by Linear action
export { storeTicketInIncidentMetadata, type TicketMetadata };
