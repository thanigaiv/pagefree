import { cn } from '@/lib/utils';

interface ComponentStatusBadgeProps {
  status: string;
  size?: 'sm' | 'default';
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; lightClass: string; solidClass: string }> = {
  OPERATIONAL: {
    label: 'Operational',
    lightClass: 'bg-green-100 text-green-800 border-green-200',
    solidClass: 'bg-green-500 hover:bg-green-600 text-white border-green-500',
  },
  DEGRADED_PERFORMANCE: {
    label: 'Degraded',
    lightClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    solidClass: 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500',
  },
  PARTIAL_OUTAGE: {
    label: 'Partial Outage',
    lightClass: 'bg-orange-100 text-orange-800 border-orange-200',
    solidClass: 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500',
  },
  MAJOR_OUTAGE: {
    label: 'Major Outage',
    lightClass: 'bg-red-100 text-red-800 border-red-200',
    solidClass: 'bg-red-500 hover:bg-red-600 text-white border-red-500',
  },
  UNDER_MAINTENANCE: {
    label: 'Maintenance',
    lightClass: 'bg-blue-100 text-blue-800 border-blue-200',
    solidClass: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500',
  },
};

export function ComponentStatusBadge({ status, size = 'default', className }: ComponentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    lightClass: 'bg-gray-100 text-gray-800 border-gray-200',
    solidClass: 'bg-gray-500 text-white border-gray-500',
  };

  // Use solid colors for small size (admin UI), light colors for default (public pages)
  const colorClass = size === 'sm' ? config.solidClass : config.lightClass;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        colorClass,
        size === 'sm' && 'px-2 py-0.5',
        className
      )}
    >
      {config.label}
    </span>
  );
}
