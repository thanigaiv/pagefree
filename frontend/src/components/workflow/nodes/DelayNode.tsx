/**
 * DelayNode - Custom React Flow node for configurable delays
 *
 * Shows duration in human-readable format.
 * Clock icon with gray color scheme for delays.
 * Input handle at top, output handle at bottom.
 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DelayData } from '@/types/workflow';

/**
 * Format duration in minutes to human-readable string
 */
function formatDuration(minutes: number): string {
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} seconds`;
  }
  if (minutes === 1) {
    return '1 minute';
  }
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

type DelayNodeProps = NodeProps<Node<DelayData>>;

export function DelayNode({ data, selected }: DelayNodeProps) {
  const hasValidationError = !data.name || !data.durationMinutes || data.durationMinutes <= 0;
  const formattedDuration = data.durationMinutes ? formatDuration(data.durationMinutes) : 'Not set';

  return (
    <Card
      className={cn(
        'min-w-[160px] p-3 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900',
        'border-2 border-gray-200 dark:border-gray-700',
        selected && 'ring-2 ring-gray-500 ring-offset-2',
        hasValidationError && 'border-red-300 dark:border-red-700'
      )}
    >
      {/* Input handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-500 !border-gray-300 !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800">
          <Timer className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
            {data.name || 'Wait'}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Delay</p>
        </div>
        {hasValidationError && (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
      </div>

      {/* Duration display */}
      <div className="flex justify-center mt-2">
        <Badge
          variant="secondary"
          className="text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <Timer className="h-3 w-3 mr-1" />
          {formattedDuration}
        </Badge>
      </div>

      {/* Output handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-500 !border-gray-300 !w-3 !h-3"
      />
    </Card>
  );
}

export default DelayNode;
