import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TimelineEvent } from '@/types/incident';
import { TimelineEventCard } from './TimelineEvent';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';

interface IncidentTimelineProps {
  events: TimelineEvent[];
  isLoading?: boolean;
}

export function IncidentTimeline({ events, isLoading }: IncidentTimelineProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated row height
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
  if (events.length < 20) {
    return (
      <div className="space-y-3">
        {events.map((event) => (
          <TimelineEventCard key={event.id} event={event} />
        ))}
      </div>
    );
  }

  // Virtualized list for 50+ events (per user decision)
  return (
    <div
      ref={parentRef}
      className="h-[500px] overflow-auto"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const event = events[virtualRow.index];

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
                <TimelineEventCard event={event} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
