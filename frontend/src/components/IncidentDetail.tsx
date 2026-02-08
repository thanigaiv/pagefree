import type { Incident } from '@/types/incident';
import { useTimeline } from '@/hooks/useTimeline';
import { IncidentTimeline } from './IncidentTimeline';
import { TechnicalDetails } from './TechnicalDetails';
import { ExternalLinks } from './ExternalLinks';
import { AddNoteForm } from './AddNoteForm';
import { MetadataEditor } from './MetadataEditor';
import { IncidentActions } from './IncidentActions';
import { useUpdateMetadata } from '@/hooks/useUpdateMetadata';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface IncidentDetailProps {
  incident: Incident;
  isInline?: boolean; // For expanded row vs full page
  onAcknowledgeSuccess?: () => void;
}

export function IncidentDetail({
  incident,
  isInline = false,
  onAcknowledgeSuccess
}: IncidentDetailProps) {
  const { data: timeline, isLoading: timelineLoading } = useTimeline(incident.id);
  const service = incident.metadata?.service as string || incident.team.name;
  const updateMetadata = useUpdateMetadata(incident.id);

  const handleMetadataUpdate = (newMetadata: Record<string, unknown>) => {
    updateMetadata.mutate({ metadata: newMetadata });
  };

  return (
    <div className={isInline ? 'p-4 bg-muted/50' : ''}>
      {/* Quick links section (per user decision) */}
      <div className="mb-4">
        <ExternalLinks service={service} metadata={incident.metadata} />
      </div>

      {/* Service routing info (Phase 13: ROUTE-03) */}
      {incident.service && (
        <div className="mb-4">
          <span className="text-sm text-muted-foreground">Service</span>
          <div className="flex items-center gap-2 mt-1">
            <Link to={`/admin/services?selected=${incident.service.id}`}>
              <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                <Server className="h-3 w-3 mr-1" />
                {incident.service.name}
              </Badge>
            </Link>
            <span className="text-xs text-muted-foreground font-mono">
              {incident.service.routingKey}
            </span>
          </div>
        </div>
      )}

      {/* Incident info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
        <div>
          <span className="text-muted-foreground">Created</span>
          <p className="font-medium">
            {format(new Date(incident.createdAt), 'PPp')}
          </p>
        </div>
        {incident.acknowledgedAt && (
          <div>
            <span className="text-muted-foreground">Acknowledged</span>
            <p className="font-medium">
              {format(new Date(incident.acknowledgedAt), 'PPp')}
            </p>
          </div>
        )}
        {incident.resolvedAt && (
          <div>
            <span className="text-muted-foreground">Resolved</span>
            <p className="font-medium">
              {format(new Date(incident.resolvedAt), 'PPp')}
            </p>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Team</span>
          <p className="font-medium">{incident.team.name}</p>
        </div>
      </div>

      {/* Description */}
      {incident.description && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">
            Description
          </h4>
          <p className="text-sm">{incident.description}</p>
        </div>
      )}

      {/* Actions */}
      <div className="mb-4">
        <IncidentActions
          incident={incident}
          variant={isInline ? 'inline' : 'full'}
          onAcknowledgeSuccess={onAcknowledgeSuccess}
        />
      </div>

      {/* Metadata editor (per user decision: inline editing) */}
      <div className="mb-4">
        <MetadataEditor
          metadata={incident.metadata || {}}
          onSave={handleMetadataUpdate}
          disabled={updateMetadata.isPending}
        />
      </div>

      <Separator className="my-4" />

      {/* Timeline (per user decision: embedded inline) */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-3">Timeline</h4>
        <IncidentTimeline
          events={timeline || []}
          isLoading={timelineLoading}
        />
      </div>

      {/* Add note form (per user decision: inline at bottom of timeline) */}
      <div className="mb-4">
        <AddNoteForm incidentId={incident.id} />
      </div>

      <Separator className="my-4" />

      {/* Technical details (per user decision: collapsible) */}
      <TechnicalDetails
        metadata={incident.metadata}
        alerts={incident.alerts}
      />
    </div>
  );
}
