import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { PostmortemTimelineEvent } from '@/types/postmortem';
import {
  AlertCircle,
  Clock,
  CheckCircle,
  MessageSquare,
  ArrowUpRight,
} from 'lucide-react';

interface PostmortemTimelineProps {
  events: PostmortemTimelineEvent[];
  isLoading?: boolean;
}

// Map action to icon and color
function getEventIconAndColor(action: string): {
  Icon: typeof AlertCircle;
  bgColor: string;
  textColor: string;
} {
  const actionLower = action.toLowerCase();

  if (actionLower.includes('created') || actionLower.includes('triggered')) {
    return { Icon: AlertCircle, bgColor: 'bg-red-100', textColor: 'text-red-600' };
  }
  if (actionLower.includes('acknowledged')) {
    return { Icon: Clock, bgColor: 'bg-yellow-100', textColor: 'text-yellow-600' };
  }
  if (actionLower.includes('resolved') || actionLower.includes('closed')) {
    return { Icon: CheckCircle, bgColor: 'bg-green-100', textColor: 'text-green-600' };
  }
  if (actionLower.includes('note')) {
    return { Icon: MessageSquare, bgColor: 'bg-blue-100', textColor: 'text-blue-600' };
  }
  if (actionLower.includes('escalated')) {
    return { Icon: ArrowUpRight, bgColor: 'bg-orange-100', textColor: 'text-orange-600' };
  }

  // Default
  return { Icon: Clock, bgColor: 'bg-gray-100', textColor: 'text-gray-600' };
}

// Format action string: 'incident.created' -> 'Incident Created'
function formatAction(action: string): string {
  return action
    .split('.')
    .map((part) =>
      part
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    )
    .join(' ');
}

// Get last 8 chars of incident ID for multi-incident context
function getIncidentSuffix(incidentId: string): string {
  return incidentId.slice(-8);
}

export function PostmortemTimeline({ events, isLoading }: PostmortemTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-16 w-0.5 mt-2" />
            </div>
            <div className="flex-1 pb-6">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No timeline events found</p>
        <p className="text-sm">Events from linked incidents will appear here</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {events.map((event, index) => {
        const { Icon, bgColor, textColor } = getEventIconAndColor(event.action);
        const isLast = index === events.length - 1;
        const noteContent = event.metadata?.note as string | undefined;
        const userName = event.user
          ? `${event.user.firstName} ${event.user.lastName}`
          : 'System';

        return (
          <div key={event.id} className="flex gap-4">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-full',
                  bgColor,
                  textColor
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 min-h-[24px] bg-gray-200" />
              )}
            </div>

            {/* Event content */}
            <div className={cn('flex-1', !isLast && 'pb-6')}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {formatAction(event.action)}
                </span>
                <span className="text-xs text-muted-foreground">
                  by {userName}
                </span>
                <span
                  className="text-xs text-muted-foreground"
                  title={format(new Date(event.timestamp), 'PPpp')}
                >
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </span>
              </div>

              {/* Incident ID suffix for multi-incident context */}
              <div className="text-xs text-muted-foreground mt-0.5">
                Incident ...{getIncidentSuffix(event.incidentId)}
              </div>

              {/* Note content */}
              {noteContent && (
                <div className="mt-2 p-3 bg-blue-50 rounded-md border border-blue-100">
                  <p className="text-sm text-blue-900 whitespace-pre-wrap">
                    {noteContent}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
