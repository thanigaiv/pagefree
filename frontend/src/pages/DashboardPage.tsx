import { useState, useMemo, useEffect } from 'react';
import { useIncidents, useCreateIncident } from '@/hooks/useIncidents';
import { useUrlState } from '@/hooks/useUrlState';
import { useWebSocket } from '@/hooks/useWebSocket';
import { usePWA } from '@/hooks/usePWA';
import { useDefaultFilters } from '@/hooks/usePreferences';
import { useTeams } from '@/hooks/useTeams';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { IncidentList } from '@/components/IncidentList';
import { IncidentFilters } from '@/components/IncidentFilters';
import { FilterPresets } from '@/components/FilterPresets';
import { MetricsSummary } from '@/components/MetricsSummary';
import { Pagination } from '@/components/Pagination';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { BulkActions } from '@/components/BulkActions';
import { InstallPrompt } from '@/components/InstallPrompt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface EscalationPolicy {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const { filters, updateFilters, clearFilters } = useUrlState();
  const { data, isLoading, error, refetch, isFetching } = useIncidents(filters);
  const { connectionState, reconnectAttempt } = useWebSocket();
  const { canInstall, showInstallPrompt } = usePWA();
  const defaultFilters = useDefaultFilters();
  const { data: teams } = useTeams();
  const { data: currentUser } = useCurrentUser();
  const createIncident = useCreateIncident();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    teamId: '',
    escalationPolicyId: '',
    priority: 'MEDIUM' as 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    assignedUserId: 'unassigned',
  });
  const [escalationPolicies, setEscalationPolicies] = useState<EscalationPolicy[]>([]);

  // Apply default filters on mount if URL has no filters
  useEffect(() => {
    // Apply default filters if URL has no filters and user has preferences
    const hasUrlFilters = filters.status?.length || filters.priority?.length;

    if (!hasUrlFilters && defaultFilters) {
      updateFilters(defaultFilters);
    }
  }, [defaultFilters]); // Only run when default filters load

  // Fetch escalation policies when team is selected
  useEffect(() => {
    if (createForm.teamId) {
      apiFetch<{ policies: EscalationPolicy[] }>(
        `/escalation-policies/teams/${createForm.teamId}`
      )
        .then((response) => setEscalationPolicies(response.policies))
        .catch(() => setEscalationPolicies([]));
    } else {
      setEscalationPolicies([]);
      setCreateForm((prev) => ({ ...prev, escalationPolicyId: '' }));
    }
  }, [createForm.teamId]);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createForm.title || !createForm.teamId || !createForm.escalationPolicyId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createIncident.mutateAsync({
        title: createForm.title,
        description: createForm.description || undefined,
        teamId: createForm.teamId,
        escalationPolicyId: createForm.escalationPolicyId,
        priority: createForm.priority,
        assignedUserId: createForm.assignedUserId === 'unassigned' ? undefined : createForm.assignedUserId,
      });

      toast.success('Incident created successfully');
      setIsCreateOpen(false);
      setCreateForm({
        title: '',
        description: '',
        teamId: '',
        escalationPolicyId: '',
        priority: 'MEDIUM',
        assignedUserId: 'unassigned',
      });
      refetch();
    } catch (err) {
      toast.error('Failed to create incident');
    }
  };

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
        <div className="flex items-center gap-2">
          <InstallPrompt canInstall={canInstall} onInstall={showInstallPrompt} />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Incident
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Incident</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateIncident} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={createForm.title}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, title: e.target.value })
                    }
                    placeholder="Brief description of the incident"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, description: e.target.value })
                    }
                    placeholder="Additional details..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="team">Team *</Label>
                  <Select
                    value={createForm.teamId}
                    onValueChange={(v) =>
                      setCreateForm({ ...createForm, teamId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams?.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createForm.teamId && (
                  <div>
                    <Label htmlFor="policy">Escalation Policy *</Label>
                    <Select
                      value={createForm.escalationPolicyId}
                      onValueChange={(v) =>
                        setCreateForm({ ...createForm, escalationPolicyId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select policy" />
                      </SelectTrigger>
                      <SelectContent>
                        {escalationPolicies.map((policy) => (
                          <SelectItem key={policy.id} value={policy.id}>
                            {policy.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="priority">Priority *</Label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(v: any) =>
                      setCreateForm({ ...createForm, priority: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INFO">Info</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="assignee">Assign To (Optional)</Label>
                  <Select
                    value={createForm.assignedUserId}
                    onValueChange={(v) =>
                      setCreateForm({ ...createForm, assignedUserId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Leave unassigned</SelectItem>
                      {currentUser && (
                        <SelectItem value={currentUser.id}>
                          {currentUser.firstName} {currentUser.lastName} (Me)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={createIncident.isPending}
                  className="w-full"
                >
                  {createIncident.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Incident
                </Button>
              </form>
            </DialogContent>
          </Dialog>
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
      </div>

      {/* Metrics summary (per user decision) */}
      <div className="mb-6">
        <MetricsSummary metrics={metrics} isLoading={isLoading} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <IncidentFilters
          filters={filters}
          onUpdateFilters={updateFilters}
          onClearFilters={clearFilters}
        />
        <FilterPresets
          currentFilters={filters}
          onApplyPreset={updateFilters}
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
