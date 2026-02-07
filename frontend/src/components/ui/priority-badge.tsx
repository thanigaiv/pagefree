import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Flame, AlertTriangle, AlertCircle, Info } from 'lucide-react';

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

const priorityConfig: Record<Priority, {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = {
  CRITICAL: {
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950',
    borderColor: 'border-l-red-500',
    icon: Flame,
    label: 'Critical',
  },
  HIGH: {
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    borderColor: 'border-l-orange-500',
    icon: AlertTriangle,
    label: 'High',
  },
  MEDIUM: {
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    borderColor: 'border-l-yellow-500',
    icon: AlertCircle,
    label: 'Medium',
  },
  LOW: {
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    borderColor: 'border-l-blue-500',
    icon: Info,
    label: 'Low',
  },
  INFO: {
    color: 'text-gray-700 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    borderColor: 'border-l-gray-400',
    icon: Info,
    label: 'Info',
  },
};

interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.INFO;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        config.color,
        config.bgColor,
        'border-0 gap-1',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

export function getPriorityBorderClass(priority: Priority): string {
  return priorityConfig[priority]?.borderColor || priorityConfig.INFO.borderColor;
}
