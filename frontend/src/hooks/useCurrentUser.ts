import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: 'PLATFORM_ADMIN' | 'USER' | null;
  teams: Array<{
    id: string;
    name: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
  }>;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const user = await apiFetch<CurrentUser>('/auth/me');
      return user;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false
  });
}

export function useIsPlatformAdmin() {
  const { data: user } = useCurrentUser();
  return user?.platformRole === 'PLATFORM_ADMIN';
}
