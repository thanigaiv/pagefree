import { useState, useMemo } from 'react';
import { useIncidents } from '@/hooks/useIncidents';
import { useUrlState } from '@/hooks/useUrlState';
import { useWebSocket } from '@/hooks/useWebSocket';
import { IncidentList } from '@/components/IncidentList';
import { IncidentFilters } from '@/components/IncidentFilters';
import { MetricsSummary } from '@/components/MetricsSummary';
import { Pagination } from '@/components/Pagination';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { BulkActions } from '@/components/BulkActions';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const { filters, updateFilters, clearFilters } = useUrlState();
  const { data, isLoading, error, refetch, isFetching } = useIncidents(filters);
  const { connectionState, reconnectAttempt } = useWebSocket();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Calculate metrics from current data
  const metrics = useMemo(() => {
    if (!data?.incidents) return undefined;

    return {
      open: data.incidents.filter((i) => i.status === 'OPEN').length,
      acknowledged: data.incidents.filter((i) => i.status === 'ACKNOWLEDGED').length,
      critical: data.incidents.filter(
        (i) => i.priority === 'CRITICAL' && ['OPEN', 'ACKNOWLEDGED'].includes(i.status)
      ).length,
      total: data.incidents.length,
    };
  }, [data?.incidents]);

  const handleSelectIncident = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected && data?.incidents) {
      setSelectedIds(new Set(data.incidents.map((i) => i.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handlePageChange = (page: number) => {
    updateFilters({ page });
    setExpandedId(null);
  };

  const currentPage = filters.page || 1;
  const hasNextPage = data?.nextCursor !== null;
  const hasPrevPage = currentPage > 1;

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      {/* Connection status banner */}
      <ConnectionStatus state={connectionState} reconnectAttempt={reconnectAttempt} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-muted-foreground">
            Manage and respond to active incidents
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Metrics summary (per user decision) */}
      <div className="mb-6">
        <MetricsSummary metrics={metrics} isLoading={isLoading} />
      </div>

      {/* Filters */}
      <div className="mb-4">
        <IncidentFilters
          filters={filters}
          onUpdateFilters={updateFilters}
          onClearFilters={clearFilters}
        />
      </div>

      {/* Bulk actions */}
      <div className="mb-4">
        <BulkActions
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      </div>

      {/* Incident list */}
      <IncidentList
        incidents={data?.incidents || []}
        isLoading={isLoading}
        error={error}
        selectedIds={selectedIds}
        expandedId={expandedId}
        onSelectIncident={handleSelectIncident}
        onSelectAll={handleSelectAll}
        onExpandIncident={setExpandedId}
      />

      {/* Pagination (per user decision: pagination not infinite scroll) */}
      {data?.incidents && data.incidents.length > 0 && (
        <Pagination
          currentPage={currentPage}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
