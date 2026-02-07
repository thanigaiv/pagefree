/**
 * TriggerNode - Custom React Flow node for workflow triggers
 *
 * Displays trigger type (incident_created, state_changed, escalation, manual, age)
 * with conditions visualized as badges. Purple/indigo color scheme for triggers.
 * Source handle at bottom only (trigger is always first node).
 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, RefreshCw, ArrowUp, Hand, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TriggerData, TriggerType, TriggerCondition } from '@/types/workflow';

// Icon mapping for trigger types
const triggerIcons: Record<TriggerType, React.ElementType> = {
  incident_created: Zap,
  state_changed: RefreshCw,
  escalation: ArrowUp,
  manual: Hand,
  age: Clock,
};

// Human-readable trigger type labels
const triggerLabels: Record<TriggerType, string> = {
  incident_created: 'Incident Created',
  state_changed: 'State Changed',
  escalation: 'Escalation',
  manual: 'Manual Trigger',
  age: 'Incident Age',
};

type TriggerNodeProps = NodeProps<Node<TriggerData>>;

export function TriggerNode({ data, selected }: TriggerNodeProps) {
  const Icon = triggerIcons[data.triggerType] || Zap;
  const label = triggerLabels[data.triggerType] || data.triggerType;
  const hasValidationError = !data.name || !data.triggerType;

  return (
    <Card
      className={cn(
        'min-w-[200px] p-3 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950',
        'border-2 border-purple-200 dark:border-purple-800',
        selected && 'ring-2 ring-purple-500 ring-offset-2',
        hasValidationError && 'border-red-300 dark:border-red-700'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900">
          <Icon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-purple-900 dark:text-purple-100 truncate">
            {data.name || 'Untitled Trigger'}
          </h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">{label}</p>
        </div>
        {hasValidationError && (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
      </div>

      {/* Conditions */}
      {data.conditions && data.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {data.conditions.map((condition: TriggerCondition, index: number) => (
            <Badge
              key={index}
              variant="secondary"
              className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
            >
              {condition.field} = {condition.value}
            </Badge>
          ))}
        </div>
      )}

      {/* Age threshold for age trigger */}
      {data.triggerType === 'age' && data.ageThresholdMinutes && (
        <div className="mt-2">
          <Badge
            variant="outline"
            className="text-xs border-purple-300 dark:border-purple-700"
          >
            After {data.ageThresholdMinutes} minutes
          </Badge>
        </div>
      )}

      {/* State transition for state_changed trigger */}
      {data.triggerType === 'state_changed' && data.stateTransition && (
        <div className="mt-2">
          <Badge
            variant="outline"
            className="text-xs border-purple-300 dark:border-purple-700"
          >
            {data.stateTransition.from && `${data.stateTransition.from} → `}
            {data.stateTransition.to}
          </Badge>
        </div>
      )}

      {/* Source handle at bottom only - triggers are always first */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-500 !border-purple-300 !w-3 !h-3"
      />
    </Card>
  );
}

export default TriggerNode;
