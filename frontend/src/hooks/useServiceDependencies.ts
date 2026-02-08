import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ServiceDependency,
  ServiceGraph,
  DependenciesResponse,
  DependentsResponse,
  GraphResponse
} from '@/types/service';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch upstream dependencies (what this service depends on)
 */
export function useServiceDependencies(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['service-dependencies', serviceId],
    queryFn: () =>
      apiFetch<DependenciesResponse>(`/services/${serviceId}/dependencies`)
        .then(r => r.dependencies),
    enabled: !!serviceId
  });
}

/**
 * Fetch downstream dependents (what depends on this service)
 */
export function useServiceDependents(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['service-dependents', serviceId],
    queryFn: () =>
      apiFetch<DependentsResponse>(`/services/${serviceId}/dependents`)
        .then(r => r.dependents),
    enabled: !!serviceId
  });
}

/**
 * Fetch full dependency graph for visualization
 */
export function useServiceGraph(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['service-graph', serviceId],
    queryFn: () =>
      apiFetch<GraphResponse>(`/services/${serviceId}/graph`)
        .then(r => r.graph),
    enabled: !!serviceId
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Add a dependency (service depends on another service)
 */
export function useAddDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dependsOnId }: { serviceId: string; dependsOnId: string }) =>
      apiFetch(`/services/${serviceId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ dependsOnId })
      }),
    onSuccess: (_, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['service-dependencies', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-dependents'] });
      queryClient.invalidateQueries({ queryKey: ['service-graph', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
}

/**
 * Remove a dependency
 */
export function useRemoveDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ serviceId, dependsOnId }: { serviceId: string; dependsOnId: string }) =>
      apiFetch(`/services/${serviceId}/dependencies/${dependsOnId}`, {
        method: 'DELETE'
      }),
    onSuccess: (_, { serviceId }) => {
      queryClient.invalidateQueries({ queryKey: ['service-dependencies', serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-dependents'] });
      queryClient.invalidateQueries({ queryKey: ['service-graph', serviceId] });
    }
  });
}
