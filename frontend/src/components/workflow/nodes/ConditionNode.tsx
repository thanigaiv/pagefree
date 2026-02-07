/**
 * ConditionNode - Custom React Flow node for if/else branching
 *
 * Distinctive diamond-like visual for branching decisions.
 * Shows condition: field operator value
 * Two output handles: 'true' (right/green) and 'false' (left/red)
 * Yellow/amber color scheme for conditions.
 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConditionData } from '@/types/workflow';

type ConditionNodeProps = NodeProps<Node<ConditionData>>;

export function ConditionNode({ data, selected }: ConditionNodeProps) {
  const hasValidationError = !data.name || !data.field || !data.value;

  return (
    <Card
      className={cn(
        'min-w-[180px] p-3 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950',
        'border-2 border-amber-200 dark:border-amber-800',
        // Diamond shape hint with rotated clip
        'relative',
        selected && 'ring-2 ring-amber-500 ring-offset-2',
        hasValidationError && 'border-red-300 dark:border-red-700'
      )}
    >
      {/* Input handle at top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-500 !border-amber-300 !w-3 !h-3"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900">
          <GitBranch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100 truncate">
            {data.name || 'Condition'}
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400">If/Else Branch</p>
        </div>
        {hasValidationError && (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
      </div>

      {/* Condition display */}
      <div className="bg-white dark:bg-amber-900/50 rounded-md p-2 text-center">
        <code className="text-xs font-mono text-amber-800 dark:text-amber-200">
          {data.field || 'field'} {data.operator || '='} {data.value || 'value'}
        </code>
      </div>

      {/* Output handles with labels */}
      <div className="flex justify-between mt-3 text-xs">
        {/* False path - left */}
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <XCircle className="h-3 w-3" />
          <span>False</span>
        </div>
        {/* True path - right */}
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <span>True</span>
          <CheckCircle className="h-3 w-3" />
        </div>
      </div>

      {/* False output handle - left side */}
      <Handle
        type="source"
        position={Position.Left}
        id="false"
        className="!bg-red-500 !border-red-300 !w-3 !h-3"
        style={{ top: '75%' }}
      />

      {/* True output handle - right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!bg-green-500 !border-green-300 !w-3 !h-3"
        style={{ top: '75%' }}
      />
    </Card>
  );
}

export default ConditionNode;
