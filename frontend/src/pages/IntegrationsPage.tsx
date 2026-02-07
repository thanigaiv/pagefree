import { Loader2, Settings, ShieldAlert } from 'lucide-react';
import { useIntegrations, useUpdateIntegration } from '@/hooks/useIntegrations';
import { IntegrationCard } from '@/components/IntegrationCard';
import { IntegrationTestDialog } from '@/components/IntegrationTestDialog';
import { WebhookAttempts } from '@/components/WebhookAttempts';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function IntegrationsPage() {
  const { data: integrations, isLoading, error } = useIntegrations();
  const updateIntegration = useUpdateIntegration();

  // Check for permission errors (backend enforces admin-only via requirePlatformAdmin)
  const isPermissionError = error instanceof Error &&
    (error.message.includes('403') || error.message.includes('Forbidden'));

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
          <AlertDescription>
            Failed to load integrations. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Integrations</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Configure external monitoring tool integrations
        </p>
      </div>

      {/* Info about webhook URL */}
      <div className="mb-6 p-4 bg-muted rounded-lg">
        <h3 className="font-medium mb-2">Webhook URL Format</h3>
        <code className="text-sm bg-background px-2 py-1 rounded">
          {window.location.origin}/api/webhooks/alerts/:integrationName
        </code>
        <p className="text-sm text-muted-foreground mt-2">
          Replace <code>:integrationName</code> with the integration name (e.g., "datadog-prod")
        </p>
      </div>

      {/* Integration cards */}
      <div className="space-y-4">
        {integrations?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No integrations configured yet.</p>
            <p className="text-sm mt-2">
              Create integrations via API: POST /api/integrations
            </p>
          </div>
        )}

        {integrations?.map((integration) => (
          <div key={integration.id} className="relative">
            <IntegrationCard
              integration={integration}
              isUpdating={updateIntegration.isPending}
              onToggle={(enabled) => {
                updateIntegration.mutate({
                  id: integration.id,
                  data: { isActive: enabled }
                });
              }}
              onTest={() => {}} // Handled by IntegrationTestDialog
              onViewLogs={() => {}} // Handled by WebhookAttempts
            />
          </div>
        ))}
      </div>

      {/* Setup instructions */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Setup Instructions</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* DataDog setup */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">DataDog</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to Monitors &rarr; Manage Monitors</li>
              <li>Select a monitor and click "Edit"</li>
              <li>Scroll to "Notify your team"</li>
              <li>Add webhook URL with @webhook-oncall</li>
              <li>Save and trigger a test alert</li>
            </ol>
          </div>

          {/* New Relic setup */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2">New Relic</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Go to Alerts &rarr; Destinations</li>
              <li>Click "Add a destination"</li>
              <li>Select "Webhook" type</li>
              <li>Enter the webhook URL</li>
              <li>Create a condition and trigger test</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
