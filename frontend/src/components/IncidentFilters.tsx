import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { IncidentFilters as Filters } from '@/hooks/useUrlState';
import { Filter, X } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'INFO', label: 'Info' },
];

interface IncidentFiltersProps {
  filters: Filters;
  onUpdateFilters: (filters: Partial<Filters>) => void;
  onClearFilters: () => void;
}

export function IncidentFilters({
  filters,
  onUpdateFilters,
  onClearFilters,
}: IncidentFiltersProps) {
  const activeFilterCount =
    (filters.status?.length || 0) + (filters.priority?.length || 0);

  const handleStatusChange = (value: string, checked: boolean) => {
    const current = filters.status || [];
    const updated = checked
      ? [...current, value]
      : current.filter((s) => s !== value);
    onUpdateFilters({ status: updated.length ? updated : undefined, page: 1 });
  };

  const handlePriorityChange = (value: string, checked: boolean) => {
    const current = filters.priority || [];
    const updated = checked
      ? [...current, value]
      : current.filter((p) => p !== value);
    onUpdateFilters({ priority: updated.length ? updated : undefined, page: 1 });
  };

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            {/* Status filters */}
            <div>
              <h4 className="font-medium text-sm mb-2">Status</h4>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.status?.includes(option.value) || false}
                      onCheckedChange={(checked) =>
                        handleStatusChange(option.value, !!checked)
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Priority filters */}
            <div>
              <h4 className="font-medium text-sm mb-2">Priority</h4>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.priority?.includes(option.value) || false}
                      onCheckedChange={(checked) =>
                        handlePriorityChange(option.value, !!checked)
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="gap-1"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
