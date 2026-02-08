import { useState } from 'react';
import { Loader2, Settings, ShieldAlert, Plus, Trash2, RotateCw, Copy, Check } from 'lucide-react';
import {
  useIntegrations,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  useRotateSecret
} from '@/hooks/useIntegrations';
import { IntegrationCard } from '@/components/IntegrationCard';
import { IntegrationTestDialog } from '@/components/IntegrationTestDialog';
import { WebhookAttempts } from '@/components/WebhookAttempts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

export default function IntegrationsPage() {
  const { data: integrations, isLoading, error } = useIntegrations();
  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const deleteIntegration = useDeleteIntegration();
  const rotateSecret = useRotateSecret();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state for create dialog
  const [formData, setFormData] = useState({
    name: '',
    type: 'datadog' as 'datadog' | 'newrelic' | 'pagerduty' | 'generic',
    signatureHeader: '',
    deduplicationWindowMinutes: 5
  });

  const handleCreateIntegration = async () => {
    try {
      const result = await createIntegration.mutateAsync({
        name: formData.name,
        type: formData.type,
        signatureHeader: formData.signatureHeader || undefined,
        deduplicationWindowMinutes: formData.deduplicationWindowMinutes
      });

      // Show the webhook secret
      setNewSecret(result.webhookSecret);
      setSecretDialogOpen(true);
      setCreateDialogOpen(false);

      // Reset form
      setFormData({
        name: '',
        type: 'datadog',
        signatureHeader: '',
        deduplicationWindowMinutes: 5
      });
    } catch (error) {
      console.error('Failed to create integration:', error);
    }
  };

  const handleDeleteIntegration = async () => {
    if (!selectedIntegrationId) return;

    try {
      await deleteIntegration.mutateAsync(selectedIntegrationId);
      setDeleteDialogOpen(false);
      setSelectedIntegrationId(null);
    } catch (error) {
      console.error('Failed to delete integration:', error);
    }
  };

  const handleRotateSecret = async (id: string) => {
    try {
      const result = await rotateSecret.mutateAsync(id);
      setNewSecret(result.webhookSecret);
      setSecretDialogOpen(true);
    } catch (error) {
      console.error('Failed to rotate secret:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check for permission errors
  const isPermissionError =
    error instanceof Error && (error.message.includes('403') || error.message.includes('Forbidden'));

  if (isPermissionError) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Only platform administrators can access integration settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Alert variant="destructive">
          <AlertDescription>Failed to load integrations. Please try again.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Integrations</h1>
          </div>
          <p className="text-muted-foreground mt-1">Configure external monitoring tool integrations</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Integration
        </Button>
      </div>

      {/* Webhook URL info */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <h3 className="font-medium mb-2">Webhook URL Format</h3>
        <code className="text-sm bg-background px-2 py-1 rounded">
          {window.location.origin}/webhooks/alerts/:integrationName
        </code>
        <p className="text-sm text-muted-foreground mt-2">
          Replace <code>:integrationName</code> with the integration name (e.g., "datadog-prod")
        </p>
      </div>

      {/* Integration cards */}
      <div className="space-y-4">
        {integrations?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No integrations configured yet.</p>
            <p className="text-sm mt-2">Click "Create Integration" to get started.</p>
          </div>
        )}

        {integrations?.map((integration) => (
          <div key={integration.id} className="relative border rounded-lg p-4">
            <IntegrationCard
              integration={integration}
              isUpdating={updateIntegration.isPending}
              onToggle={(enabled) => {
                updateIntegration.mutate({
                  id: integration.id,
                  data: { isActive: enabled }
                });
              }}
              onTest={() => {}}
              onViewLogs={() => {}}
            />
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRotateSecret(integration.id)}
                disabled={rotateSecret.isPending}
              >
                <RotateCw className="h-3 w-3 mr-1" />
                Rotate Secret
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setSelectedIntegrationId(integration.id);
                  setDeleteDialogOpen(true);
                }}
                disabled={deleteIntegration.isPending}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Setup instructions */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Setup Instructions</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">DataDog</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to Monitors → Manage Monitors</li>
              <li>Select a monitor and click "Edit"</li>
              <li>Scroll to "Notify your team"</li>
              <li>Add webhook URL with @webhook-oncall</li>
              <li>Save and trigger a test alert</li>
            </ol>
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">New Relic</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to Alerts → Destinations</li>
              <li>Click "Add a destination"</li>
              <li>Select "Webhook" type</li>
              <li>Enter the webhook URL</li>
              <li>Create a condition and trigger test</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Create Integration Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Integration</DialogTitle>
            <DialogDescription>
              Configure a new webhook integration for receiving alerts from external monitoring tools.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Integration Name</Label>
              <Input
                id="name"
                placeholder="datadog-prod"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase alphanumeric with dashes only. Used in webhook URL.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Integration Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="datadog">DataDog</SelectItem>
                  <SelectItem value="newrelic">New Relic</SelectItem>
                  <SelectItem value="pagerduty">PagerDuty</SelectItem>
                  <SelectItem value="generic">Generic Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatureHeader">Signature Header (Optional)</Label>
              <Input
                id="signatureHeader"
                placeholder="X-Webhook-Signature"
                value={formData.signatureHeader}
                onChange={(e) => setFormData({ ...formData, signatureHeader: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                HTTP header containing the webhook signature for verification.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dedup">Deduplication Window (minutes)</Label>
              <Input
                id="dedup"
                type="number"
                min={1}
                max={1440}
                value={formData.deduplicationWindowMinutes}
                onChange={(e) =>
                  setFormData({ ...formData, deduplicationWindowMinutes: parseInt(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Time window for grouping duplicate alerts. Default: 5 minutes.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateIntegration}
              disabled={!formData.name || createIntegration.isPending}
            >
              {createIntegration.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Integration'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook Secret Dialog */}
      <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Secret</DialogTitle>
            <DialogDescription>
              Save this secret securely. It cannot be retrieved again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Store this secret in your password manager. You'll need it to configure the webhook in
                your monitoring tool.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Webhook Secret</Label>
              <div className="flex gap-2">
                <Input value={newSecret || ''} readOnly className="font-mono text-sm" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(newSecret || '')}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setSecretDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Integration</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the integration and stop accepting webhooks. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteIntegration}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
