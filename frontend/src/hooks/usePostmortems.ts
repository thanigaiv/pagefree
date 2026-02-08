import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  Postmortem,
  ActionItem,
  PostmortemTimelineEvent,
  CreatePostmortemInput,
  UpdatePostmortemInput,
  CreateActionItemInput,
  UpdateActionItemInput,
  PostmortemListResponse,
  PostmortemResponse,
  ActionItemListResponse,
  ActionItemResponse,
  PostmortemTimelineResponse,
} from '@/types/postmortem';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all postmortems with optional team filter
 */
export function usePostmortems(teamId?: string) {
  return useQuery({
    queryKey: ['postmortems', teamId],
    queryFn: async () => {
      const params = teamId ? `?teamId=${teamId}` : '';
      const response = await apiFetch<PostmortemListResponse>(`/postmortems${params}`);
      return response.postmortems;
    }
  });
}

/**
 * Fetch a single postmortem by ID (includes action items)
 */
export function usePostmortem(id: string | undefined) {
  return useQuery({
    queryKey: ['postmortem', id],
    queryFn: async () => {
      const response = await apiFetch<PostmortemResponse>(`/postmortems/${id}`);
      return response.postmortem;
    },
    enabled: !!id
  });
}

/**
 * Fetch timeline events for a postmortem
 */
export function usePostmortemTimeline(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['postmortem-timeline', id],
    queryFn: async () => {
      const response = await apiFetch<PostmortemTimelineResponse>(`/postmortems/${id}/timeline`);
      return response.timeline;
    },
    enabled: !!id && enabled,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

/**
 * Fetch current user's assigned action items
 */
export function useMyActionItems(status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED') {
  return useQuery({
    queryKey: ['my-action-items', status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const response = await apiFetch<ActionItemListResponse>(`/postmortems/me/action-items${params}`);
      return response.actionItems;
    }
  });
}

// =============================================================================
// POSTMORTEM MUTATION HOOKS
// =============================================================================

/**
 * Create a new postmortem
 */
export function useCreatePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePostmortemInput) =>
      apiFetch<PostmortemResponse>('/postmortems', {
        method: 'POST',
        body: JSON.stringify(data)
      }).then(res => res.postmortem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    }
  });
}

/**
 * Update a postmortem
 */
export function useUpdatePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePostmortemInput }) =>
      apiFetch<PostmortemResponse>(`/postmortems/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }).then(res => res.postmortem),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['postmortem', id] });
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    }
  });
}

/**
 * Delete a postmortem
 */
export function useDeletePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/postmortems/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    }
  });
}

// =============================================================================
// ACTION ITEM MUTATION HOOKS
// =============================================================================

/**
 * Create an action item on a postmortem
 */
export function useCreateActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postmortemId, data }: { postmortemId: string; data: CreateActionItemInput }) =>
      apiFetch<ActionItemResponse>(`/postmortems/${postmortemId}/action-items`, {
        method: 'POST',
        body: JSON.stringify(data)
      }).then(res => res.actionItem),
    onSuccess: (_, { postmortemId }) => {
      queryClient.invalidateQueries({ queryKey: ['postmortem', postmortemId] });
      queryClient.invalidateQueries({ queryKey: ['my-action-items'] });
    }
  });
}

/**
 * Update an action item
 */
export function useUpdateActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      postmortemId,
      itemId,
      data
    }: {
      postmortemId: string;
      itemId: string;
      data: UpdateActionItemInput;
    }) =>
      apiFetch<ActionItemResponse>(`/postmortems/${postmortemId}/action-items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }).then(res => res.actionItem),
    onSuccess: (_, { postmortemId }) => {
      queryClient.invalidateQueries({ queryKey: ['postmortem', postmortemId] });
      queryClient.invalidateQueries({ queryKey: ['my-action-items'] });
    }
  });
}

/**
 * Delete an action item
 */
export function useDeleteActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postmortemId, itemId }: { postmortemId: string; itemId: string }) =>
      apiFetch(`/postmortems/${postmortemId}/action-items/${itemId}`, { method: 'DELETE' }),
    onSuccess: (_, { postmortemId }) => {
      queryClient.invalidateQueries({ queryKey: ['postmortem', postmortemId] });
      queryClient.invalidateQueries({ queryKey: ['my-action-items'] });
    }
  });
}

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

export type {
  Postmortem,
  ActionItem,
  PostmortemTimelineEvent,
  CreatePostmortemInput,
  UpdatePostmortemInput,
  CreateActionItemInput,
  UpdateActionItemInput,
  PostmortemStatus,
  ActionItemStatus,
  ActionItemPriority,
} from '@/types/postmortem';
