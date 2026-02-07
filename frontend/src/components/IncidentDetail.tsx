import type { Incident } from '@/types/incident';
import { useTimeline } from '@/hooks/useTimeline';
import { IncidentTimeline } from './IncidentTimeline';
import { TechnicalDetails } from './TechnicalDetails';
import { ExternalLinks } from './ExternalLinks';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';

interface IncidentDetailProps {
  incident: Incident;
  isInline?: boolean; // For expanded row vs full page
}

export function IncidentDetail({ incident, isInline = false }: IncidentDetailProps) {
  const { data: timeline, isLoading: timelineLoading } = useTimeline(incident.id);
  const service = incident.metadata?.service as string || incident.team.name;

  return (
    <div className={isInline ? 'p-4 bg-muted/50' : ''}>
      {/* Quick links section (per user decision) */}
      <div className="mb-4">
        <ExternalLinks service={service} metadata={incident.metadata} />
      </div>

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

      <Separator className="my-4" />

      {/* Timeline (per user decision: embedded inline) */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-3">Timeline</h4>
        <IncidentTimeline
          events={timeline || []}
          isLoading={timelineLoading}
        />
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
