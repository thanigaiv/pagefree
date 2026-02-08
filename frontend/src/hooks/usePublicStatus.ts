import { useQuery } from '@tanstack/react-query';

interface PublicStatusPage {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  overallStatus: string;
  components: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    statusUpdatedAt: string;
    displayOrder: number;
  }>;
  updatedAt: string;
}

interface StatusHistory {
  history: Array<{
    id: string;
    title: string;
    message: string | null;
    severity: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
    affectedComponentIds: string[];
    updates: Array<{ timestamp: string; status: string; message: string }>;
  }>;
}

export function usePublicStatusPage(slug: string, token?: string) {
  return useQuery({
    queryKey: ['public-status', slug, token],
    queryFn: async () => {
      const params = token ? `?token=${token}` : '';
      const res = await fetch(`/status/${slug}${params}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Status page not found');
        if (res.status === 401) throw new Error('Access denied - invalid token');
        throw new Error('Failed to load status page');
      }
      return res.json() as Promise<PublicStatusPage>;
    },
    enabled: !!slug,
  });
}

export function useStatusHistory(slug: string, token?: string, days: number = 7) {
  return useQuery({
    queryKey: ['status-history', slug, token, days],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      params.set('days', String(days));
      const res = await fetch(`/status/${slug}/history?${params}`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json() as Promise<StatusHistory>;
    },
    enabled: !!slug,
  });
}
