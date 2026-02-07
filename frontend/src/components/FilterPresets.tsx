import { usePreferences, useSaveFiltersAsDefault } from '@/hooks/usePreferences';
import type { IncidentFilters } from '@/hooks/useUrlState';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Save, RotateCcw, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface FilterPresetsProps {
  currentFilters: IncidentFilters;
  onApplyPreset: (filters: Partial<IncidentFilters>) => void;
  onClearFilters: () => void;
}

// Predefined quick filters
const QUICK_FILTERS = [
  {
    name: 'Active Incidents',
    filters: { status: ['OPEN', 'ACKNOWLEDGED'] },
  },
  {
    name: 'Critical Only',
    filters: { status: ['OPEN', 'ACKNOWLEDGED'], priority: ['CRITICAL', 'HIGH'] },
  },
  {
    name: 'Needs Attention',
    filters: { status: ['OPEN'] },
  },
  {
    name: 'Recently Resolved',
    filters: { status: ['RESOLVED'] },
  },
];

export function FilterPresets({
  currentFilters,
  onApplyPreset,
  onClearFilters,
}: FilterPresetsProps) {
  const { data: preferences } = usePreferences();
  const saveAsDefault = useSaveFiltersAsDefault();

  const handleSaveAsDefault = () => {
    saveAsDefault(currentFilters);
  };

  const handleApplyDefault = () => {
    if (preferences?.dashboard?.defaultFilters) {
      onApplyPreset({
        status: preferences.dashboard.defaultFilters.status,
        priority: preferences.dashboard.defaultFilters.priority,
        teamId: preferences.dashboard.defaultFilters.teamId,
        sort: preferences.dashboard.defaultSort,
        page: 1,
      });
      toast.info('Applied saved filters');
    }
  };

  const hasDefaultFilters = !!preferences?.dashboard?.defaultFilters;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Presets
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {/* Quick filters */}
        {QUICK_FILTERS.map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onClick={() => onApplyPreset({ ...preset.filters, page: 1 })}
          >
            {preset.name}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Saved default */}
        {hasDefaultFilters && (
          <DropdownMenuItem onClick={handleApplyDefault}>
            <RotateCcw className="h-4 w-4 mr-2" />
            My Saved Filters
          </DropdownMenuItem>
        )}

        {/* Save current */}
        <DropdownMenuItem onClick={handleSaveAsDefault}>
          <Save className="h-4 w-4 mr-2" />
          Save Current as Default
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Clear */}
        <DropdownMenuItem onClick={onClearFilters}>
          Clear All Filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
