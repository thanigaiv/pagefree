import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { IncidentFilters } from './useUrlState';
import { toast } from 'sonner';

interface DashboardPreferences {
  defaultFilters?: {
    status?: string[];
    priority?: string[];
    teamId?: string;
  };
  defaultSort?: string;
  pageSize?: number;
}

interface UserPreferences {
  dashboard?: DashboardPreferences;
}

// Fetch user preferences
export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: async () => {
      const response = await apiFetch<{ preferences: UserPreferences }>('/preferences');
      return response.preferences;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if not authenticated
  });
}

// Update preferences mutation
export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: Partial<UserPreferences>) => {
      const response = await apiFetch<{ preferences: UserPreferences }>(
        '/preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(preferences),
        }
      );
      return response.preferences;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['preferences'], data);
      toast.success('Preferences saved');
    },
    onError: (error) => {
      toast.error(`Failed to save preferences: ${error.message}`);
    },
  });
}

// Save current filters as default
export function useSaveFiltersAsDefault() {
  const updatePreferences = useUpdatePreferences();

  return (filters: IncidentFilters) => {
    updatePreferences.mutate({
      dashboard: {
        defaultFilters: {
          status: filters.status,
          priority: filters.priority,
          teamId: filters.teamId,
        },
        defaultSort: filters.sort,
      },
    });
  };
}

// Get default filters from preferences
export function useDefaultFilters(): IncidentFilters | null {
  const { data: preferences } = usePreferences();

  if (!preferences?.dashboard?.defaultFilters) {
    return null;
  }

  return {
    status: preferences.dashboard.defaultFilters.status,
    priority: preferences.dashboard.defaultFilters.priority,
    teamId: preferences.dashboard.defaultFilters.teamId,
    sort: preferences.dashboard.defaultSort,
  };
}
