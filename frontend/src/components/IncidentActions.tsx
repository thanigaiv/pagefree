import { useState } from 'react';
import type { Incident } from '@/types/incident';
import {
  useAcknowledgeIncident,
  useResolveIncident,
  useCloseIncident,
  useArchiveIncident,
} from '@/hooks/useIncidentMutations';
import { Button } from '@/components/ui/button';
import { ResolveDialog } from './ResolveDialog';
import { Check, CheckCheck, XCircle, Loader2, Archive } from 'lucide-react';

interface IncidentActionsProps {
  incident: Incident;
  variant?: 'inline' | 'full';
  onAcknowledgeSuccess?: () => void;
}

export function IncidentActions({
  incident,
  variant = 'inline',
  onAcknowledgeSuccess
}: IncidentActionsProps) {
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  const acknowledgeMutation = useAcknowledgeIncident({
    onSuccess: onAcknowledgeSuccess
  });
  const resolveMutation = useResolveIncident();
  const closeMutation = useCloseIncident();
  const archiveMutation = useArchiveIncident();

  const handleAcknowledge = () => {
    acknowledgeMutation.mutate({ incidentId: incident.id });
  };

  const handleResolve = (resolutionNote?: string) => {
    resolveMutation.mutate({ incidentId: incident.id, resolutionNote });
    setShowResolveDialog(false);
  };

  const handleClose = () => {
    closeMutation.mutate({ incidentId: incident.id });
  };

  const handleArchive = () => {
    archiveMutation.mutate({ incidentId: incident.id });
  };

  const isLoading =
    acknowledgeMutation.isPending ||
    resolveMutation.isPending ||
    closeMutation.isPending ||
    archiveMutation.isPending;

  // Different layouts for inline (row) vs full (detail page)
  if (variant === 'inline') {
    return (
      <>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {incident.status === 'OPEN' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAcknowledge}
              disabled={isLoading}
            >
              {acknowledgeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Ack
                </>
              )}
            </Button>
          )}
          {['OPEN', 'ACKNOWLEDGED'].includes(incident.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowResolveDialog(true)}
              disabled={isLoading}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Resolve
            </Button>
          )}
          {incident.status === 'CLOSED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleArchive}
              disabled={isLoading}
            >
              {archiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Archive className="h-4 w-4 mr-1" />
                  Archive
                </>
              )}
            </Button>
          )}
        </div>

        <ResolveDialog
          open={showResolveDialog}
          onOpenChange={setShowResolveDialog}
          onConfirm={handleResolve}
        />
      </>
    );
  }

  // Full variant for detail page
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        {incident.status === 'OPEN' && (
          <Button onClick={handleAcknowledge} disabled={isLoading}>
            {acknowledgeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Acknowledge
          </Button>
        )}
        {['OPEN', 'ACKNOWLEDGED'].includes(incident.status) && (
          <Button
            variant="outline"
            onClick={() => setShowResolveDialog(true)}
            disabled={isLoading}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Resolve
          </Button>
        )}
        {incident.status === 'RESOLVED' && (
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {closeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Close
          </Button>
        )}
        {incident.status === 'CLOSED' && (
          <Button variant="outline" onClick={handleArchive} disabled={isLoading}>
            {archiveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            Archive
          </Button>
        )}
      </div>

      <ResolveDialog
        open={showResolveDialog}
        onOpenChange={setShowResolveDialog}
        onConfirm={handleResolve}
      />
    </>
  );
}
