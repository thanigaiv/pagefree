import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface TeamMember {
  userId: string;
  role: 'TEAM_ADMIN' | 'RESPONDER' | 'OBSERVER';
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
}

export interface TeamWithMembers extends Team {
  members: TeamMember[];
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await apiFetch<{ teams: Team[]; total: number }>('/teams');
      return response.teams;
    },
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

export function useTeamWithMembers(id: string | undefined) {
  return useQuery({
    queryKey: ['teams', id, 'members'],
    queryFn: () => apiFetch<TeamWithMembers>(`/teams/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
