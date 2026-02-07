/**
 * WorkflowToolbar - Actions toolbar for workflow builder
 *
 * Provides actions for workflow management:
 * - Save (with dirty state tracking)
 * - Test mode button
 * - Toggle enabled/disabled
 * - Export dropdown (JSON export, duplicate)
 * - Version history button
 *
 * Per user decisions:
 * - Real-time validation feedback
 * - Toggle enabled/disabled without deletion
 * - JSON export/import
 * - Version history with rollback
 */

import { useState } from 'react';
import {
  Save,
  Play,
  Download,
  Copy,
  History,
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Power,
  PowerOff,
  MoreVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Workflow } from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface ToolbarProps {
  workflow: Workflow;
  isDirty: boolean;
  isSaving?: boolean;
  isValidating?: boolean;
  validationErrors: string[];
  onSave: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onExport: () => void;
  onDuplicate: () => void;
  onVersionHistory: () => void;
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

function formatLastSaved(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  return date.toLocaleDateString();
}

// =============================================================================
// VALIDATION ERRORS POPOVER
// =============================================================================

interface ValidationErrorsProps {
  errors: string[];
}

function ValidationErrorsPopover({ errors }: ValidationErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700">
          <AlertCircle className="h-4 w-4" />
          <Badge variant="destructive" className="h-5 px-1.5">
            {errors.length}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Validation Errors
          </h4>
          <ul className="space-y-1">
            {errors.map((error, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-red-500 mt-0.5">-</span>
                <span>{error}</span>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowToolbar({
  workflow,
  isDirty,
  isSaving = false,
  isValidating = false,
  validationErrors,
  onSave,
  onTest,
  onToggle,
  onExport,
  onDuplicate,
  onVersionHistory,
}: ToolbarProps) {
  const hasErrors = validationErrors.length > 0;
  const canSave = isDirty && !hasErrors && !isSaving;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
      {/* Left: Workflow metadata */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="font-semibold text-lg">{workflow.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>v{workflow.version}</span>
            <span className="text-muted-foreground/50">|</span>
            <span>Saved {formatLastSaved(workflow.updatedAt)}</span>
            {isDirty && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Unsaved changes
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Validation errors */}
        <ValidationErrorsPopover errors={validationErrors} />

        {/* Validation status indicator */}
        {isValidating && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Validating...</span>
          </div>
        )}

        {!hasErrors && !isValidating && (
          <div className="flex items-center gap-1.5 text-green-600 text-sm">
            <Check className="h-4 w-4" />
            <span>Valid</span>
          </div>
        )}

        <div className="h-6 w-px bg-border mx-1" />

        {/* Enable/Disable toggle */}
        <div className="flex items-center gap-2 px-2">
          <Switch
            id="workflow-enabled"
            checked={workflow.isEnabled}
            onCheckedChange={onToggle}
          />
          <Label htmlFor="workflow-enabled" className="text-sm cursor-pointer">
            {workflow.isEnabled ? (
              <span className="flex items-center gap-1 text-green-600">
                <Power className="h-3.5 w-3.5" />
                Enabled
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <PowerOff className="h-3.5 w-3.5" />
                Disabled
              </span>
            )}
          </Label>
        </div>

        <div className="h-6 w-px bg-border mx-1" />

        {/* Test button */}
        <Button variant="outline" size="sm" onClick={onTest}>
          <Play className="h-4 w-4 mr-1.5" />
          Test
        </Button>

        {/* Save button */}
        <Button
          size="sm"
          onClick={onSave}
          disabled={!canSave}
          className={cn(
            isDirty && canSave && 'animate-pulse bg-primary'
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </>
          )}
        </Button>

        {/* More actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onVersionHistory}>
              <History className="h-4 w-4 mr-2" />
              Version History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default WorkflowToolbar;
