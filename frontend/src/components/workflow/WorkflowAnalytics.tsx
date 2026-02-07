/**
 * WorkflowAnalytics - Execution analytics display for workflows
 *
 * Per user decision: detailed execution analytics showing:
 * - Execution count
 * - Success rate
 * - Average duration
 * - Failure points (which actions fail most often)
 *
 * Features:
 * - Time range selector (7 days, 30 days, 90 days)
 * - Success/failure visualizations
 * - Execution trend
 * - Failure breakdown by action type
 * - Recent executions list with expandable details
 */

import { useState, useMemo } from 'react';
import { formatDistanceToNow, format, subDays } from 'date-fns';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Play,
  Activity,
} from 'lucide-react';
import { useWorkflowAnalytics } from '@/hooks/useWorkflows';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { WorkflowExecution, FailurePoint, NodeResult } from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface WorkflowAnalyticsProps {
  workflowId: string;
}

type TimeRange = '7' | '30' | '90';

// =============================================================================
// METRIC CARD
// =============================================================================

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

function MetricCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendValue,
  className,
}: MetricCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
          {trend && trendValue && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs',
                trend === 'up' && 'text-green-600',
                trend === 'down' && 'text-red-600',
                trend === 'neutral' && 'text-muted-foreground'
              )}
            >
              {trend === 'up' && <TrendingUp className="h-3 w-3" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3" />}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SUCCESS/FAILURE PIE CHART (simple)
// =============================================================================

interface PieChartProps {
  successCount: number;
  failureCount: number;
}

function SimplePieChart({ successCount, failureCount }: PieChartProps) {
  const total = successCount + failureCount;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No executions yet
      </div>
    );
  }

  const successPct = (successCount / total) * 100;
  const failurePct = (failureCount / total) * 100;

  // Simple visual using a circular progress
  const strokeWidth = 8;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const successOffset = circumference - (successPct / 100) * circumference;

  return (
    <div className="flex items-center justify-center gap-6">
      <div className="relative">
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-red-200"
          />
          {/* Success arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={successOffset}
            strokeLinecap="round"
            className="text-green-500 transition-all duration-500"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{successPct.toFixed(0)}%</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm">Success: {successCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-sm">Failed: {failureCount}</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FAILURE BREAKDOWN
// =============================================================================

interface FailureBreakdownProps {
  failurePoints: FailurePoint[];
}

function FailureBreakdown({ failurePoints }: FailureBreakdownProps) {
  if (failurePoints.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No failures recorded
      </div>
    );
  }

  // Sort by failure count descending
  const sorted = [...failurePoints].sort((a, b) => b.failureCount - a.failureCount);
  const maxCount = sorted[0]?.failureCount || 1;

  return (
    <div className="space-y-3">
      {sorted.slice(0, 5).map((point) => (
        <div key={point.nodeId} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium truncate">{point.nodeName}</span>
            <Badge variant="outline" className="text-red-600">
              {point.failureCount} failures
            </Badge>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-red-400 rounded-full transition-all"
              style={{ width: `${(point.failureCount / maxCount) * 100}%` }}
            />
          </div>
          {point.commonErrors.length > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {point.commonErrors[0]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// EXECUTION LIST ITEM
// =============================================================================

interface ExecutionListItemProps {
  execution: WorkflowExecution;
}

function ExecutionListItem({ execution }: ExecutionListItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  const duration =
    execution.startedAt && execution.completedAt
      ? new Date(execution.completedAt).getTime() -
        new Date(execution.startedAt).getTime()
      : null;

  const statusColors = {
    PENDING: 'bg-gray-100 text-gray-600',
    RUNNING: 'bg-blue-100 text-blue-600',
    COMPLETED: 'bg-green-100 text-green-600',
    FAILED: 'bg-red-100 text-red-600',
    CANCELLED: 'bg-yellow-100 text-yellow-600',
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 rounded-lg transition-colors text-left">
          <div className="flex-shrink-0">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-3">
            <Badge className={cn('text-xs', statusColors[execution.status])}>
              {execution.status}
            </Badge>

            <span className="text-sm text-muted-foreground">
              {execution.triggeredBy === 'manual' ? 'Manual trigger' : execution.triggerEvent}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {duration !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {duration < 1000
                  ? `${duration}ms`
                  : `${(duration / 1000).toFixed(1)}s`}
              </span>
            )}
            <span>
              {formatDistanceToNow(new Date(execution.createdAt), { addSuffix: true })}
            </span>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-8 pl-3 border-l-2 border-muted space-y-2 py-2">
          {/* Incident link */}
          {execution.incidentId && (
            <a
              href={`/incidents/${execution.incidentId}`}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View Incident
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Action results */}
          {execution.completedNodes && execution.completedNodes.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <span className="text-xs font-medium text-muted-foreground">
                Action Results:
              </span>
              {execution.completedNodes.map((node, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm pl-2"
                >
                  {node.status === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : node.status === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                  <span className="truncate">{node.nodeId}</span>
                  {node.result?.ticketUrl && (
                    <a
                      href={node.result.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      Ticket
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {node.error && (
                    <span className="text-xs text-red-500 truncate">
                      {node.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {execution.error && (
            <div className="p-2 bg-red-50 rounded text-sm text-red-600">
              {execution.error}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowAnalytics({ workflowId }: WorkflowAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30');
  const { data: analytics, isLoading, error } = useWorkflowAnalytics(workflowId, {
    days: parseInt(timeRange),
  });

  // Format average duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
        <p>Failed to load analytics</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Execution Analytics
        </h3>
        <Select value={timeRange} onValueChange={(v: TimeRange) => setTimeRange(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Executions"
          value={analytics.executionCount}
          icon={<Play className="h-5 w-5" />}
          subtitle={`In last ${timeRange} days`}
        />
        <MetricCard
          title="Success Rate"
          value={`${analytics.successRate.toFixed(1)}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          className={cn(
            analytics.successRate >= 90 && 'border-green-200',
            analytics.successRate < 70 && 'border-red-200'
          )}
        />
        <MetricCard
          title="Successful"
          value={analytics.successCount}
          icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
        />
        <MetricCard
          title="Average Duration"
          value={formatDuration(analytics.averageDurationMs)}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Success/Failure pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Success vs Failure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SimplePieChart
              successCount={analytics.successCount}
              failureCount={analytics.failureCount}
            />
          </CardContent>
        </Card>

        {/* Failure points */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Failure Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FailureBreakdown failurePoints={analytics.failurePoints} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
