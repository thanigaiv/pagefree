import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Team } from './useTeams';

export interface CreateTeamInput {
  name: string;
  description?: string;
  slackChannel?: string;
  tags?: Array<{
    type: 'ORGANIZATIONAL' | 'TECHNICAL';
    value: string;
  }>;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  slackChannel?: string;
  maintenanceMode?: boolean;
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTeamInput) => {
      const response = await apiFetch<Team>('/teams', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTeamInput }) => {
      const response = await apiFetch<Team>(`/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', id] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
