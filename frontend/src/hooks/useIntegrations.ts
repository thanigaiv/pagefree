import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Types
export interface Integration {
  id: string;
  name: string;
  type: 'datadog' | 'newrelic' | 'pagerduty' | 'generic';
  isActive: boolean;
  secretPrefix: string;
  signatureHeader: string;
  deduplicationWindowMinutes: number;
  createdAt: string;
  updatedAt: string;
  // Health stats (from backend)
  alertCount: number;
  webhookCount: number;
  lastWebhookAt: string | null;
  errorCount: number;
}

export interface WebhookDelivery {
  id: string;
  statusCode: number;
  errorMessage: string | null;
  createdAt: string;
  alertId: string | null;
}

export interface TestWebhookResult {
  success: boolean;
  alert: {
    id: string;
    title: string;
    severity: string;
  };
  incident: {
    id: string;
    isDuplicate: boolean;
  };
  validation: {
    severityMapped: string;
    serviceRouted: string;
    providerDetected: string;
  };
  autoResolveIn: string;
}

// Hooks
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await apiFetch<{ integrations: Integration[] }>('/integrations');
      return res.integrations;
    }
  });
}

export function useIntegration(id: string) {
  return useQuery({
    queryKey: ['integrations', id],
    queryFn: async () => {
      const res = await apiFetch<Integration>(`/integrations/${id}`);
      return res;
    },
    enabled: !!id
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: Partial<Pick<Integration, 'name' | 'isActive' | 'deduplicationWindowMinutes'>>
    }) => {
      const res = await apiFetch<Integration>(`/integrations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}

export function useTestIntegration() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch<TestWebhookResult>(`/integrations/${id}/test`, {
        method: 'POST'
      });
      return res;
    }
  });
}

export function useWebhookDeliveries(integrationId: string, limit: number = 10) {
  return useQuery({
    queryKey: ['integrations', integrationId, 'deliveries', limit],
    queryFn: async () => {
      const res = await apiFetch<{ deliveries: WebhookDelivery[] }>(
        `/integrations/${integrationId}/deliveries?limit=${limit}`
      );
      return res.deliveries;
    },
    enabled: !!integrationId
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      type: 'datadog' | 'newrelic' | 'pagerduty' | 'generic';
      signatureHeader?: string;
      signatureAlgorithm?: 'sha256' | 'sha512';
      signatureFormat?: 'hex' | 'base64';
      signaturePrefix?: string;
      deduplicationWindowMinutes?: number;
    }) => {
      const res = await apiFetch<Integration & { webhookSecret: string; webhook_url: string }>(
        '/integrations',
        {
          method: 'POST',
          body: JSON.stringify(data)
        }
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/integrations/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}

export function useRotateSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch<{ webhookSecret: string }>(
        `/integrations/${id}/rotate-secret`,
        {
          method: 'POST'
        }
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    }
  });
}
