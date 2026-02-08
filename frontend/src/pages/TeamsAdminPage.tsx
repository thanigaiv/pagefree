import { useState } from 'react';
import { useTeams } from '@/hooks/useTeams';
import { useCreateTeam, useUpdateTeam, useDeleteTeam } from '@/hooks/useTeamsAdmin';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, Plus, MoreVertical, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamsAdminPage() {
  const { data: teams, isLoading, error } = useTeams();
  const createMutation = useCreateTeam();
  const updateMutation = useUpdateTeam();
  const deleteMutation = useDeleteTeam();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    slackChannel: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Team name is required');
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        slackChannel: formData.slackChannel || undefined,
      });
      toast.success('Team created successfully');
      setIsCreateOpen(false);
      setFormData({ name: '', description: '', slackChannel: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create team');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTeam || !formData.name.trim()) {
      toast.error('Team name is required');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: selectedTeam.id,
        data: {
          name: formData.name,
          description: formData.description || undefined,
          slackChannel: formData.slackChannel || undefined,
        },
      });
      toast.success('Team updated successfully');
      setIsEditOpen(false);
      setSelectedTeam(null);
      setFormData({ name: '', description: '', slackChannel: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update team');
    }
  };

  const handleDelete = async () => {
    if (!selectedTeam) return;

    try {
      await deleteMutation.mutateAsync(selectedTeam.id);
      toast.success('Team deleted successfully');
      setIsDeleteOpen(false);
      setSelectedTeam(null);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete team');
    }
  };

  const openEditDialog = (team: any) => {
    setSelectedTeam(team);
    setFormData({
      name: team.name,
      description: team.description || '',
      slackChannel: team.slackChannel || '',
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (team: any) => {
    setSelectedTeam(team);
    setIsDeleteOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-red-500">Error loading teams</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Teams Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage teams, members, and permissions
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Team</DialogTitle>
              <DialogDescription>
                Create a new team to organize your incident management.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Team Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Engineering Team"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Team responsible for..."
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="slackChannel">Slack Channel</Label>
                <Input
                  id="slackChannel"
                  value={formData.slackChannel}
                  onChange={(e) => setFormData({ ...formData, slackChannel: e.target.value })}
                  placeholder="#engineering-incidents"
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Team
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update team information and settings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Team Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-slackChannel">Slack Channel</Label>
              <Input
                id="edit-slackChannel"
                value={formData.slackChannel}
                onChange={(e) => setFormData({ ...formData, slackChannel: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTeam?.name}"? This action cannot be undone
              and will affect all incidents, schedules, and escalation policies associated with this
              team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!teams || teams.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No teams yet</h3>
          <p className="text-muted-foreground mt-1">
            Create your first team to get started with incident management.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{team.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(team)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(team)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {team.description && <CardDescription>{team.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant={team.isActive ? 'default' : 'secondary'}>
                    {team.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
