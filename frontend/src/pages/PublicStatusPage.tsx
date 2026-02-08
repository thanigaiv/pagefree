import { useParams, useSearchParams } from 'react-router-dom';
import { usePublicStatusPage, useStatusHistory } from '@/hooks/usePublicStatus';
import { ComponentStatusBadge } from '@/components/ComponentStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { ReactNode } from 'react';

const STATUS_ICONS: Record<string, ReactNode> = {
  OPERATIONAL: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  DEGRADED_PERFORMANCE: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  PARTIAL_OUTAGE: <AlertCircle className="h-5 w-5 text-orange-500" />,
  MAJOR_OUTAGE: <AlertCircle className="h-5 w-5 text-red-500" />,
  UNDER_MAINTENANCE: <Clock className="h-5 w-5 text-blue-500" />,
};

export function PublicStatusPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || undefined;

  const { data: statusPage, isLoading, error } = usePublicStatusPage(slug!, token);
  const { data: historyData } = useStatusHistory(slug!, token, 7);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to Load Status</h2>
            <p className="text-muted-foreground">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!statusPage) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{statusPage.name}</h1>
              {statusPage.description && (
                <p className="text-muted-foreground mt-1">{statusPage.description}</p>
              )}
            </div>
            <ComponentStatusBadge status={statusPage.overallStatus} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Overall Status Banner */}
        <Card className="mb-8">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              {STATUS_ICONS[statusPage.overallStatus]}
              <div>
                <p className="font-medium text-lg">
                  {statusPage.overallStatus === 'OPERATIONAL'
                    ? 'All Systems Operational'
                    : statusPage.overallStatus === 'UNDER_MAINTENANCE'
                    ? 'Scheduled Maintenance in Progress'
                    : 'Some Systems Are Experiencing Issues'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Last updated {formatDistanceToNow(new Date(statusPage.updatedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Components */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {statusPage.components.map(component => (
              <div key={component.id} className="py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{component.name}</p>
                  {component.description && (
                    <p className="text-sm text-muted-foreground">{component.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {STATUS_ICONS[component.status]}
                  <span className="text-sm">{component.status.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
            {statusPage.components.length === 0 && (
              <p className="py-4 text-muted-foreground text-center">No components configured</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Incidents */}
        {historyData && historyData.history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past Incidents (7 days)</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {historyData.history.map(incident => (
                <div key={incident.id} className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">{incident.title}</p>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(incident.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {incident.message && (
                    <p className="text-sm text-muted-foreground">{incident.message}</p>
                  )}
                  {incident.updates.length > 0 && (
                    <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-2">
                      {incident.updates.slice(-3).map((update, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{update.status}</span>
                          <span className="text-muted-foreground"> - {update.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Powered by PageFree
        </div>
      </footer>
    </div>
  );
}
