import { formatDistanceToNow, format } from 'date-fns';
import type { TimelineEvent as TimelineEventType } from '@/types/incident';
import { categorizeEvent, formatAction } from '@/hooks/useTimeline';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  CheckCircle,
  AlertCircle,
  UserPlus,
  ArrowRight,
} from 'lucide-react';

interface TimelineEventProps {
  event: TimelineEventType;
}

const eventIcons = {
  note: MessageSquare,
  status: CheckCircle,
  assignment: UserPlus,
  system: AlertCircle,
};

const eventColors = {
  note: 'bg-blue-100 text-blue-600 border-blue-200',
  status: 'bg-green-100 text-green-600 border-green-200',
  assignment: 'bg-purple-100 text-purple-600 border-purple-200',
  system: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function TimelineEventCard({ event }: TimelineEventProps) {
  const category = categorizeEvent(event.action);
  const Icon = eventIcons[category];
  const colorClass = eventColors[category];

  const userName = event.user
    ? `${event.user.firstName} ${event.user.lastName}`
    : 'System';

  const initials = event.user
    ? `${event.user.firstName[0]}${event.user.lastName[0]}`
    : 'SY';

  // Extract note content or resolution note from metadata
  const noteContent = event.metadata?.note as string | undefined;
  const resolutionNote = event.metadata?.resolutionNote as string | undefined;
  const displayContent = noteContent || resolutionNote;

  // Extract reassignment details
  const newAssignee = event.metadata?.newAssignee as string | undefined;
  const reason = event.metadata?.reason as string | undefined;

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg border',
        // Per user decision: different background for user notes
        category === 'note' ? 'bg-blue-50/50' : 'bg-white'
      )}
    >
      {/* Icon */}
      <div className={cn('p-2 rounded-full h-fit', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm">{userName}</span>
          <span className="text-muted-foreground text-sm">
            {formatAction(event.action)}
          </span>
        </div>

        {/* Note content (per user decision: markdown support in notes) */}
        {displayContent && (
          <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {displayContent}
          </div>
        )}

        {/* Reassignment details */}
        {newAssignee && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <ArrowRight className="h-4 w-4" />
            <span>Assigned to new user</span>
            {reason && <span className="text-muted-foreground">- {reason}</span>}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
        <div title={format(new Date(event.timestamp), 'PPpp')}>
          {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}
