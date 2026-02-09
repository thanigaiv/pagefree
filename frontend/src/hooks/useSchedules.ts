/**
 * Schedule React Query Hooks
 *
 * Provides data fetching and mutations for schedule operations,
 * including overrides and shift swaps.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface Schedule {
  id: string;
  teamId: string;
  team: { id: string; name: string };
  name: string;
  description: string | null;
  timezone: string;
  startDate: string;
  endDate: string | null;
  handoffTime: string;
  rotationType: 'daily' | 'weekly' | 'custom';
  rotationIntervalDays: number;
  rotationUserIds: string[];
  isActive: boolean;
  layers?: ScheduleLayer[];
  _count?: { overrides: number };
}

export interface ScheduleLayer {
  id: string;
  scheduleId: string;
  name: string;
  priority: number;
  timezone: string;
  startDate: string;
  endDate: string | null;
  handoffTime: string;
  recurrenceRule: string;
  rotationUserIds: string[];
  restrictions: { daysOfWeek?: string[] } | null;
  isActive: boolean;
}

export interface ScheduleOverride {
  id: string;
  scheduleId: string;
  userId: string;
  originalUserId: string | null;
  startTime: string;
  endTime: string;
  reason: string | null;
  overrideType: 'OVERRIDE' | 'SWAP';
  createdById: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  originalUser?: { id: string; firstName: string; lastName: string; email: string } | null;
  createdBy: { id: string; firstName: string; lastName: string };
}

export interface ScheduleFilters {
  teamId?: string;
  isActive?: boolean;
}

export interface CreateOverrideInput {
  userId: string;
  startTime: string; // ISO datetime
  endTime: string;
  reason?: string;
}

export interface CreateSwapInput {
  originalUserId: string;
  newUserId: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface OverrideQuery {
  startAfter?: string;
  endBefore?: string;
}

// =============================================================================
// LIST AND GET HOOKS
// =============================================================================

/**
 * Fetch schedules with optional filters.
 */
export function useSchedules(filters: ScheduleFilters = {}) {
  const { teamId, isActive } = filters;

  return useQuery({
    queryKey: ['schedules', { teamId, isActive }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (isActive !== undefined) params.append('isActive', String(isActive));

      const queryString = params.toString();
      const endpoint = queryString ? `/schedules?${queryString}` : '/schedules';
      const res = await apiFetch<Schedule[]>(endpoint);
      return res;
    },
  });
}

/**
 * Fetch single schedule by ID with layers and override count.
 */
export function useSchedule(id: string | undefined) {
  return useQuery({
    queryKey: ['schedule', id],
    queryFn: async () => {
      const res = await apiFetch<Schedule>(`/schedules/${id}`);
      return res;
    },
    enabled: !!id,
  });
}

/**
 * Fetch overrides for a schedule with optional time range filter.
 */
export function useScheduleOverrides(
  scheduleId: string | undefined,
  query: OverrideQuery = {}
) {
  const { startAfter, endBefore } = query;

  return useQuery({
    queryKey: ['schedule', scheduleId, 'overrides', { startAfter, endBefore }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startAfter) params.append('startAfter', startAfter);
      if (endBefore) params.append('endBefore', endBefore);

      const queryString = params.toString();
      const endpoint = queryString
        ? `/schedules/${scheduleId}/overrides?${queryString}`
        : `/schedules/${scheduleId}/overrides`;
      const res = await apiFetch<ScheduleOverride[]>(endpoint);
      return res;
    },
    enabled: !!scheduleId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create override mutation.
 */
export function useCreateOverride(scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOverrideInput) => {
      const res = await apiFetch<ScheduleOverride>(
        `/schedules/${scheduleId}/overrides`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] });
      queryClient.invalidateQueries({
        queryKey: ['schedule', scheduleId, 'overrides'],
      });
    },
  });
}

/**
 * Create swap mutation.
 */
export function useCreateSwap(scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSwapInput) => {
      const res = await apiFetch<ScheduleOverride>(
        `/schedules/${scheduleId}/swaps`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] });
      queryClient.invalidateQueries({
        queryKey: ['schedule', scheduleId, 'overrides'],
      });
    },
  });
}

/**
 * Delete override mutation.
 */
export function useDeleteOverride(scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (overrideId: string) => {
      await apiFetch(`/schedules/${scheduleId}/overrides/${overrideId}`, {
        method: 'DELETE',
      });
      return overrideId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', scheduleId] });
      queryClient.invalidateQueries({
        queryKey: ['schedule', scheduleId, 'overrides'],
      });
    },
  });
}
