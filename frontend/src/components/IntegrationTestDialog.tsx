import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Clock
} from 'lucide-react';
import { useTestIntegration, type TestWebhookResult } from '@/hooks/useIntegrations';
import type { Integration } from '@/hooks/useIntegrations';

interface IntegrationTestDialogProps {
  integration: Integration;
  trigger?: React.ReactNode;
}

export function IntegrationTestDialog({
  integration,
  trigger
}: IntegrationTestDialogProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<TestWebhookResult | null>(null);
  const testMutation = useTestIntegration();

  const handleTest = async () => {
    setResult(null);
    try {
      const data = await testMutation.mutateAsync(integration.id);
      setResult(data);
    } catch (error) {
      // Error handled by mutation state
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setResult(null);
      testMutation.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" disabled={!integration.isActive}>
            Test Webhook
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test {integration.name} Integration</DialogTitle>
          <DialogDescription>
            Send a test webhook to verify the integration is working correctly.
            The test alert will auto-resolve after 5 minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Test button */}
          {!result && !testMutation.isPending && (
            <Button onClick={handleTest} className="w-full">
              Send Test Webhook
            </Button>
          )}

          {/* Loading state */}
          {testMutation.isPending && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Sending test webhook...</span>
            </div>
          )}

          {/* Error state */}
          {testMutation.isError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Test Failed</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {testMutation.error instanceof Error
                  ? testMutation.error.message
                  : 'An unknown error occurred'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Success state with validation results per user decision */}
          {result?.success && (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Test Webhook Successful</span>
                </div>
              </div>

              {/* Alert created */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-medium">Alert Created</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="text-xs bg-muted px-1 rounded">
                    {result.alert.id.slice(-12)}
                  </code>
                  <span className="text-muted-foreground">Title:</span>
                  <span className="truncate">{result.alert.title}</span>
                  <span className="text-muted-foreground">Severity:</span>
                  <Badge variant="outline">{result.alert.severity}</Badge>
                </div>
              </div>

              {/* Validation results per specific idea */}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-medium">Validation Results</h4>

                {/* Severity mapping */}
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Severity mapped:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {result.validation.severityMapped}
                  </code>
                </div>

                {/* Service routing */}
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Routed to service:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {result.validation.serviceRouted}
                  </code>
                </div>

                {/* Provider detected */}
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Provider detected:</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                    {result.validation.providerDetected}
                  </code>
                </div>
              </div>

              {/* Auto-resolve notice */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Test alert will auto-resolve in {result.autoResolveIn}</span>
              </div>

              {/* Run another test */}
              <Button variant="outline" onClick={handleTest} className="w-full">
                Run Another Test
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
