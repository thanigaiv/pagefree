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
      const params = teamId ? `?teamId=${teamId}` : '';
      return apiFetch<StatusPage[]>(`/status-pages${params}`);
    }
  });
}

export function useStatusPage(id: string) {
  return useQuery({
    queryKey: ['status-page', id],
    queryFn: () => apiFetch<StatusPage>(`/status-pages/${id}`),
    enabled: !!id
  });
}

export function useCreateStatusPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStatusPageInput) =>
      apiFetch<StatusPage>('/status-pages', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status-pages'] });
    }
  });
}

export function useUpdateStatusPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StatusPage> }) =>
      apiFetch<StatusPage>(`/status-pages/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
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
    mutationFn: ({ statusPageId, data }: { statusPageId: string; data: CreateComponentInput }) =>
      apiFetch<StatusPageComponent>(`/status-pages/${statusPageId}/components`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: (_, { statusPageId }) => {
      queryClient.invalidateQueries({ queryKey: ['status-page', statusPageId] });
    }
  });
}
