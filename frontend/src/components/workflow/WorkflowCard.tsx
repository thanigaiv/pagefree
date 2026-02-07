/**
 * WorkflowCard - Display card for a workflow in the list
 *
 * Shows workflow details with:
 * - Name and description
 * - Scope badge (Team/Global)
 * - Status toggle switch
 * - Trigger type icon
 * - Quick stats (execution count, success rate)
 * - Last executed timestamp
 * - Action dropdown (Edit, Duplicate, Export, Delete)
 *
 * Per user decisions:
 * - Toggle enabled/disabled state
 * - Workflow duplication from list
 * - Version indicator with history link
 * - Detailed execution analytics
 */

import { formatDistanceToNow } from 'date-fns';
import {
  MoreHorizontal,
  Play,
  Copy,
  FileDown,
  Trash2,
  Edit2,
  Power,
  PowerOff,
  Zap,
  Clock,
  RefreshCw,
  Users,
  Globe,
  CheckCircle2,
  XCircle,
  TrendingUp,
  History,
  AlertTriangle,
} from 'lucide-react';
import type { Workflow, TriggerType } from '@/types/workflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface WorkflowCardProps {
  workflow: Workflow;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onExport?: () => void;
  onViewHistory?: () => void;
  onViewAnalytics?: () => void;
  isToggling?: boolean;
  executionStats?: {
    executionCount: number;
    successRate: number;
    lastExecutedAt?: string;
  };
  teamName?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

const triggerIcons: Record<TriggerType, React.ReactNode> = {
  incident_created: <Zap className="h-4 w-4" />,
  state_changed: <RefreshCw className="h-4 w-4" />,
  escalation: <TrendingUp className="h-4 w-4" />,
  manual: <Play className="h-4 w-4" />,
  age: <Clock className="h-4 w-4" />,
};

const triggerLabels: Record<TriggerType, string> = {
  incident_created: 'Incident Created',
  state_changed: 'State Changed',
  escalation: 'Escalation',
  manual: 'Manual',
  age: 'Incident Age',
};

// =============================================================================
// COMPONENT
// =============================================================================

export function WorkflowCard({
  workflow,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  onExport,
  onViewHistory,
  onViewAnalytics,
  isToggling,
  executionStats,
  teamName,
}: WorkflowCardProps) {
  const triggerType = workflow.definition?.trigger?.type || 'manual';
  const TriggerIcon = triggerIcons[triggerType] || triggerIcons.manual;

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        !workflow.isEnabled && 'opacity-60'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base truncate">{workflow.name}</CardTitle>
              {/* Version indicator per user decision */}
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-muted"
                onClick={onViewHistory}
              >
                v{workflow.version}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {workflow.description}
            </p>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              {onExport && (
                <DropdownMenuItem onClick={onExport}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export JSON
                </DropdownMenuItem>
              )}
              {onViewHistory && (
                <DropdownMenuItem onClick={onViewHistory}>
                  <History className="h-4 w-4 mr-2" />
                  Version History
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope badge */}
          <Badge variant="secondary" className="text-xs">
            {workflow.scopeType === 'global' ? (
              <>
                <Globe className="h-3 w-3 mr-1" />
                Global
              </>
            ) : (
              <>
                <Users className="h-3 w-3 mr-1" />
                Team
              </>
            )}
          </Badge>

          {/* Team name for team-scoped workflows */}
          {workflow.scopeType === 'team' && teamName && (
            <Badge variant="outline" className="text-xs">
              {teamName}
            </Badge>
          )}

          {/* Trigger type */}
          <Badge variant="outline" className="text-xs">
            {TriggerIcon}
            <span className="ml-1">{triggerLabels[triggerType]}</span>
          </Badge>

          {/* Template category if from template */}
          {workflow.templateCategory && (
            <Badge variant="outline" className="text-xs text-primary">
              {workflow.templateCategory}
            </Badge>
          )}
        </div>

        {/* Stats row - per user decision (analytics) */}
        {executionStats && (
          <div className="flex items-center gap-4 text-sm">
            {/* Execution count */}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Play className="h-3.5 w-3.5" />
              <span>{executionStats.executionCount} runs</span>
            </div>

            {/* Success rate */}
            <div
              className={cn(
                'flex items-center gap-1',
                executionStats.successRate >= 90
                  ? 'text-green-600'
                  : executionStats.successRate >= 70
                    ? 'text-yellow-600'
                    : 'text-red-600'
              )}
            >
              {executionStats.successRate >= 90 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : executionStats.successRate >= 70 ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>{executionStats.successRate.toFixed(0)}% success</span>
            </div>

            {/* View analytics link */}
            {onViewAnalytics && (
              <button
                onClick={onViewAnalytics}
                className="text-primary text-xs hover:underline"
              >
                View analytics
              </button>
            )}
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between pt-2 border-t">
          {/* Last executed */}
          <div className="text-xs text-muted-foreground">
            {executionStats?.lastExecutedAt ? (
              <>
                Last run{' '}
                {formatDistanceToNow(new Date(executionStats.lastExecutedAt), {
                  addSuffix: true,
                })}
              </>
            ) : (
              'Never executed'
            )}
          </div>

          {/* Enable/disable toggle per user decision */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {workflow.isEnabled ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Power className="h-3 w-3" />
                  Enabled
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <PowerOff className="h-3 w-3" />
                  Disabled
                </span>
              )}
            </span>
            <Switch
              checked={workflow.isEnabled}
              onCheckedChange={onToggle}
              disabled={isToggling}
              aria-label={workflow.isEnabled ? 'Disable workflow' : 'Enable workflow'}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
