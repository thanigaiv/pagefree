/**
 * RunbookExecutionModal - Modal for manual runbook execution
 *
 * Features (per AUTO-10):
 * - Runbook selection dropdown (filtered by team scope)
 * - Parameter input form
 * - Confirmation dialog before execution
 * - Execution status feedback
 */

import { useState } from 'react';
import { BookOpen, Play, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useApprovedRunbooks,
  useRunbook,
  useExecuteRunbook,
} from '@/hooks/useRunbooks';

interface RunbookExecutionModalProps {
  incidentId: string;
  teamId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RunbookExecutionModal({
  incidentId,
  teamId,
  isOpen,
  onClose
}: RunbookExecutionModalProps) {
  const { toast } = useToast();
  const [selectedRunbookId, setSelectedRunbookId] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch runbooks - filter by team scope (team-specific + global)
  const { data: runbooks, isLoading: loadingRunbooks } = useApprovedRunbooks(teamId);
  const { data: selectedRunbook } = useRunbook(selectedRunbookId || undefined);
  const executeRunbook = useExecuteRunbook(incidentId);

  const handleRunbookSelect = (runbookId: string) => {
    setSelectedRunbookId(runbookId);
    setParameters({}); // Reset parameters when runbook changes
  };

  const handleParameterChange = (key: string, value: unknown) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  };

  const handleExecute = async () => {
    setShowConfirm(false);

    try {
      await executeRunbook.mutateAsync({
        runbookId: selectedRunbookId,
        parameters
      });

      toast({
        title: 'Runbook triggered',
        description: `${selectedRunbook?.name} has been scheduled for execution.`,
      });

      // Reset and close
      setSelectedRunbookId('');
      setParameters({});
      onClose();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Unknown error';
      toast({
        title: 'Execution failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setSelectedRunbookId('');
    setParameters({});
    onClose();
  };

  // Filter runbooks to show team-scoped (matching team) + global (no team)
  const filteredRunbooks = runbooks?.filter(
    (rb) => rb.teamId === null || rb.teamId === teamId
  );

  const renderParameterInputs = () => {
    if (!selectedRunbook?.parameters?.properties) return null;

    const { properties, required = [] } = selectedRunbook.parameters;

    return Object.entries(properties).map(([key, prop]) => {
      const isRequired = required.includes(key);
      const value = parameters[key] ?? prop.default ?? '';

      return (
        <div key={key} className="space-y-1">
          <Label>
            {key} {isRequired && <span className="text-red-500">*</span>}
          </Label>
          {prop.description && (
            <p className="text-xs text-muted-foreground">{prop.description}</p>
          )}
          {prop.enum ? (
            <Select
              value={String(value)}
              onValueChange={(v) =>
                handleParameterChange(key, prop.type === 'number' ? Number(v) : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${key}`} />
              </SelectTrigger>
              <SelectContent>
                {prop.enum.map((opt) => (
                  <SelectItem key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : prop.type === 'boolean' ? (
            <Select
              value={String(value)}
              onValueChange={(v) => handleParameterChange(key, v === 'true')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={prop.type === 'number' ? 'number' : 'text'}
              value={String(value)}
              onChange={(e) =>
                handleParameterChange(
                  key,
                  prop.type === 'number' ? Number(e.target.value) : e.target.value
                )
              }
              placeholder={prop.default !== undefined ? `Default: ${prop.default}` : undefined}
            />
          )}
        </div>
      );
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              Run Runbook
            </DialogTitle>
            <DialogDescription>
              Select and execute an approved runbook for this incident.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Runbook selector */}
            <div className="space-y-2">
              <Label>Runbook</Label>
              <Select
                value={selectedRunbookId}
                onValueChange={handleRunbookSelect}
                disabled={loadingRunbooks}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingRunbooks ? 'Loading...' : 'Select runbook'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredRunbooks?.map((rb) => (
                    <SelectItem key={rb.id} value={rb.id}>
                      <div className="flex items-center gap-2">
                        <span>{rb.name}</span>
                        {rb.teamId === null && (
                          <Badge variant="outline" className="text-xs">Global</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {filteredRunbooks?.length === 0 && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No approved runbooks available for this team
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Selected runbook info */}
            {selectedRunbook && (
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="font-medium">{selectedRunbook.name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {selectedRunbook.description}
                </div>
                <Badge variant="secondary" className="mt-2 text-xs">
                  v{selectedRunbook.version}
                </Badge>
              </div>
            )}

            {/* Parameters */}
            {selectedRunbook && Object.keys(selectedRunbook.parameters?.properties || {}).length > 0 && (
              <div className="space-y-3">
                <Label>Parameters</Label>
                {renderParameterInputs()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!selectedRunbookId || executeRunbook.isPending}
            >
              {executeRunbook.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog (AUTO-10 requirement) */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Confirm Runbook Execution
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to execute <strong>{selectedRunbook?.name}</strong>?
              This will trigger the runbook&apos;s webhook and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecute}>
              Yes, Execute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
