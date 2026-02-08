import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  Service,
  ServiceStatus,
  CreateServiceInput,
  UpdateServiceInput,
  UpdateServiceStatusInput,
  ServiceListResponse,
  ServiceResponse
} from '@/types/service';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch services with optional filters (SVC-04)
 */
export function useServices(params?: {
  teamId?: string;
  status?: ServiceStatus;
  search?: string;
}) {
  return useQuery({
    queryKey: ['services', params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params?.teamId) query.set('teamId', params.teamId);
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      const queryString = query.toString();
      const response = await apiFetch<ServiceListResponse>(
        `/services${queryString ? `?${queryString}` : ''}`
      );
      return response;
    }
  });
}

/**
 * Fetch a single service by ID
 */
export function useService(id: string | undefined) {
  return useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const response = await apiFetch<ServiceResponse>(`/services/${id}`);
      return response.service;
    },
    enabled: !!id
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new service (SVC-01)
 */
export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServiceInput) =>
      apiFetch<ServiceResponse>('/services', {
        method: 'POST',
        body: JSON.stringify(data)
      }).then(res => res.service),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}

/**
 * Update service metadata (SVC-02)
 */
export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServiceInput }) =>
      apiFetch<ServiceResponse>(`/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }).then(res => res.service),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['service', id] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}

/**
 * Update service status (SVC-03: archive/deprecate)
 */
export function useUpdateServiceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServiceStatusInput }) =>
      apiFetch<ServiceResponse>(`/services/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }).then(res => res.service),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['service', id] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

export type {
  Service,
  ServiceStatus,
  CreateServiceInput,
  UpdateServiceInput,
  UpdateServiceStatusInput
} from '@/types/service';
