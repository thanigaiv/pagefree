import type { Incident } from '@/types/incident';
import { IncidentRow } from './IncidentRow';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

interface IncidentListProps {
  incidents: Incident[];
  isLoading: boolean;
  error?: Error | null;
  selectedIds: Set<string>;
  expandedId: string | null;
  onSelectIncident: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onExpandIncident: (id: string | null) => void;
}

export function IncidentList({
  incidents,
  isLoading,
  error,
  selectedIds,
  expandedId,
  onSelectIncident,
  onSelectAll,
  onExpandIncident,
}: IncidentListProps) {
  // Loading state with skeletons (per user decision)
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-medium">Failed to load incidents</h3>
        <p className="text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  // Empty state (per user decision: positive message)
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-lg font-medium">All clear!</h3>
        <p className="text-muted-foreground">No active incidents</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk select header */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-2 bg-muted rounded">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectAll(false)}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Incident rows */}
      {incidents.map((incident) => (
        <IncidentRow
          key={incident.id}
          incident={incident}
          isSelected={selectedIds.has(incident.id)}
          isExpanded={expandedId === incident.id}
          onSelect={(selected) => onSelectIncident(incident.id, selected)}
          onToggleExpand={() =>
            onExpandIncident(expandedId === incident.id ? null : incident.id)
          }
        />
      ))}
    </div>
  );
}
