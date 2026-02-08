import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useStatusPage, useCreateComponent } from '@/hooks/useStatusPages';
import { ComponentStatusBadge } from '@/components/ComponentStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export function StatusPageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: statusPage, isLoading, error } = useStatusPage(id!);
  const createComponentMutation = useCreateComponent();
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false);
  const [componentForm, setComponentForm] = useState({ name: '', description: '' });

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createComponentMutation.mutateAsync({
        statusPageId: id!,
        data: componentForm
      });
      toast.success('Component added');
      setIsAddComponentOpen(false);
      setComponentForm({ name: '', description: '' });
    } catch {
      toast.error('Failed to add component');
    }
  };

  const copyPublicUrl = () => {
    const url = `${window.location.origin}/status/${statusPage?.slug}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (error || !statusPage) {
    return <div className="p-4 text-red-500">Error loading status page</div>;
  }

  // Compute overall status
  const STATUS_ORDER = ['MAJOR_OUTAGE', 'PARTIAL_OUTAGE', 'DEGRADED_PERFORMANCE', 'UNDER_MAINTENANCE', 'OPERATIONAL'];
  const overallStatus = statusPage.components.reduce((worst, comp) => {
    const currentIdx = STATUS_ORDER.indexOf(comp.currentStatus);
    const worstIdx = STATUS_ORDER.indexOf(worst);
    return currentIdx < worstIdx ? comp.currentStatus : worst;
  }, 'OPERATIONAL');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{statusPage.name}</h1>
            {statusPage.description && (
              <p className="text-muted-foreground mt-1">{statusPage.description}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <ComponentStatusBadge status={overallStatus} />
            <Button variant="outline" size="sm" onClick={copyPublicUrl}>
              <Copy className="mr-2 h-4 w-4" /> Copy URL
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/status/${statusPage.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> View Public Page
              </a>
            </Button>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Badge variant="outline">Team: {statusPage.team.name}</Badge>
          <Badge variant="outline">{statusPage.isPublic ? 'Public' : 'Private'}</Badge>
          <Badge variant="outline">Slug: {statusPage.slug}</Badge>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Components</h2>
        <Dialog open={isAddComponentOpen} onOpenChange={setIsAddComponentOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Component</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Component</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddComponent} className="space-y-4">
              <div>
                <Label htmlFor="compName">Name</Label>
                <Input
                  id="compName"
                  value={componentForm.name}
                  onChange={e => setComponentForm({ ...componentForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="compDesc">Description (optional)</Label>
                <Input
                  id="compDesc"
                  value={componentForm.description}
                  onChange={e => setComponentForm({ ...componentForm, description: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={createComponentMutation.isPending}>
                {createComponentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {statusPage.components.map(component => (
          <Card key={component.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{component.name}</h3>
                  {component.description && (
                    <p className="text-sm text-muted-foreground">{component.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(component.statusUpdatedAt), { addSuffix: true })}
                  </span>
                  <ComponentStatusBadge status={component.currentStatus} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {statusPage.components.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            No components yet. Add components to track service status.
          </p>
        )}
      </div>
    </div>
  );
}
