/**
 * WorkflowTimeline - Timeline entries for workflow executions
 *
 * Per user decision: grouped timeline entries with visual nesting
 *
 * Features:
 * - Collapsible parent entry for workflow execution
 * - Nested action entries when expanded
 * - Auto-expand for running or failed status
 * - Color coding: running=blue, completed=green, failed=red
 * - Clickable ticket URLs and webhook status codes
 * - Duration display
 */

import { useState, useMemo } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ChevronDown,
  ChevronRight,
  Workflow,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  AlertTriangle,
  Webhook,
  Ticket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { TimelineEvent } from '@/types/incident';

// =============================================================================
// TYPES
// =============================================================================

export interface ActionEntry {
  name: string;
  type: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: {
    statusCode?: number;
    responseBody?: string;
    ticketId?: string;
    ticketUrl?: string;
  };
  error?: string;
  timestamp: string;
}

export interface ExecutionGroup {
  executionId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  actions: ActionEntry[];
}

interface WorkflowTimelineEntryProps {
  execution: ExecutionGroup;
}

// =============================================================================
// HELPER: GROUP WORKFLOW EVENTS
// =============================================================================

/**
 * Group timeline events by workflow execution ID
 *
 * Per user decision: group workflow.* events into collapsible entries
 */
export function groupWorkflowEvents(events: TimelineEvent[]): ExecutionGroup[] {
  // 1. Filter events to workflow.* actions only
  const workflowEvents = events.filter((e) =>
    e.action.startsWith('workflow.')
  );

  // 2. Group by metadata.executionId
  const groupedById = new Map<string, TimelineEvent[]>();
  for (const event of workflowEvents) {
    const execId = event.metadata?.executionId as string | undefined;
    if (!execId) continue;
    if (!groupedById.has(execId)) {
      groupedById.set(execId, []);
    }
    groupedById.get(execId)!.push(event);
  }

  // 3. Transform each group into ExecutionGroup
  const groups: ExecutionGroup[] = [];
  for (const [executionId, groupEvents] of groupedById) {
    // Sort by timestamp ascending
    groupEvents.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Find start event for workflow name
    const startEvent = groupEvents.find(
      (e) => e.action === 'workflow.execution.started'
    );

    // Find completion/failure event for status
    const completedEvent = groupEvents.find(
      (e) => e.action === 'workflow.execution.completed'
    );
    const failedEvent = groupEvents.find(
      (e) =>
        e.action === 'workflow.execution.failed' ||
        e.action === 'workflow.action.failed'
    );

    // Determine status
    let status: 'running' | 'completed' | 'failed' = 'running';
    if (completedEvent) status = 'completed';
    if (failedEvent && !completedEvent) status = 'failed';

    // Extract action entries
    const actions: ActionEntry[] = groupEvents
      .filter((e) => e.action.includes('.action.'))
      .map((e) => ({
        name: (e.metadata?.actionName as string) || 'Unknown',
        type: (e.metadata?.actionType as string) || 'unknown',
        status: e.action.includes('completed')
          ? 'completed'
          : e.action.includes('failed')
            ? 'failed'
            : 'skipped',
        result: e.metadata?.result as ActionEntry['result'],
        error: e.metadata?.error as string | undefined,
        timestamp: e.timestamp,
      }));

    groups.push({
      executionId,
      workflowName:
        (startEvent?.metadata?.workflowName as string) || 'Workflow',
      status,
      startedAt: startEvent?.timestamp || groupEvents[0].timestamp,
      completedAt: completedEvent?.timestamp || failedEvent?.timestamp,
      actions,
    });
  }

  // 4. Sort groups by startedAt descending (most recent first)
  return groups.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

/**
 * Filter out workflow events from timeline (for non-grouped display)
 */
export function filterNonWorkflowEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((e) => !e.action.startsWith('workflow.'));
}

// =============================================================================
// ACTION ENTRY COMPONENT
// =============================================================================

interface ActionEntryItemProps {
  action: ActionEntry;
}

function ActionEntryItem({ action }: ActionEntryItemProps) {
  const statusIcons = {
    completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    skipped: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
  };

  const typeIcons: Record<string, React.ReactNode> = {
    webhook: <Webhook className="h-3.5 w-3.5" />,
    jira: <Ticket className="h-3.5 w-3.5" />,
    linear: <Ticket className="h-3.5 w-3.5" />,
  };

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30">
      {/* Status icon */}
      <div className="mt-0.5">{statusIcons[action.status]}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Type icon */}
          <span className="text-muted-foreground">
            {typeIcons[action.type] || <Workflow className="h-3.5 w-3.5" />}
          </span>
          <span className="text-sm font-medium truncate">{action.name}</span>
        </div>

        {/* Result preview */}
        {action.status === 'completed' && action.result && (
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            {/* Status code for webhooks */}
            {action.result.statusCode && (
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  action.result.statusCode < 400
                    ? 'text-green-600 border-green-200'
                    : 'text-red-600 border-red-200'
                )}
              >
                {action.result.statusCode}
              </Badge>
            )}

            {/* Ticket URL - clickable */}
            {action.result.ticketUrl && (
              <a
                href={action.result.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-primary hover:underline"
              >
                {action.result.ticketId || 'View ticket'}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {/* Error message */}
        {action.status === 'failed' && action.error && (
          <div className="text-xs text-red-500 mt-0.5 truncate">
            {action.error}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowTimelineEntry({ execution }: WorkflowTimelineEntryProps) {
  // Auto-expand for running or failed status per user decision
  const [isOpen, setIsOpen] = useState(
    execution.status === 'running' || execution.status === 'failed'
  );

  // Calculate duration
  const duration = useMemo(() => {
    if (!execution.completedAt) return null;
    const ms =
      new Date(execution.completedAt).getTime() -
      new Date(execution.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }, [execution.startedAt, execution.completedAt]);

  // Status styling
  const statusStyles = {
    running: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    },
    completed: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    },
    failed: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: <XCircle className="h-4 w-4 text-red-500" />,
    },
  };

  const style = statusStyles[execution.status];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn('rounded-lg border', style.bg, style.border)}>
        {/* Collapsible trigger - parent entry */}
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center gap-3 text-left hover:bg-black/5 transition-colors rounded-t-lg">
            {/* Expand/collapse chevron */}
            <div className="flex-shrink-0">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Status icon */}
            <div className="flex-shrink-0">{style.icon}</div>

            {/* Workflow name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">
                  {execution.workflowName}
                </span>
              </div>
              {execution.actions.length > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {execution.actions.length} action
                  {execution.actions.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Duration / status */}
            <div className="flex items-center gap-2 text-sm">
              {execution.status === 'running' ? (
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  Running...
                </Badge>
              ) : (
                duration && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {duration}
                  </span>
                )
              )}
            </div>

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(execution.startedAt), {
                addSuffix: true,
              })}
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Nested action entries */}
        <CollapsibleContent>
          <div className="border-t border-inherit">
            <div className="pl-10 pr-3 py-2 space-y-0.5">
              {execution.actions.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  No action details available
                </div>
              ) : (
                execution.actions.map((action, idx) => (
                  <ActionEntryItem key={idx} action={action} />
                ))
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
