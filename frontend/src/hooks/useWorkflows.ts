/**
 * Workflow API Hooks
 *
 * TanStack Query hooks for workflow CRUD operations.
 * Per user decisions: full version history, duplication, export/import,
 * template library, execution analytics.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  Workflow,
  WorkflowListParams,
  WorkflowListResponse,
  WorkflowTemplate,
  WorkflowTemplateListParams,
  WorkflowVersion,
  WorkflowAnalytics,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowDefinition,
  TemplateCategory,
} from '@/types/workflow';

// =============================================================================
// WORKFLOW CRUD
// =============================================================================

/**
 * List workflows with filters
 */
export function useWorkflows(params: WorkflowListParams = {}) {
  return useQuery({
    queryKey: ['workflows', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.teamId) searchParams.set('teamId', params.teamId);
      if (params.scopeType) searchParams.set('scopeType', params.scopeType);
      if (params.isEnabled !== undefined) searchParams.set('isEnabled', String(params.isEnabled));
      if (params.page) searchParams.set('page', String(params.page));
      if (params.limit) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      return apiFetch<WorkflowListResponse>(`/workflows${query ? `?${query}` : ''}`);
    },
  });
}

/**
 * Get single workflow with versions and execution stats
 */
export function useWorkflow(id: string | undefined) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: async () => {
      if (!id) throw new Error('Workflow ID required');
      return apiFetch<{ workflow: Workflow }>(`/workflows/${id}`);
    },
    enabled: !!id,
  });
}

/**
 * Create new workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkflowInput) => {
      return apiFetch<{ workflow: Workflow }>('/workflows', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Update workflow (creates new version on definition change)
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateWorkflowInput }) => {
      return apiFetch<{ workflow: Workflow }>(`/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}

/**
 * Delete workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<{ success: boolean }>(`/workflows/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

// =============================================================================
// WORKFLOW ACTIONS
// =============================================================================

/**
 * Duplicate workflow (per user decision)
 */
export function useDuplicateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<{ workflow: Workflow }>(`/workflows/${id}/duplicate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

/**
 * Toggle workflow enabled/disabled (per user decision)
 */
export function useToggleWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return apiFetch<{ workflow: Workflow }>(`/workflows/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
    },
    onMutate: async ({ id, enabled }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['workflow', id] });
      const previous = queryClient.getQueryData<{ workflow: Workflow }>(['workflow', id]);

      if (previous) {
        queryClient.setQueryData(['workflow', id], {
          ...previous,
          workflow: { ...previous.workflow, isEnabled: enabled },
        });
      }

      return { previous };
    },
    onError: (_, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['workflow', id], context.previous);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}

/**
 * Get version history (per user decision)
 */
export function useWorkflowVersions(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['workflow', workflowId, 'versions'],
    queryFn: async () => {
      if (!workflowId) throw new Error('Workflow ID required');
      return apiFetch<{ versions: WorkflowVersion[] }>(`/workflows/${workflowId}/versions`);
    },
    enabled: !!workflowId,
  });
}

/**
 * Rollback to previous version (per user decision)
 */
export function useRollbackWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, toVersion }: { id: string; toVersion: number }) => {
      return apiFetch<{ workflow: Workflow }>(`/workflows/${id}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ toVersion }),
      });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow', id, 'versions'] });
    },
  });
}

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

/**
 * Export workflow as JSON (per user decision)
 */
export function useExportWorkflow(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['workflow', id, 'export'],
    queryFn: async () => {
      if (!id) throw new Error('Workflow ID required');
      return apiFetch<{
        name: string;
        description: string;
        definition: WorkflowDefinition;
        scopeType: string;
        templateCategory: string | null;
        exportedAt: string;
        metadata: {
          version: number;
          teamName?: string;
        };
      }>(`/workflows/${id}/export`);
    },
    enabled: options?.enabled ?? false,
  });
}

/**
 * Import workflow from JSON (per user decision)
 */
export function useImportWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      json,
      teamId,
    }: {
      json: {
        name: string;
        description: string;
        definition: WorkflowDefinition;
        scopeType?: string;
      };
      teamId?: string;
    }) => {
      return apiFetch<{ workflow: Workflow }>('/workflows/import', {
        method: 'POST',
        body: JSON.stringify({ ...json, teamId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Get workflow execution analytics (per user decision)
 */
export function useWorkflowAnalytics(
  workflowId: string | undefined,
  options?: { days?: number; enabled?: boolean }
) {
  return useQuery({
    queryKey: ['workflow', workflowId, 'analytics', options?.days ?? 30],
    queryFn: async () => {
      if (!workflowId) throw new Error('Workflow ID required');
      const params = options?.days ? `?days=${options.days}` : '';
      return apiFetch<WorkflowAnalytics>(`/workflows/${workflowId}/analytics${params}`);
    },
    enabled: options?.enabled !== false && !!workflowId,
  });
}

// =============================================================================
// MANUAL TRIGGER
// =============================================================================

/**
 * Manually trigger workflow execution (per user decision)
 */
export function useTriggerWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workflowId, incidentId }: { workflowId: string; incidentId: string }) => {
      return apiFetch<{ executionId: string; status: string }>(`/workflows/${workflowId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      });
    },
    onSuccess: (_, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
    },
  });
}

// =============================================================================
// TEMPLATE LIBRARY
// =============================================================================

/**
 * List workflow templates (per user decision - template library)
 */
export function useWorkflowTemplates(params: WorkflowTemplateListParams = {}) {
  return useQuery({
    queryKey: ['workflow-templates', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.category) searchParams.set('category', params.category);
      if (params.search) searchParams.set('search', params.search);

      const query = searchParams.toString();
      return apiFetch<{ templates: WorkflowTemplate[]; total: number }>(
        `/workflow-templates${query ? `?${query}` : ''}`
      );
    },
  });
}

/**
 * Get template categories
 */
export function useTemplateCategories() {
  return useQuery({
    queryKey: ['workflow-templates', 'categories'],
    queryFn: async () => {
      return apiFetch<{ categories: TemplateCategory[] }>('/workflow-templates/categories/list');
    },
  });
}

/**
 * Create workflow from template (per user decision)
 */
export function useCreateFromTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      name,
      description,
      teamId,
    }: {
      templateId: string;
      name: string;
      description: string;
      teamId?: string;
    }) => {
      return apiFetch<{ workflow: Workflow }>(`/workflow-templates/${templateId}/use`, {
        method: 'POST',
        body: JSON.stringify({ name, description, teamId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}
