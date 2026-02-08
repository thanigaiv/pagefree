import { formatDistanceToNow } from 'date-fns';
import type { Incident } from '@/types/incident';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PriorityBadge, getPriorityBorderClass } from '@/components/ui/priority-badge';
import { IncidentActions } from './IncidentActions';
import { IncidentDetail } from './IncidentDetail';
import { SwipeableRow } from './SwipeableRow';
import { useAcknowledgeIncident } from '@/hooks/useIncidentMutations';
import { usePWA } from '@/hooks/usePWA';
import { cn } from '@/lib/utils';
import { ChevronDown, User } from 'lucide-react';

interface IncidentRowProps {
  incident: Incident;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (selected: boolean) => void;
  onToggleExpand: () => void;
  onShowOptions?: () => void;
}

export function IncidentRow({
  incident,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onShowOptions,
}: IncidentRowProps) {
  const acknowledgeMutation = useAcknowledgeIncident();
  const { promptAfterAcknowledge } = usePWA();

  const service = incident.metadata?.service as string || incident.team.name;
  const borderClass = getPriorityBorderClass(incident.priority);

  const handleSwipeAcknowledge = () => {
    if (incident.status === 'OPEN') {
      acknowledgeMutation.mutate(
        { incidentId: incident.id },
        {
          onSuccess: () => {
            // Per locked decision: "PWA: Install prompt after first ack"
            // Trigger PWA install prompt after first successful acknowledgment
            promptAfterAcknowledge();
          },
        }
      );
    }
  };

  const handleSwipeOptions = () => {
    if (onShowOptions) {
      onShowOptions();
    } else {
      // Fallback: just expand the row to show options
      onToggleExpand();
    }
  };

  const rowContent = (
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

        {/* Action buttons for inline operations (per user decision) */}
        {!isExpanded && (
          <IncidentActions incident={incident} variant="inline" />
        )}

        {/* Expand indicator */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded content with full details (per user decision: inline expansion) */}
      {isExpanded && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>
          <IncidentDetail
            incident={incident}
            isInline={true}
            onAcknowledgeSuccess={promptAfterAcknowledge}
          />
        </div>
      )}
    </Card>
  );

  return (
    <SwipeableRow
      onSwipeRight={incident.status === 'OPEN' ? handleSwipeAcknowledge : undefined}
      onSwipeLeft={handleSwipeOptions}
      rightLabel="Acknowledge"
      leftLabel="Options"
      disabled={incident.status !== 'OPEN'}
    >
      {rowContent}
    </SwipeableRow>
  );
}
