import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Incident } from '@/types/incident';
import { toast } from 'sonner';

interface AcknowledgeResponse {
  incident: Incident;
}

interface ResolveResponse {
  incident: Incident;
}

// Optimistic acknowledge mutation (per user decision)
export function useAcknowledgeIncident(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      note,
    }: {
      incidentId: string;
      note?: string;
    }) => {
      const response = await apiFetch<AcknowledgeResponse>(
        `/incidents/${incidentId}/acknowledge`,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        }
      );
      return response.incident;
    },
    onMutate: async ({ incidentId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['incidents', incidentId] });
      await queryClient.cancelQueries({ queryKey: ['incidents'] });

      // Snapshot previous value
      const previousIncident = queryClient.getQueryData<{ incident: Incident }>([
        'incidents',
        incidentId,
      ]);
      const previousList = queryClient.getQueryData(['incidents']);

      // Optimistically update to acknowledged
      if (previousIncident) {
        queryClient.setQueryData(['incidents', incidentId], {
          incident: {
            ...previousIncident.incident,
            status: 'ACKNOWLEDGED',
            acknowledgedAt: new Date().toISOString(),
          },
        });
      }

      // Show optimistic success
      toast.success('Incident acknowledged');

      return { previousIncident, previousList, incidentId };
    },
    onSuccess: () => {
      // Call optional callback (for PWA install prompt)
      options?.onSuccess?.();
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousIncident) {
        queryClient.setQueryData(
          ['incidents', context.incidentId],
          context.previousIncident
        );
      }
      if (context?.previousList) {
        queryClient.setQueryData(['incidents'], context.previousList);
      }

      toast.error(`Failed to acknowledge: ${error.message}`);
    },
    onSettled: (_data, _error, { incidentId }) => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}

// Resolve mutation (not optimistic - requires confirmation per user decision)
export function useResolveIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      resolutionNote,
    }: {
      incidentId: string;
      resolutionNote?: string;
    }) => {
      const response = await apiFetch<ResolveResponse>(
        `/incidents/${incidentId}/resolve`,
        {
          method: 'POST',
          body: JSON.stringify({ resolutionNote }),
        }
      );
      return response.incident;
    },
    onSuccess: (data) => {
      toast.success('Incident resolved');
      queryClient.invalidateQueries({ queryKey: ['incidents', data.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Failed to resolve: ${error.message}`);
    },
  });
}

// Close mutation
export function useCloseIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId }: { incidentId: string }) => {
      const response = await apiFetch<ResolveResponse>(
        `/incidents/${incidentId}/close`,
        { method: 'POST' }
      );
      return response.incident;
    },
    onSuccess: (data) => {
      toast.success('Incident closed');
      queryClient.invalidateQueries({ queryKey: ['incidents', data.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Failed to close: ${error.message}`);
    },
  });
}

// Archive mutation
export function useArchiveIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId }: { incidentId: string }) => {
      const response = await apiFetch<ResolveResponse>(
        `/incidents/${incidentId}/archive`,
        { method: 'POST' }
      );
      return response.incident;
    },
    onSuccess: (data) => {
      toast.success('Incident archived');
      queryClient.invalidateQueries({ queryKey: ['incidents', data.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Failed to archive: ${error.message}`);
    },
  });
}

// Reassign mutation
export function useReassignIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      userId,
      reason,
    }: {
      incidentId: string;
      userId: string;
      reason?: string;
    }) => {
      const response = await apiFetch<ResolveResponse>(
        `/incidents/${incidentId}/reassign`,
        {
          method: 'POST',
          body: JSON.stringify({ userId, reason }),
        }
      );
      return response.incident;
    },
    onSuccess: (data) => {
      toast.success('Incident reassigned');
      queryClient.invalidateQueries({ queryKey: ['incidents', data.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Failed to reassign: ${error.message}`);
    },
  });
}

// Bulk acknowledge mutation
export function useBulkAcknowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentIds }: { incidentIds: string[] }) => {
      // Execute acknowledges in parallel
      const results = await Promise.allSettled(
        incidentIds.map((id) =>
          apiFetch<AcknowledgeResponse>(`/incidents/${id}/acknowledge`, {
            method: 'POST',
          })
        )
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return { succeeded, failed, total: incidentIds.length };
    },
    onSuccess: (data) => {
      if (data.failed === 0) {
        toast.success(`Acknowledged ${data.succeeded} incidents`);
      } else {
        toast.warning(
          `Acknowledged ${data.succeeded}/${data.total} incidents (${data.failed} failed)`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Bulk acknowledge failed: ${error.message}`);
    },
  });
}

// Bulk resolve mutation
export function useBulkResolve() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentIds }: { incidentIds: string[] }) => {
      const results = await Promise.allSettled(
        incidentIds.map((id) =>
          apiFetch<ResolveResponse>(`/incidents/${id}/resolve`, {
            method: 'POST',
          })
        )
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return { succeeded, failed, total: incidentIds.length };
    },
    onSuccess: (data) => {
      if (data.failed === 0) {
        toast.success(`Resolved ${data.succeeded} incidents`);
      } else {
        toast.warning(
          `Resolved ${data.succeeded}/${data.total} incidents (${data.failed} failed)`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => {
      toast.error(`Bulk resolve failed: ${error.message}`);
    },
  });
}
