import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useStatusPage, useUpdateStatusPage } from '@/hooks/useStatusPages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export function StatusPageEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: statusPage, isLoading, error } = useStatusPage(id!);
  const updateMutation = useUpdateStatusPage();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPublic: false
  });

  // Populate form when data loads
  useEffect(() => {
    if (statusPage) {
      setFormData({
        name: statusPage.name,
        description: statusPage.description || '',
        isPublic: statusPage.isPublic
      });
    }
  }, [statusPage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          name: formData.name,
          description: formData.description || null,
          isPublic: formData.isPublic
        }
      });
      toast.success('Status page updated');
      navigate(`/status-pages/${id}`);
    } catch (error: any) {
      console.error('Failed to update status page:', error);
      const errorMessage = error?.message || error?.error || 'Failed to update status page';
      toast.error(errorMessage);
    }
  };

  const handleCancel = () => {
    navigate(`/status-pages/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (error || !statusPage) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-red-500">Error loading status page</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Status Page</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="My Status Page"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for your status page"
                rows={3}
              />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Team</Label>
              <Input value={statusPage.team.name} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">
                Team cannot be changed after creation
              </p>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Slug</Label>
              <Input value={statusPage.slug} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">
                Slug is automatically generated and cannot be changed
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="public"
                checked={formData.isPublic}
                onCheckedChange={v => setFormData({ ...formData, isPublic: v })}
              />
              <Label htmlFor="public">Public (no access token required)</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
