/**
 * VersionHistory - Workflow version history with rollback
 *
 * Per user decision: full version history tracking with rollback capability
 *
 * Features:
 * - List of all versions with timestamps
 * - Changed by (user name)
 * - Change notes
 * - Rollback button for previous versions
 * - Current version highlighting
 * - Rollback confirmation dialog
 */

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  History,
  RotateCcw,
  User,
  Clock,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useWorkflowVersions, useRollbackWorkflow } from '@/hooks/useWorkflows';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { WorkflowVersion } from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface VersionHistoryProps {
  workflowId: string;
  currentVersion: number;
  onRollback: (version: number) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface VersionHistoryDialogProps {
  workflowId: string;
  currentVersion: number;
  isOpen: boolean;
  onClose: () => void;
}

// =============================================================================
// VERSION ITEM
// =============================================================================

interface VersionItemProps {
  version: WorkflowVersion;
  isCurrent: boolean;
  onRollback: () => void;
  isRollingBack: boolean;
}

function VersionItem({
  version,
  isCurrent,
  onRollback,
  isRollingBack,
}: VersionItemProps) {
  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-colors',
        isCurrent ? 'bg-primary/5 border-primary' : 'bg-card hover:bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Version header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">Version {version.version}</span>
            {isCurrent && (
              <Badge variant="default" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Current
              </Badge>
            )}
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span title={format(new Date(version.createdAt), 'PPpp')}>
              {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
            </span>
          </div>

          {/* Changed by */}
          {version.changedById && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <User className="h-3.5 w-3.5" />
              <span>Changed by {version.changedById}</span>
            </div>
          )}

          {/* Change note */}
          {version.changeNote && (
            <div className="flex items-start gap-1 text-sm mt-2 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span className="italic">{version.changeNote}</span>
            </div>
          )}
        </div>

        {/* Rollback button - only for non-current versions */}
        {!isCurrent && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRollback}
            disabled={isRollingBack}
          >
            {isRollingBack ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-1" />
            )}
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// VERSION LIST (inline component)
// =============================================================================

export function VersionHistory({
  workflowId,
  currentVersion,
  onRollback,
}: VersionHistoryProps) {
  const { data: versionsData, isLoading, error } = useWorkflowVersions(workflowId);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const versions = versionsData?.versions || [];

  const handleRollback = async () => {
    if (rollbackTarget === null) return;
    setIsRollingBack(true);
    try {
      await onRollback(rollbackTarget);
    } finally {
      setIsRollingBack(false);
      setRollbackTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>Failed to load version history</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No version history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <History className="h-4 w-4" />
        <span className="text-sm">{versions.length} versions</span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {versions.map((version) => (
          <VersionItem
            key={version.id}
            version={version}
            isCurrent={version.version === currentVersion}
            onRollback={() => setRollbackTarget(version.version)}
            isRollingBack={isRollingBack && rollbackTarget === version.version}
          />
        ))}
      </div>

      {/* Rollback confirmation dialog */}
      <AlertDialog
        open={rollbackTarget !== null}
        onOpenChange={() => setRollbackTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version based on Version {rollbackTarget}.
              The current workflow definition will be replaced with the selected
              version's definition. Any in-flight executions will complete with
              their original version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback} disabled={isRollingBack}>
              {isRollingBack ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Restore Version {rollbackTarget}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// VERSION HISTORY DIALOG
// =============================================================================

export function VersionHistoryDialog({
  workflowId,
  currentVersion,
  isOpen,
  onClose,
}: VersionHistoryDialogProps) {
  const rollbackWorkflow = useRollbackWorkflow();

  const handleRollback = async (version: number) => {
    await rollbackWorkflow.mutateAsync({ id: workflowId, toVersion: version });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of this workflow.
          </DialogDescription>
        </DialogHeader>

        <VersionHistory
          workflowId={workflowId}
          currentVersion={currentVersion}
          onRollback={handleRollback}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
