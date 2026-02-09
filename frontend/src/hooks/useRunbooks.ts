/**
 * Runbook React Query Hooks
 *
 * Provides data fetching for runbook selection in workflow builder
 * and incident detail page.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Types
export interface Runbook {
  id: string;
  name: string;
  description: string;
  approvalStatus: 'DRAFT' | 'APPROVED' | 'DEPRECATED';
  teamId: string | null;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean';
      description?: string;
      default?: string | number | boolean;
      enum?: (string | number)[];
    }>;
    required?: string[];
  };
  version: number;
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  runbookName?: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  triggeredBy: 'workflow' | 'manual';
  executedBy?: { id: string; firstName: string; lastName: string };
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Fetch APPROVED runbooks for workflow builder dropdown.
 * Optionally filter by teamId for team-scoped selection.
 */
export function useApprovedRunbooks(teamId?: string) {
  return useQuery({
    queryKey: ['runbooks', 'approved', teamId],
    queryFn: async () => {
      const params = new URLSearchParams({ approvalStatus: 'APPROVED' });
      if (teamId) params.append('teamId', teamId);
      const res = await api.get(`/runbooks?${params.toString()}`);
      return res.data.runbooks as Runbook[];
    }
  });
}

/**
 * Fetch single runbook by ID.
 */
export function useRunbook(id: string | undefined) {
  return useQuery({
    queryKey: ['runbook', id],
    queryFn: async () => {
      const res = await api.get(`/runbooks/${id}`);
      return res.data.runbook as Runbook;
    },
    enabled: !!id
  });
}

/**
 * Fetch runbook executions for an incident (for timeline display).
 */
export function useIncidentRunbookExecutions(incidentId: string) {
  return useQuery({
    queryKey: ['incidents', incidentId, 'runbook-executions'],
    queryFn: async () => {
      const res = await api.get(`/incidents/${incidentId}/runbooks/executions`);
      return res.data.executions as RunbookExecution[];
    }
  });
}

/**
 * Trigger manual runbook execution for an incident.
 */
export function useExecuteRunbook(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      runbookId,
      parameters
    }: {
      runbookId: string;
      parameters: Record<string, unknown>;
    }) => {
      const res = await api.post(
        `/incidents/${incidentId}/runbooks/${runbookId}/execute`,
        { parameters }
      );
      return res.data.execution;
    },
    onSuccess: () => {
      // Invalidate timeline and executions to show new entry
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId, 'runbook-executions'] });
    }
  });
}
