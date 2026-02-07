import { useSearchParams } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import queryString from 'query-string';

export interface IncidentFilters {
  status?: string[];
  priority?: string[];
  teamId?: string;
  assignedUserId?: string;
  sort?: string;
  page?: number;
}

export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<IncidentFilters>(() => {
    const parsed = queryString.parse(searchParams.toString(), {
      arrayFormat: 'bracket',
    });

    return {
      status: Array.isArray(parsed.status)
        ? parsed.status as string[]
        : parsed.status
        ? [parsed.status as string]
        : undefined,
      priority: Array.isArray(parsed.priority)
        ? parsed.priority as string[]
        : parsed.priority
        ? [parsed.priority as string]
        : undefined,
      teamId: parsed.teamId as string | undefined,
      assignedUserId: parsed.assignedUserId as string | undefined,
      sort: (parsed.sort as string) || 'newest',
      page: parsed.page ? parseInt(parsed.page as string, 10) : 1,
    };
  }, [searchParams]);

  const updateFilters = useCallback(
    (newFilters: Partial<IncidentFilters>) => {
      const merged = { ...filters, ...newFilters };

      // Remove empty values
      const cleaned = Object.fromEntries(
        Object.entries(merged).filter(([_, v]) => {
          if (Array.isArray(v)) return v.length > 0;
          if (v === undefined || v === null) return false;
          if (v === 1 && _ === 'page') return false; // Don't include page=1
          return true;
        })
      );

      setSearchParams(
        queryString.stringify(cleaned, { arrayFormat: 'bracket' })
      );
    },
    [filters, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return { filters, updateFilters, clearFilters };
}
