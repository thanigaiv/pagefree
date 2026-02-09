/**
 * WorkflowSidebar - Node palette for drag-and-drop workflow builder
 *
 * Provides draggable node items organized into sections:
 * - Triggers (one per workflow - disabled if trigger exists)
 * - Actions (HTTP Webhook, Create Jira Ticket, Create Linear Issue)
 * - Flow Control (Condition, Delay)
 *
 * Per user decisions:
 * - Visual drag-and-drop builder
 * - Template library on workflow creation
 */

import { useState } from 'react';
import {
  Zap,
  RefreshCw,
  ArrowUp,
  Hand,
  Clock,
  Globe,
  Ticket,
  ListTodo,
  BookOpen,
  GitBranch,
  Timer,
  Sparkles,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { WorkflowNodeType, TriggerType, ActionType } from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface SidebarProps {
  onStartFromTemplate?: () => void;
  hasTrigger?: boolean; // Disable triggers if workflow already has one
}

interface DraggableNodeConfig {
  type: WorkflowNodeType;
  subType?: TriggerType | ActionType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
}

// =============================================================================
// NODE CONFIGURATIONS
// =============================================================================

const triggerNodes: DraggableNodeConfig[] = [
  {
    type: 'trigger',
    subType: 'incident_created',
    label: 'Incident Created',
    description: 'When a new incident is created',
    icon: Zap,
    color: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
  {
    type: 'trigger',
    subType: 'state_changed',
    label: 'State Changed',
    description: 'When incident status changes',
    icon: RefreshCw,
    color: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
  {
    type: 'trigger',
    subType: 'escalation',
    label: 'Escalation Occurred',
    description: 'When escalation triggers',
    icon: ArrowUp,
    color: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
  {
    type: 'trigger',
    subType: 'manual',
    label: 'Manual Trigger',
    description: 'Triggered manually by user',
    icon: Hand,
    color: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
  {
    type: 'trigger',
    subType: 'age',
    label: 'Incident Age',
    description: 'After incident open for N minutes',
    icon: Clock,
    color: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-100 dark:bg-purple-900',
  },
];

const actionNodes: DraggableNodeConfig[] = [
  {
    type: 'action',
    subType: 'webhook',
    label: 'HTTP Webhook',
    description: 'Send HTTP request to external API',
    icon: Globe,
    color: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-900',
  },
  {
    type: 'action',
    subType: 'jira',
    label: 'Create Jira Ticket',
    description: 'Create a ticket in Jira',
    icon: Ticket,
    color: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-900',
  },
  {
    type: 'action',
    subType: 'linear',
    label: 'Create Linear Issue',
    description: 'Create an issue in Linear',
    icon: ListTodo,
    color: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-100 dark:bg-violet-900',
  },
  {
    type: 'action',
    subType: 'runbook',
    label: 'Run Runbook',
    description: 'Execute an approved runbook',
    icon: BookOpen,
    color: 'text-green-600 dark:text-green-400',
    iconBg: 'bg-green-100 dark:bg-green-900',
  },
];

const flowControlNodes: DraggableNodeConfig[] = [
  {
    type: 'condition',
    label: 'Condition (If/Else)',
    description: 'Branch based on field value',
    icon: GitBranch,
    color: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-900',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before next action',
    icon: Timer,
    color: 'text-gray-600 dark:text-gray-400',
    iconBg: 'bg-gray-100 dark:bg-gray-800',
  },
];

// =============================================================================
// DRAGGABLE NODE ITEM
// =============================================================================

interface DraggableNodeItemProps {
  config: DraggableNodeConfig;
  disabled?: boolean;
}

function DraggableNodeItem({ config, disabled }: DraggableNodeItemProps) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }

    // Set drag data with node type and subtype
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: config.type,
        subType: config.subType,
        label: config.label,
      })
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const Icon = config.icon;

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border bg-card cursor-grab transition-all',
        'hover:shadow-md hover:border-primary/50',
        'active:cursor-grabbing active:shadow-lg',
        disabled && 'opacity-50 cursor-not-allowed hover:shadow-none hover:border-border'
      )}
      title={disabled ? 'Workflow already has a trigger' : config.description}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className={cn('p-2 rounded-md', config.iconBg)}>
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{config.label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {config.description}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

interface NodeSectionProps {
  title: string;
  badge?: string;
  nodes: DraggableNodeConfig[];
  defaultOpen?: boolean;
  disabledAll?: boolean;
}

function NodeSection({
  title,
  badge,
  nodes,
  defaultOpen = true,
  disabledAll = false,
}: NodeSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 hover:bg-muted/50 rounded-md">
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-semibold text-sm">{title}</span>
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        {nodes.map((node) => (
          <DraggableNodeItem
            key={`${node.type}-${node.subType || ''}`}
            config={node}
            disabled={disabledAll}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowSidebar({ onStartFromTemplate, hasTrigger }: SidebarProps) {
  return (
    <div className="w-72 border-r bg-background p-4 flex flex-col h-full overflow-hidden">
      {/* Header with template button */}
      <div className="mb-4">
        <h2 className="font-semibold text-lg mb-2">Node Palette</h2>
        {onStartFromTemplate && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={onStartFromTemplate}
          >
            <Sparkles className="h-4 w-4" />
            Start from Template
          </Button>
        )}
      </div>

      {/* Scrollable node sections */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        <NodeSection
          title="Triggers"
          badge="1 per workflow"
          nodes={triggerNodes}
          disabledAll={hasTrigger}
        />

        <NodeSection title="Actions" nodes={actionNodes} />

        <NodeSection title="Flow Control" nodes={flowControlNodes} />
      </div>

      {/* Help text */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          Drag nodes onto the canvas to build your workflow. Connect nodes by
          dragging from output handles to input handles.
        </p>
      </div>
    </div>
  );
}

export default WorkflowSidebar;
