import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface ServiceNodeData {
  name: string;
  teamName: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  isFocused?: boolean;
}

const statusStyles = {
  ACTIVE: 'bg-green-50 border-green-300 text-green-800',
  DEPRECATED: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  ARCHIVED: 'bg-gray-100 border-gray-300 text-gray-500'
};

function ServiceNodeComponent({ data, selected }: NodeProps<ServiceNodeData>) {
  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px]
        ${statusStyles[data.status]}
        ${selected ? 'ring-2 ring-blue-500' : ''}
        ${data.isFocused ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400"
      />
      <div className="font-medium text-sm truncate">{data.name}</div>
      <div className="text-xs opacity-70 truncate">{data.teamName}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400"
      />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);
