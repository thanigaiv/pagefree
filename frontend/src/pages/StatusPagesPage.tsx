import { useState } from 'react';
import { useStatusPages, useCreateStatusPage } from '@/hooks/useStatusPages';
import { useTeams } from '@/hooks/useTeams';
import { StatusPageCard } from '@/components/StatusPageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function StatusPagesPage() {
  const { data: statusPages, isLoading, error } = useStatusPages();
  const { data: teams } = useTeams();
  const createMutation = useCreateStatusPage();

  console.log('[StatusPagesPage] statusPages:', statusPages, 'isLoading:', isLoading, 'error:', error);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teamId: '',
    isPublic: false
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name || !formData.teamId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const result = await createMutation.mutateAsync(formData);
      toast.success('Status page created');
      if (result.accessToken) {
        toast.info(`Access token: ${result.accessToken}`, { duration: 10000 });
      }
      setIsCreateOpen(false);
      setFormData({ name: '', description: '', teamId: '', isPublic: false });
    } catch (error: any) {
      console.error('Failed to create status page:', error);
      const errorMessage = error?.message || error?.error || 'Failed to create status page';
      toast.error(errorMessage);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error loading status pages</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Status Pages</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Status Page</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Status Page</DialogTitle>
              <DialogDescription>
                Create a new status page to display the health of your services.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="team">Team *</Label>
                <Select value={formData.teamId} onValueChange={v => setFormData({ ...formData, teamId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="public"
                  checked={formData.isPublic}
                  onCheckedChange={v => setFormData({ ...formData, isPublic: v })}
                />
                <Label htmlFor="public">Public (no access token required)</Label>
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!statusPages || statusPages.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No status pages yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {statusPages.map(page => (
            <StatusPageCard key={page.id} statusPage={page} />
          ))}
        </div>
      )}
    </div>
  );
}
