import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePostmortems, useCreatePostmortem } from '@/hooks/usePostmortems';
import { useTeams } from '@/hooks/useTeams';
import { useIncidents } from '@/hooks/useIncidents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Plus, FileText, Clock, Users, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import type { Postmortem } from '@/types/postmortem';

export default function PostmortemsPage() {
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    incidentIds: [] as string[],
    teamId: '',
  });

  const { data: postmortems, isLoading, error } = usePostmortems(teamFilter || undefined);
  const { data: teams } = useTeams();
  const { data: incidentsData } = useIncidents({
    status: ['RESOLVED', 'CLOSED'],
    teamId: formData.teamId || undefined,
  });
  const createMutation = useCreatePostmortem();

  const resolvedIncidents = useMemo(() => {
    return incidentsData?.incidents || [];
  }, [incidentsData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!formData.teamId) {
      toast.error('Team is required');
      return;
    }
    if (formData.incidentIds.length === 0) {
      toast.error('At least one incident is required');
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: formData.title,
        incidentIds: formData.incidentIds,
        teamId: formData.teamId,
      });
      toast.success('Postmortem created');
      setIsCreateOpen(false);
      setFormData({ title: '', incidentIds: [], teamId: '' });
    } catch {
      toast.error('Failed to create postmortem');
    }
  };

  const toggleIncident = (incidentId: string) => {
    setFormData((prev) => ({
      ...prev,
      incidentIds: prev.incidentIds.includes(incidentId)
        ? prev.incidentIds.filter((id) => id !== incidentId)
        : [...prev.incidentIds, incidentId],
    }));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-500">Error loading postmortems</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Postmortems</h1>
            <p className="text-muted-foreground">
              Document and learn from incidents
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Postmortem
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Postmortem</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Postmortem title"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="team">Team</Label>
                  <Select
                    value={formData.teamId}
                    onValueChange={(v) =>
                      setFormData({ ...formData, teamId: v, incidentIds: [] })
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
                {formData.teamId && (
                  <div>
                    <Label>Related Incidents</Label>
                    <div className="mt-2 max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                      {resolvedIncidents.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          No resolved incidents for this team
                        </p>
                      ) : (
                        resolvedIncidents.map((incident) => (
                          <label
                            key={incident.id}
                            className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={formData.incidentIds.includes(incident.id)}
                              onChange={() => toggleIncident(incident.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-1">
                                {incident.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(incident.createdAt), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                    {formData.incidentIds.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {formData.incidentIds.length} incident(s) selected
                      </p>
                    )}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Postmortem
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="team-filter" className="sr-only">
            Filter by team
          </Label>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All teams</SelectItem>
              {teams?.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {postmortems?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No postmortems yet</h3>
          <p className="text-muted-foreground mt-1 max-w-sm">
            Create a postmortem to document and learn from resolved incidents.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {postmortems?.map((postmortem) => (
            <PostmortemCard key={postmortem.id} postmortem={postmortem} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostmortemCard({ postmortem }: { postmortem: Postmortem }) {
  const actionItems = postmortem.actionItems || [];
  const completedActions = actionItems.filter(
    (item) => item.status === 'COMPLETED'
  ).length;
  const totalActions = actionItems.length;

  return (
    <Link to={`/postmortems/${postmortem.id}`}>
      <Card className="hover:bg-muted/50 transition-colors h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base line-clamp-2">
              {postmortem.title}
            </CardTitle>
            <Badge
              variant={postmortem.status === 'PUBLISHED' ? 'default' : 'secondary'}
              className={
                postmortem.status === 'PUBLISHED'
                  ? 'bg-green-500 hover:bg-green-600'
                  : ''
              }
            >
              {postmortem.status === 'PUBLISHED' ? 'Published' : 'Draft'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>{postmortem.team?.name || 'Unknown team'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>
                {formatDistanceToNow(new Date(postmortem.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {postmortem.incidentIds.length} incident(s)
            </span>
            {totalActions > 0 && (
              <div className="flex items-center gap-1">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    completedActions === totalActions
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }`}
                />
                <span
                  className={
                    completedActions === totalActions
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }
                >
                  {completedActions}/{totalActions} actions
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
