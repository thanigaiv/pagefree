/**
 * Template interpolation service using Handlebars
 *
 * Provides safe {{variable}} syntax interpolation for workflow actions.
 * Uses a sandboxed Handlebars environment with only safe, whitelisted helpers.
 */

import Handlebars from 'handlebars';
import { format } from 'date-fns';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

// Create a SAFE sandboxed Handlebars environment (per research pitfall #3)
const safeHandlebars = Handlebars.create();

// Register ONLY safe helpers - no eval/exec/require
safeHandlebars.registerHelper('uppercase', (str: unknown) => {
  return String(str ?? '').toUpperCase();
});

safeHandlebars.registerHelper('lowercase', (str: unknown) => {
  return String(str ?? '').toLowerCase();
});

safeHandlebars.registerHelper('json', (obj: unknown) => {
  return JSON.stringify(obj);
});

safeHandlebars.registerHelper('shortId', (id: unknown) => {
  return String(id ?? '').slice(-6);
});

safeHandlebars.registerHelper('dateFormat', (date: unknown, formatStr?: string) => {
  if (!date) return '';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date as Date;
    return format(dateObj, typeof formatStr === 'string' ? formatStr : 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return String(date);
  }
});

safeHandlebars.registerHelper('default', (value: unknown, defaultValue: unknown) => {
  return value ?? defaultValue;
});

/**
 * Template context containing all available variables for interpolation.
 * Matches the {{incident.title}}, {{assignee.email}} syntax from user requirements.
 */
export interface TemplateContext {
  incident: {
    id: string;
    title: string;
    priority: string;
    status: string;
    createdAt: string;
    acknowledgedAt?: string;
    teamName: string;
    metadata: Record<string, unknown>;
  };
  assignee?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  team: {
    id: string;
    name: string;
    slackChannel?: string;
  };
  workflow: {
    id: string;
    name: string;
    executionId: string;
  };
}

/**
 * Interpolate a template string with the given context.
 *
 * @param template - Template string with {{variable}} placeholders
 * @param context - Context object with values for interpolation
 * @returns Interpolated string
 * @throws Error if template compilation or interpolation fails
 *
 * @example
 * interpolateTemplate(
 *   "Incident {{incident.title}} assigned to {{assignee.email}}",
 *   context
 * )
 */
export function interpolateTemplate(template: string, context: TemplateContext): string {
  try {
    const compiled = safeHandlebars.compile(template);
    return compiled(context);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ template, error: errorMessage }, 'Template interpolation failed');
    throw new Error(`Template error: ${errorMessage}`);
  }
}

/**
 * Build a template context from incident and workflow data.
 * Loads incident with team and assigned user from database.
 *
 * @param incidentId - ID of the incident
 * @param workflowId - ID of the workflow being executed
 * @param executionId - ID of the current execution
 * @param workflowName - Name of the workflow
 * @returns Complete template context for interpolation
 */
export async function buildTemplateContext(
  incidentId: string,
  workflowId: string,
  executionId: string,
  workflowName: string = 'Workflow'
): Promise<TemplateContext> {
  // Load incident with team and assigned user
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      team: true,
      assignedUser: true,
      alerts: {
        take: 1,
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!incident) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  // Get title from first alert
  const firstAlert = incident.alerts[0];
  const title = firstAlert?.title ?? `Incident ${incident.id}`;
  const metadata = (firstAlert?.metadata as Record<string, unknown>) ?? {};

  // Build context
  const context: TemplateContext = {
    incident: {
      id: incident.id,
      title,
      priority: incident.priority,
      status: incident.status,
      createdAt: incident.createdAt.toISOString(),
      acknowledgedAt: incident.acknowledgedAt?.toISOString(),
      teamName: incident.team.name,
      metadata
    },
    team: {
      id: incident.team.id,
      name: incident.team.name,
      slackChannel: incident.team.slackChannel ?? undefined
    },
    workflow: {
      id: workflowId,
      name: workflowName,
      executionId
    }
  };

  // Add assignee if assigned
  if (incident.assignedUser) {
    context.assignee = {
      id: incident.assignedUser.id,
      email: incident.assignedUser.email,
      firstName: incident.assignedUser.firstName,
      lastName: incident.assignedUser.lastName,
      phone: incident.assignedUser.phone ?? undefined
    };
  }

  logger.debug(
    { incidentId, workflowId, executionId },
    'Built template context'
  );

  return context;
}

/**
 * Validate that a template string is syntactically correct.
 * Does not validate that referenced variables exist.
 *
 * @param template - Template string to validate
 * @returns Object with valid boolean and optional error message
 */
export function validateTemplate(template: string): { valid: boolean; error?: string } {
  try {
    safeHandlebars.compile(template);
    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: errorMessage };
  }
}
