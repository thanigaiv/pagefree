import { useParams, Link } from 'react-router-dom';
import { useIncidentById } from '@/hooks/useIncidents';
import { usePWA } from '@/hooks/usePWA';
import { IncidentDetail } from '@/components/IncidentDetail';
import { PriorityBadge } from '@/components/ui/priority-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: incident, isLoading, error } = useIncidentById(id);
  const { promptAfterAcknowledge } = usePWA();

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-medium">Incident not found</h3>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'The incident could not be loaded'}
          </p>
          <Button asChild>
            <Link to="/incidents">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Incidents
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/incidents"
          className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Incidents
        </Link>

        <div className="flex items-center gap-3 mt-2">
          <PriorityBadge priority={incident.priority} />
          <h1 className="text-xl font-bold">
            {incident.title || incident.fingerprint}
          </h1>
          <span className="text-muted-foreground">
            #{incident.id.slice(-6)}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span
            className={`text-xs font-medium px-2 py-1 rounded ${
              incident.status === 'OPEN'
                ? 'bg-red-100 text-red-700'
                : incident.status === 'ACKNOWLEDGED'
                ? 'bg-yellow-100 text-yellow-700'
                : incident.status === 'RESOLVED'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {incident.status}
          </span>
          <span className="text-sm text-muted-foreground">
            {incident.assignedUser
              ? `Assigned to ${incident.assignedUser.firstName} ${incident.assignedUser.lastName}`
              : 'Unassigned'}
          </span>
        </div>
      </div>

      {/* Detail content */}
      <IncidentDetail incident={incident} onAcknowledgeSuccess={promptAfterAcknowledge} />
    </div>
  );
}
