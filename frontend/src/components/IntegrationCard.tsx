import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Integration } from '@/hooks/useIntegrations';
import { IntegrationTestDialog } from './IntegrationTestDialog';
import { WebhookAttempts } from './WebhookAttempts';

interface IntegrationCardProps {
  integration: Integration;
  isUpdating?: boolean;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  onViewLogs: () => void;
}

// Provider display names and icons
const providerConfig: Record<string, { name: string; color: string }> = {
  datadog: { name: 'DataDog', color: 'bg-purple-100 text-purple-800' },
  newrelic: { name: 'New Relic', color: 'bg-green-100 text-green-800' },
  pagerduty: { name: 'PagerDuty', color: 'bg-emerald-100 text-emerald-800' },
  generic: { name: 'Generic', color: 'bg-gray-100 text-gray-800' }
};

export function IntegrationCard({
  integration,
  isUpdating = false,
  onToggle,
  onTest,
  onViewLogs
}: IntegrationCardProps) {
  const config = providerConfig[integration.type] || providerConfig.generic;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-lg">{integration.name}</CardTitle>
            <Badge variant="outline" className={config.color}>
              {config.name}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
          <Switch
            checked={integration.isActive}
            onCheckedChange={onToggle}
            disabled={isUpdating}
            aria-label={`${integration.isActive ? 'Disable' : 'Enable'} ${integration.name}`}
          />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Health indicators per user decision */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {/* Status indicator */}
            {integration.isActive ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>Enabled</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span>Disabled</span>
              </div>
            )}

            {/* Last webhook per specific idea */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                Last webhook:{' '}
                {integration.lastWebhookAt
                  ? formatDistanceToNow(new Date(integration.lastWebhookAt), { addSuffix: true })
                  : 'never'}
              </span>
            </div>

            {/* Error count per specific idea */}
            {integration.errorCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {integration.errorCount} error{integration.errorCount === 1 ? '' : 's'} (24h)
              </Badge>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Database className="h-4 w-4" />
              <span>{integration.alertCount} alerts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink className="h-4 w-4" />
              <span>{integration.webhookCount} webhooks</span>
            </div>
          </div>

          {/* Actions per user decision: test button + view logs */}
          <div className="flex gap-2 pt-2">
            <IntegrationTestDialog
              integration={integration}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!integration.isActive}
                >
                  Test Webhook
                </Button>
              }
            />
            <WebhookAttempts
              integration={integration}
              trigger={
                <Button variant="ghost" size="sm">
                  View Logs
                </Button>
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
