/**
 * IncidentTimeline - Timeline display for incident events
 *
 * Features:
 * - Groups workflow execution events per user decision
 * - Virtualization for long lists (20+ events)
 * - Loading skeletons
 * - Empty state
 *
 * Per user decision: Grouped timeline entries with visual nesting
 * for workflow executions (workflow entry with collapsible action entries)
 */

import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TimelineEvent } from '@/types/incident';
import { TimelineEventCard } from './TimelineEvent';
import {
  WorkflowTimelineEntry,
  groupWorkflowEvents,
  filterNonWorkflowEvents,
  type ExecutionGroup,
} from '@/components/workflow/WorkflowTimeline';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface IncidentTimelineProps {
  events: TimelineEvent[];
  isLoading?: boolean;
}

// Combined entry type for rendering
type TimelineEntry =
  | { type: 'event'; data: TimelineEvent }
  | { type: 'workflow'; data: ExecutionGroup };

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function IncidentTimeline({ events, isLoading }: IncidentTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Group workflow events and filter non-workflow events
  // Per user decision: grouped timeline entries for workflow executions
  const { entries, workflowGroups, nonWorkflowEvents } = useMemo(() => {
    const workflowGroups = groupWorkflowEvents(events);
    const nonWorkflowEvents = filterNonWorkflowEvents(events);

    // Create combined entries array sorted by timestamp
    const entries: TimelineEntry[] = [
      ...workflowGroups.map((g) => ({
        type: 'workflow' as const,
        data: g,
      })),
      ...nonWorkflowEvents.map((e) => ({
        type: 'event' as const,
        data: e,
      })),
    ];

    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) => {
      const aTime =
        a.type === 'workflow' ? a.data.startedAt : a.data.timestamp;
      const bTime =
        b.type === 'workflow' ? b.data.startedAt : b.data.timestamp;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return { entries, workflowGroups, nonWorkflowEvents };
  }, [events]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Workflow entries are taller due to potential expansion
      const entry = entries[index];
      return entry.type === 'workflow' ? 150 : 100;
    },
    overscan: 5, // Render 5 extra items above/below viewport
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No timeline events yet</p>
      </div>
    );
  }

  // For short lists (< 20), don't virtualize
  if (entries.length < 20) {
    return (
      <div className="space-y-3">
        {entries.map((entry, idx) => {
          if (entry.type === 'workflow') {
            return (
              <WorkflowTimelineEntry
                key={`workflow-${entry.data.executionId}`}
                execution={entry.data}
              />
            );
          }
          return <TimelineEventCard key={entry.data.id} event={entry.data} />;
        })}
      </div>
    );
  }

  // Virtualized list for 20+ events (per user decision)
  return (
    <div ref={parentRef} className="h-[500px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="pb-3">
                {entry.type === 'workflow' ? (
                  <WorkflowTimelineEntry execution={entry.data} />
                ) : (
                  <TimelineEventCard event={entry.data} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
