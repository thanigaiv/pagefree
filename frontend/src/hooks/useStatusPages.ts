import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface StatusPage {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  isPublic: boolean;
  accessToken?: string; // Only returned on create
  teamId: string;
  team: { id: string; name: string };
  components: StatusPageComponent[];
  createdAt: string;
}

export interface StatusPageComponent {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  currentStatus: string;
  statusUpdatedAt: string;
  teamId: string | null;
  serviceIdentifier: string | null;
}

export interface CreateStatusPageInput {
  name: string;
  description?: string;
  teamId: string;
  isPublic?: boolean;
}

export interface CreateComponentInput {
  name: string;
  description?: string;
  teamId?: string;
  serviceIdentifier?: string;
}

export function useStatusPages(teamId?: string) {
  return useQuery({
    queryKey: ['status-pages', teamId],
    queryFn: async () => {
      console.log('[useStatusPages] Fetching status pages, teamId:', teamId);
      const params = teamId ? `?teamId=${teamId}` : '';
      const response = await apiFetch<{ statusPages: StatusPage[] }>(`/status-pages${params}`);
      console.log('[useStatusPages] Response:', response);
      return response.statusPages;
    }
  });
}

export function useStatusPage(id: string) {
  return useQuery({
    queryKey: ['status-page', id],
    queryFn: async () => {
      const response = await apiFetch<{ statusPage: StatusPage }>(`/status-pages/${id}`);
      return response.statusPage;
    },
    enabled: !!id
  });
}

export function useCreateStatusPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateStatusPageInput) => {
      const response = await apiFetch<{ statusPage: StatusPage }>('/status-pages', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return response.statusPage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    }
  });
}

export function useUpdateStatusPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<StatusPage> }) => {
      const response = await apiFetch<{ statusPage: StatusPage }>(`/status-pages/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      return response.statusPage;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['status-page', id] });
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    }
  });
}

export function useDeleteStatusPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/status-pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    }
  });
}

export function useCreateComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ statusPageId, data }: { statusPageId: string; data: CreateComponentInput }) => {
      const response = await apiFetch<{ component: StatusPageComponent }>(`/status-pages/${statusPageId}/components`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return response.component;
    },
    onSuccess: (_, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: ['status-page', statusPageId] });
    }
  });
}
