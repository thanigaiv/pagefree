import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { TimelineEvent } from '@/types/incident';

interface TimelineResponse {
  timeline: TimelineEvent[];
}

export function useTimeline(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['incidents', incidentId, 'timeline'],
    queryFn: async () => {
      if (!incidentId) throw new Error('No incident ID');
      const response = await apiFetch<TimelineResponse>(
        `/incidents/${incidentId}/timeline`
      );
      // Return in reverse chronological order (newest first per user decision)
      return response.timeline.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },
    enabled: !!incidentId,
    staleTime: 30 * 1000,
  });
}

// Helper to categorize timeline events
export function categorizeEvent(action: string): 'note' | 'status' | 'assignment' | 'system' {
  if (action.includes('note')) return 'note';
  if (action.includes('acknowledged') || action.includes('resolved') || action.includes('closed')) {
    return 'status';
  }
  if (action.includes('assigned') || action.includes('reassigned')) return 'assignment';
  return 'system';
}

// Format action for display
export function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    'incident.created': 'Incident created',
    'incident.acknowledged': 'Acknowledged',
    'incident.resolved': 'Resolved',
    'incident.closed': 'Closed',
    'incident.reassigned': 'Reassigned',
    'incident.note.added': 'Note added',
    'incident.escalated': 'Escalated',
  };
  return actionMap[action] || action;
}
