import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { Incident, IncidentListResponse } from '../types/incident';
import type { IncidentFilters } from './useUrlState';

const PAGE_SIZE = 20; // Per user decision: 10-20 per page

export function useIncidents(filters: IncidentFilters) {
  return useQuery({
    queryKey: ['incidents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.status?.length) {
        params.set('status', filters.status.join(','));
      }
      if (filters.priority?.length) {
        params.set('priority', filters.priority.join(','));
      }
      if (filters.teamId) {
        params.set('teamId', filters.teamId);
      }
      if (filters.assignedUserId) {
        params.set('assignedUserId', filters.assignedUserId);
      }
      params.set('limit', String(PAGE_SIZE));

      // Simple offset pagination (page * limit)
      if (filters.page && filters.page > 1) {
        // For cursor-based, we'd need to track cursors
        // For now, using offset approach
        params.set('offset', String((filters.page - 1) * PAGE_SIZE));
      }

      const response = await apiFetch<IncidentListResponse>(
        `/incidents?${params.toString()}`
      );

      return response;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useIncidentById(id: string | undefined) {
  return useQuery({
    queryKey: ['incidents', id],
    queryFn: async () => {
      if (!id) throw new Error('No incident ID');
      const response = await apiFetch<{ incident: Incident }>(
        `/incidents/${id}`
      );
      return response.incident;
    },
    enabled: !!id,
  });
}

// Count queries for metrics
export function useIncidentCounts() {
  return useQuery({
    queryKey: ['incidents', 'counts'],
    queryFn: async () => {
      // Fetch minimal data for counts
      const [open, acked, critical] = await Promise.all([
        apiFetch<IncidentListResponse>('/incidents?status=OPEN&limit=1'),
        apiFetch<IncidentListResponse>('/incidents?status=ACKNOWLEDGED&limit=1'),
        apiFetch<IncidentListResponse>('/incidents?priority=CRITICAL&status=OPEN,ACKNOWLEDGED&limit=1'),
      ]);

      // Note: Backend should ideally provide count endpoint
      // This is a workaround using limit=1 to check existence
      return {
        open: open.incidents.length > 0,
        acknowledged: acked.incidents.length > 0,
        critical: critical.incidents.length > 0,
      };
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
