import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ComponentStatusBadge } from './ComponentStatusBadge';
import { Globe, Lock } from 'lucide-react';

interface StatusPageCardProps {
  statusPage: {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    isPublic: boolean;
    team: { id: string; name: string };
    components: Array<{ id: string; name: string; currentStatus: string }>;
  };
}

export function StatusPageCard({ statusPage }: StatusPageCardProps) {
  // Compute overall status (worst component status)
  const STATUS_ORDER = ['MAJOR_OUTAGE', 'PARTIAL_OUTAGE', 'DEGRADED_PERFORMANCE', 'UNDER_MAINTENANCE', 'OPERATIONAL'];
  const overallStatus = statusPage.components.reduce((worst, comp) => {
    const currentIdx = STATUS_ORDER.indexOf(comp.currentStatus);
    const worstIdx = STATUS_ORDER.indexOf(worst);
    return currentIdx < worstIdx ? comp.currentStatus : worst;
  }, 'OPERATIONAL');

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <Link to={`/status-pages/${statusPage.id}`} className="hover:underline">
              {statusPage.name}
            </Link>
          </CardTitle>
          <div className="flex items-center gap-2">
            {statusPage.isPublic ? (
              <Globe className="h-4 w-4 text-green-600" />
            ) : (
              <Lock className="h-4 w-4 text-gray-500" />
            )}
            <ComponentStatusBadge status={overallStatus} size="sm" />
          </div>
        </div>
        {statusPage.description && (
          <CardDescription>{statusPage.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Team: {statusPage.team.name}</span>
          <span>{statusPage.components.length} components</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {statusPage.components.slice(0, 3).map(comp => (
            <Badge key={comp.id} variant="outline" className="text-xs">
              {comp.name}
            </Badge>
          ))}
          {statusPage.components.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{statusPage.components.length - 3} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
