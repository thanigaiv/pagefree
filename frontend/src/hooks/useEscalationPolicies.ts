import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface EscalationLevel {
  id: string;
  level: number;
  delayMinutes: number;
  targets: Array<{
    type: 'USER' | 'SCHEDULE';
    userId?: string;
    scheduleId?: string;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    schedule?: {
      id: string;
      name: string;
    };
  }>;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  team: {
    id: string;
    name: string;
  };
  repeatCount: number;
  levels: EscalationLevel[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEscalationPolicyInput {
  name: string;
  description?: string;
  teamId: string;
  repeatCount?: number;
}

export interface CreateLevelInput {
  levelNumber: number;
  targetType: 'user' | 'schedule' | 'entire_team';
  targetId?: string;
  timeoutMinutes?: number;
}

export interface UpdateLevelInput {
  targetType?: 'user' | 'schedule' | 'entire_team';
  targetId?: string;
  timeoutMinutes?: number;
}

export interface Schedule {
  id: string;
  name: string;
  teamId: string;
}

export function useEscalationPoliciesByTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['escalation-policies', 'team', teamId],
    queryFn: async () => {
      const response = await apiFetch<{ policies: EscalationPolicy[] }>(
        `/escalation-policies/teams/${teamId}`
      );
      return response.policies;
    },
    enabled: !!teamId,
  });
}

export function useEscalationPolicy(id: string | undefined) {
  return useQuery({
    queryKey: ['escalation-policies', id],
    queryFn: async () => {
      const response = await apiFetch<{ policy: EscalationPolicy }>(
        `/escalation-policies/${id}`
      );
      return response.policy;
    },
    enabled: !!id,
  });
}

export function useCreateEscalationPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEscalationPolicyInput) => {
      const response = await apiFetch<{ policy: EscalationPolicy }>(
        '/escalation-policies',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      return response.policy;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['escalation-policies', 'team', data.teamId],
      });
    },
  });
}

export function useDeleteEscalationPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/escalation-policies/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-policies'] });
    },
  });
}

export function useCreateEscalationLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      policyId,
      data,
    }: {
      policyId: string;
      data: CreateLevelInput;
    }) => {
      const response = await apiFetch<{ level: EscalationLevel }>(
        `/escalation-policies/${policyId}/levels`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return response.level;
    },
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({
        queryKey: ['escalation-policies', policyId],
      });
    },
  });
}

export function useDeleteEscalationLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (levelId: string) =>
      apiFetch(`/escalation-policies/levels/${levelId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-policies'] });
    },
  });
}

export function useUpdateEscalationLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      levelId,
      data,
    }: {
      levelId: string;
      data: UpdateLevelInput;
    }) => {
      const response = await apiFetch<{ level: EscalationLevel }>(
        `/escalation-policies/levels/${levelId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
      return response.level;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation-policies'] });
    },
  });
}

export function useSchedulesByTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['schedules', 'team', teamId],
    queryFn: async () => {
      const response = await apiFetch<{ schedules: Schedule[] }>(
        `/schedules?teamId=${teamId}`
      );
      return response.schedules;
    },
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
