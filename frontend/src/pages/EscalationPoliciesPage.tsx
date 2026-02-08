import { useState } from 'react';
import { useTeams } from '@/hooks/useTeams';
import {
  useEscalationPoliciesByTeam,
  useCreateEscalationPolicy,
  useDeleteEscalationPolicy,
  useEscalationPolicy,
  useCreateEscalationLevel,
  useDeleteEscalationLevel,
} from '@/hooks/useEscalationPolicies';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Plus, MoreVertical, Edit, Trash2, Loader2, Clock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function EscalationPoliciesPage() {
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const { data: policies, isLoading } = useEscalationPoliciesByTeam(selectedTeamId);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const { data: selectedPolicy } = useEscalationPolicy(selectedPolicyId || undefined);

  const createMutation = useCreateEscalationPolicy();
  const deleteMutation = useDeleteEscalationPolicy();
  const createLevelMutation = useCreateEscalationLevel();
  const deleteLevelMutation = useDeleteEscalationLevel();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teamId: '',
    repeatCount: 3,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.teamId) {
      toast.error('Name and team are required');
      return;
    }

    try {
      const newPolicy = await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        teamId: formData.teamId,
        repeatCount: formData.repeatCount,
      });
      toast.success('Escalation policy created - Click on it to add escalation levels');
      setIsCreateOpen(false);
      setFormData({ name: '', description: '', teamId: '', repeatCount: 3 });
      // Auto-select the team if it was just created
      setSelectedTeamId(formData.teamId);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create escalation policy');
    }
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;

    try {
      await deleteMutation.mutateAsync(policyToDelete.id);
      toast.success('Escalation policy deleted');
      setIsDeleteOpen(false);
      setPolicyToDelete(null);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete escalation policy');
    }
  };

  const openDeleteDialog = (policy: any) => {
    setPolicyToDelete(policy);
    setIsDeleteOpen(true);
  };

  const viewPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setIsViewOpen(true);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Escalation Policies</h1>
          <p className="text-muted-foreground mt-1">
            Configure on-call schedules and escalation rules for teams
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Policy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Escalation Policy</DialogTitle>
              <DialogDescription>
                Create a policy first, then add escalation levels to define how incidents should be escalated to on-call responders.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Policy Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Primary Escalation"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Escalation policy for..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="team">Team *</Label>
                <Select
                  value={formData.teamId}
                  onValueChange={(v) => setFormData({ ...formData, teamId: v })}
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
              <div>
                <Label htmlFor="repeatCount">Repeat Count</Label>
                <Input
                  id="repeatCount"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.repeatCount}
                  onChange={(e) =>
                    setFormData({ ...formData, repeatCount: parseInt(e.target.value) || 3 })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of times to repeat escalation levels before stopping
                </p>
              </div>
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="text-muted-foreground">
                  💡 After creating the policy, click on it to add escalation levels (who to notify and when).
                </p>
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Policy
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Filter */}
      <div className="mb-6">
        <Label htmlFor="team-filter">Filter by Team</Label>
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger className="w-64">
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

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escalation Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{policyToDelete?.name}"? This action cannot be
              undone and may affect active incidents using this policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Policy Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedPolicy?.name}</DialogTitle>
            <DialogDescription>{selectedPolicy?.description}</DialogDescription>
          </DialogHeader>
          {selectedPolicy && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Escalation Levels</Label>
                  <Badge>Repeat {selectedPolicy.repeatCount}x</Badge>
                </div>
                {selectedPolicy.levels.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                    No escalation levels configured yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedPolicy.levels.map((level, idx) => (
                      <div key={level.id} className="border rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">Level {level.level}</Badge>
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {level.delayMinutes} min delay
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {level.targets.map((target, tidx) => (
                            <Badge key={tidx} variant="secondary">
                              {target.user
                                ? `${target.user.firstName} ${target.user.lastName}`
                                : target.schedule?.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
                <p className="text-blue-900 font-medium mb-1">Adding Escalation Levels</p>
                <p className="text-blue-800 text-xs">
                  Use the API endpoint POST /api/escalation-policies/{selectedPolicy?.id || ':id'}/levels to add levels with targets (users or schedules). Full UI for managing levels is coming soon.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!selectedTeamId ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Select a team</h3>
          <p className="text-muted-foreground mt-1">
            Choose a team from the filter above to view its escalation policies
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : !policies || policies.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No escalation policies yet</h3>
          <p className="text-muted-foreground mt-1">
            Create an escalation policy to define how incidents are escalated
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {policies.map((policy) => (
            <Card
              key={policy.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => viewPolicy(policy.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{policy.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(policy);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {policy.description && <CardDescription>{policy.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    <span>{policy.levels.length} escalation levels</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    <span>Repeat {policy.repeatCount}x</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
