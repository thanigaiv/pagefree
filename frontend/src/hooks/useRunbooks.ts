/**
 * Runbook React Query Hooks
 *
 * Provides data fetching and mutations for runbook CRUD operations,
 * approval workflow, and execution management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface Runbook {
  id: string;
  name: string;
  description: string;
  approvalStatus: 'DRAFT' | 'APPROVED' | 'DEPRECATED';
  teamId: string | null;
  team?: { id: string; name: string } | null;
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
  webhookUrl: string;
  webhookMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  webhookHeaders?: Record<string, string>;
  webhookAuth?: {
    type: 'basic' | 'bearer' | 'header';
    credentials?: string;
    headerName?: string;
    headerValue?: string;
  };
  payloadTemplate?: string;
  timeoutSeconds: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunbookExecution {
  id: string;
  runbookId: string;
  runbookName?: string;
  runbookVersion: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  triggeredBy: 'workflow' | 'manual';
  executedBy?: { id: string; firstName: string; lastName: string; email: string };
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  incident?: { id: string; status: string; priority: string };
  createdAt: string;
  completedAt?: string;
  startedAt?: string;
}

export interface RunbookFilters {
  teamId?: string;
  approvalStatus?: 'DRAFT' | 'APPROVED' | 'DEPRECATED';
  page?: number;
  limit?: number;
}

export interface CreateRunbookInput {
  name: string;
  description: string;
  teamId?: string;
  webhookUrl: string;
  webhookMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  webhookHeaders?: Record<string, string>;
  webhookAuth?: {
    type: 'basic' | 'bearer' | 'header';
    credentials?: string;
    headerName?: string;
    headerValue?: string;
  };
  parameters?: Runbook['parameters'];
  payloadTemplate?: string;
  timeoutSeconds?: number;
}

export interface UpdateRunbookInput extends Partial<CreateRunbookInput> {
  changeNote?: string;
}

// =============================================================================
// LIST AND GET HOOKS
// =============================================================================

/**
 * Fetch runbooks with pagination and filters.
 */
export function useRunbooks(filters: RunbookFilters = {}) {
  const { teamId, approvalStatus, page = 1, limit = 20 } = filters;

  return useQuery({
    queryKey: ['runbooks', { teamId, approvalStatus, page, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (approvalStatus) params.append('approvalStatus', approvalStatus);
      params.append('page', String(page));
      params.append('limit', String(limit));

      const res = await apiFetch<{ runbooks: Runbook[]; total: number; page: number; limit: number }>(
        `/runbooks?${params.toString()}`
      );
      return res;
    }
  });
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
      const res = await apiFetch<{ runbooks: Runbook[] }>(`/runbooks?${params.toString()}`);
      return res.runbooks;
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
      const res = await apiFetch<{ runbook: Runbook }>(`/runbooks/${id}`);
      return res.runbook;
    },
    enabled: !!id
  });
}

// =============================================================================
// CRUD MUTATIONS
// =============================================================================

/**
 * Create new runbook mutation.
 */
export function useCreateRunbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRunbookInput) => {
      const res = await apiFetch<{ runbook: Runbook }>('/runbooks', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      return res.runbook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
    }
  });
}

/**
 * Update runbook mutation.
 */
export function useUpdateRunbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateRunbookInput & { id: string }) => {
      const res = await apiFetch<{ runbook: Runbook }>(`/runbooks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input)
      });
      return res.runbook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      queryClient.invalidateQueries({ queryKey: ['runbook', data.id] });
    }
  });
}

/**
 * Delete runbook mutation.
 */
export function useDeleteRunbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/runbooks/${id}`, { method: 'DELETE' });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
    }
  });
}

// =============================================================================
// EXECUTION HOOKS
// =============================================================================

/**
 * Fetch execution history for a runbook.
 */
export function useRunbookExecutions(runbookId: string | undefined) {
  return useQuery({
    queryKey: ['runbook', runbookId, 'executions'],
    queryFn: async () => {
      const res = await apiFetch<{ executions: RunbookExecution[] }>(
        `/runbooks/${runbookId}/executions`
      );
      return res.executions;
    },
    enabled: !!runbookId
  });
}

/**
 * Fetch runbook executions for an incident (for timeline display).
 */
export function useIncidentRunbookExecutions(incidentId: string) {
  return useQuery({
    queryKey: ['incidents', incidentId, 'runbook-executions'],
    queryFn: async () => {
      const res = await apiFetch<{ executions: RunbookExecution[] }>(`/incidents/${incidentId}/runbooks/executions`);
      return res.executions;
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
      const res = await apiFetch<{ execution: RunbookExecution }>(
        `/incidents/${incidentId}/runbooks/${runbookId}/execute`,
        {
          method: 'POST',
          body: JSON.stringify({ parameters })
        }
      );
      return res.execution;
    },
    onSuccess: () => {
      // Invalidate timeline and executions to show new entry
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId, 'timeline'] });
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId, 'runbook-executions'] });
    }
  });
}

/**
 * Execute runbook standalone (not tied to incident).
 */
export function useExecuteRunbookStandalone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      runbookId,
      parameters = {}
    }: {
      runbookId: string;
      parameters?: Record<string, unknown>;
    }) => {
      const res = await apiFetch<{ execution: { id: string; status: string } }>(
        `/runbooks/${runbookId}/execute`,
        {
          method: 'POST',
          body: JSON.stringify({ parameters })
        }
      );
      return res.execution;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['runbook', variables.runbookId, 'executions'] });
    }
  });
}

// =============================================================================
// APPROVAL HOOKS
// =============================================================================

/**
 * Approve runbook (platform admin).
 */
export function useApproveRunbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runbookId: string) => {
      const res = await apiFetch<{ runbook: Runbook }>(
        `/runbooks/${runbookId}/approve`,
        { method: 'POST' }
      );
      return res.runbook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      queryClient.invalidateQueries({ queryKey: ['runbook', data.id] });
    }
  });
}

/**
 * Deprecate runbook (platform admin).
 */
export function useDeprecateRunbook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ runbookId, reason }: { runbookId: string; reason?: string }) => {
      const res = await apiFetch<{ runbook: Runbook }>(
        `/runbooks/${runbookId}/deprecate`,
        {
          method: 'POST',
          body: JSON.stringify({ reason })
        }
      );
      return res.runbook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['runbooks'] });
      queryClient.invalidateQueries({ queryKey: ['runbook', data.id] });
    }
  });
}
