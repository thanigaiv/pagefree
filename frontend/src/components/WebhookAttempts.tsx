import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useWebhookDeliveries, type Integration } from '@/hooks/useIntegrations';

interface WebhookAttemptsProps {
  integration: Integration;
  trigger?: React.ReactNode;
}

export function WebhookAttempts({ integration, trigger }: WebhookAttemptsProps) {
  const [open, setOpen] = useState(false);
  const { data: deliveries, isLoading, error } = useWebhookDeliveries(
    open ? integration.id : '', // Only fetch when dialog is open
    10
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            View Logs
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recent Webhook Attempts</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading delivery logs...</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-center">
              <p className="text-sm text-destructive">
                Failed to load webhook logs
              </p>
            </div>
          )}

          {deliveries && deliveries.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p>No webhook deliveries yet</p>
            </div>
          )}

          {deliveries && deliveries.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto pr-4">
              <div className="space-y-2">
                {deliveries.map((delivery) => {
                  const isSuccess = delivery.statusCode < 400;

                  return (
                    <div
                      key={delivery.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {isSuccess ? (
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm">
                            {formatDistanceToNow(new Date(delivery.createdAt), {
                              addSuffix: true
                            })}
                          </p>
                          {delivery.errorMessage && (
                            <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                              {delivery.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={isSuccess ? 'default' : 'destructive'}
                        className="flex-shrink-0"
                      >
                        {delivery.statusCode}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Also export a simple list version for inline use
export function WebhookAttemptsList({
  integrationId,
  limit = 10
}: {
  integrationId: string;
  limit?: number;
}) {
  const { data: deliveries, isLoading, error } = useWebhookDeliveries(
    integrationId,
    limit
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  if (error || !deliveries) {
    return (
      <p className="text-sm text-muted-foreground">Failed to load logs</p>
    );
  }

  if (deliveries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No webhooks received yet</p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Recent Webhook Attempts</h3>
      {deliveries.map((delivery) => {
        const isSuccess = delivery.statusCode < 400;
        return (
          <div
            key={delivery.id}
            className="flex items-center justify-between p-2 border rounded text-sm"
          >
            <div className="flex items-center gap-2">
              {isSuccess ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(delivery.createdAt), {
                  addSuffix: true
                })}
              </span>
            </div>
            <Badge variant={isSuccess ? 'default' : 'destructive'}>
              {delivery.statusCode}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
