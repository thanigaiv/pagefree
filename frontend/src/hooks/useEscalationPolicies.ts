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
  level: number;
  delayMinutes: number;
  targets: Array<{
    type: 'USER' | 'SCHEDULE';
    userId?: string;
    scheduleId?: string;
  }>;
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
