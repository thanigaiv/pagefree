import { useState } from 'react';
import { useBulkAcknowledge, useBulkResolve } from '@/hooks/useIncidentMutations';
import { Button } from '@/components/ui/button';
import { ResolveDialog } from './ResolveDialog';
import { Check, CheckCheck, Loader2 } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: Set<string>;
  onClearSelection: () => void;
}

export function BulkActions({ selectedIds, onClearSelection }: BulkActionsProps) {
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  const bulkAcknowledge = useBulkAcknowledge();
  const bulkResolve = useBulkResolve();

  const count = selectedIds.size;
  const isLoading = bulkAcknowledge.isPending || bulkResolve.isPending;

  const handleBulkAcknowledge = () => {
    bulkAcknowledge.mutate(
      { incidentIds: Array.from(selectedIds) },
      { onSuccess: () => onClearSelection() }
    );
  };

  const handleBulkResolve = () => {
    bulkResolve.mutate(
      { incidentIds: Array.from(selectedIds) },
      { onSuccess: () => onClearSelection() }
    );
    setShowResolveDialog(false);
  };

  if (count === 0) return null;

  return (
    <>
      <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
        <span className="text-sm font-medium">{count} selected</span>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkAcknowledge}
            disabled={isLoading}
          >
            {bulkAcknowledge.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Acknowledge All
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResolveDialog(true)}
            disabled={isLoading}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Resolve All
          </Button>

          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      </div>

      <ResolveDialog
        open={showResolveDialog}
        onOpenChange={setShowResolveDialog}
        onConfirm={handleBulkResolve}
        incidentCount={count}
      />
    </>
  );
}
