/**
 * ActionNode - Custom React Flow node for workflow actions
 *
 * Displays action type (webhook, jira, linear) with appropriate icon.
 * Shows action name and brief config summary.
 * Color coding: webhook=blue, jira=blue-500, linear=purple
 * Handle for input (top) and output (bottom).
 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActionData, ActionType } from '@/types/workflow';

// Icons for action types
const JiraIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M11.571 11.429L0 22.857a.857.857 0 001.286 0l10.285-10.286 10.286 10.286a.857.857 0 001.286 0L11.571 11.429zM12 3.857L1.714 14.143a.857.857 0 001.286 0L12 5.143l9 9a.857.857 0 001.286 0L12 3.857z" />
  </svg>
);

const LinearIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M3.386 13.374a.752.752 0 01-.185-.893c.207-.393.503-.747.868-1.035l.015-.012 4.877-3.898a.75.75 0 01.937 1.172l-4.862 3.886a.759.759 0 00-.072.063 3.249 3.249 0 00-.578.717zm16.748 5.46a.75.75 0 01-.893-.185 3.248 3.248 0 00-.717-.578.758.758 0 00-.063-.072l-3.886-4.862a.75.75 0 011.172-.937l3.898 4.877.012.015c.288.365.642.661 1.035.868a.752.752 0 01.442.874z" />
    <path d="M12 22.5C6.21 22.5 1.5 17.79 1.5 12S6.21 1.5 12 1.5 22.5 6.21 22.5 12 17.79 22.5 12 22.5zM12 3a9 9 0 100 18 9 9 0 000-18z" />
  </svg>
);

// Configuration for each action type
const actionConfig: Record<ActionType, {
  icon: React.ElementType;
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  iconBgColor: string;
}> = {
  webhook: {
    icon: Globe,
    label: 'Webhook',
    bgColor: 'bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950 dark:to-sky-950',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-600 dark:text-blue-400',
    iconBgColor: 'bg-blue-100 dark:bg-blue-900',
  },
  jira: {
    icon: JiraIcon,
    label: 'Jira Ticket',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950',
    borderColor: 'border-blue-300 dark:border-blue-700',
    textColor: 'text-blue-700 dark:text-blue-300',
    iconBgColor: 'bg-blue-100 dark:bg-blue-900',
  },
  linear: {
    icon: LinearIcon,
    label: 'Linear Issue',
    bgColor: 'bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950 dark:to-purple-950',
    borderColor: 'border-violet-200 dark:border-violet-800',
    textColor: 'text-violet-600 dark:text-violet-400',
    iconBgColor: 'bg-violet-100 dark:bg-violet-900',
  },
};

type ActionNodeProps = NodeProps<Node<ActionData>>;

export function ActionNode({ id, data, selected }: ActionNodeProps) {
  const config = actionConfig[data.actionType] || actionConfig.webhook;
  const Icon = config.icon;
  const hasValidationError = !data.name || !data.config;
  const hasRetry = data.retry && data.retry.attempts > 1;

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent('workflow-node-click', { detail: { nodeId: id } })
    );
  };

  // Get config summary based on action type
  const getConfigSummary = () => {
    switch (data.actionType) {
      case 'webhook': {
        const webhookConfig = data.config;
        return (
          <span className="truncate">
            {webhookConfig.method} {webhookConfig.url.substring(0, 30)}
            {webhookConfig.url.length > 30 && '...'}
          </span>
        );
      }
      case 'jira': {
        const jiraConfig = data.config;
        return (
          <span className="truncate">
            {jiraConfig.projectKey} - {jiraConfig.issueType}
          </span>
        );
      }
      case 'linear': {
        const linearConfig = data.config;
        return (
          <span className="truncate">
            Team: {linearConfig.teamId.substring(0, 8)}...
          </span>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Card
      onClick={handleClick}
      className={cn(
        'min-w-[220px] p-3 cursor-pointer',
        config.bgColor,
        'border-2',
        config.borderColor,
        selected && 'ring-2 ring-offset-2',
        selected && data.actionType === 'webhook' && 'ring-blue-500',
        selected && data.actionType === 'jira' && 'ring-blue-500',
        selected && data.actionType === 'linear' && 'ring-violet-500',
        hasValidationError && 'border-red-300 dark:border-red-700'
      )}
    >
      {/* Input handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3',
          data.actionType === 'webhook' && '!bg-blue-500 !border-blue-300',
          data.actionType === 'jira' && '!bg-blue-600 !border-blue-400',
          data.actionType === 'linear' && '!bg-violet-500 !border-violet-300'
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('p-1.5 rounded-md', config.iconBgColor)}>
          <Icon className={cn('h-4 w-4', config.textColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn('font-semibold text-sm truncate', config.textColor.replace('600', '900').replace('400', '100'))}>
            {data.name || 'Untitled Action'}
          </h3>
          <p className={cn('text-xs', config.textColor)}>{config.label}</p>
        </div>
        {hasValidationError && (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
      </div>

      {/* Config summary */}
      <div className={cn('text-xs mt-1', config.textColor, 'opacity-80')}>
        {getConfigSummary()}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1 mt-2">
        {/* Retry badge if retries > 1 */}
        {hasRetry && (
          <Badge
            variant="outline"
            className={cn('text-xs gap-1', config.borderColor)}
          >
            <RefreshCw className="h-3 w-3" />
            {data.retry.attempts} retries
          </Badge>
        )}

        {/* External link indicator */}
        <Badge
          variant="secondary"
          className="text-xs gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          External
        </Badge>
      </div>

      {/* Output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-3 !h-3',
          data.actionType === 'webhook' && '!bg-blue-500 !border-blue-300',
          data.actionType === 'jira' && '!bg-blue-600 !border-blue-400',
          data.actionType === 'linear' && '!bg-violet-500 !border-violet-300'
        )}
      />
    </Card>
  );
}

export default ActionNode;
