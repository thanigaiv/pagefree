import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch<Team[]>('/teams'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: ['teams', id],
    queryFn: () => apiFetch<Team>(`/teams/${id}`),
    enabled: !!id,
  });
}
