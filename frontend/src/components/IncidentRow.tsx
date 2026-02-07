import { formatDistanceToNow } from 'date-fns';
import type { Incident } from '@/types/incident';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PriorityBadge, getPriorityBorderClass } from '@/components/ui/priority-badge';
import { cn } from '@/lib/utils';
import { ChevronDown, User } from 'lucide-react';

interface IncidentRowProps {
  incident: Incident;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (selected: boolean) => void;
  onToggleExpand: () => void;
}

export function IncidentRow({
  incident,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
}: IncidentRowProps) {
  const service = incident.metadata?.service as string || incident.team.name;
  const borderClass = getPriorityBorderClass(incident.priority);

  return (
    <Card
      className={cn(
        'border-l-4 transition-all',
        borderClass,
        isExpanded && 'ring-2 ring-blue-500',
        'hover:shadow-md cursor-pointer'
      )}
      onClick={onToggleExpand}
    >
      <div className="p-4 flex items-center gap-4">
        {/* Checkbox for bulk selection */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select incident ${incident.id}`}
        />

        {/* Priority badge */}
        <PriorityBadge priority={incident.priority} showLabel={false} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {service}
            </span>
            <span className="text-xs text-muted-foreground">
              #{incident.id.slice(-6)}
            </span>
          </div>
          <p className="text-sm font-medium truncate">
            {incident.title || incident.fingerprint}
          </p>
          {incident.description && (
            <p className="text-xs text-muted-foreground truncate">
              {incident.description}
            </p>
          )}
        </div>

        {/* Time */}
        <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
        </div>

        {/* Assignee */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-[120px]">
          <User className="h-4 w-4" />
          <span className="truncate">
            {incident.assignedUser
              ? `${incident.assignedUser.firstName} ${incident.assignedUser.lastName}`
              : 'Unassigned'}
          </span>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            'text-xs font-medium px-2 py-1 rounded',
            incident.status === 'OPEN' && 'bg-red-100 text-red-700',
            incident.status === 'ACKNOWLEDGED' && 'bg-yellow-100 text-yellow-700',
            incident.status === 'RESOLVED' && 'bg-green-100 text-green-700',
            incident.status === 'CLOSED' && 'bg-gray-100 text-gray-700'
          )}
        >
          {incident.status}
        </span>

        {/* Expand indicator */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>
    </Card>
  );
}
