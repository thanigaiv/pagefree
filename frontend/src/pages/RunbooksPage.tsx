/**
 * RunbooksPage - Runbook list and management page
 *
 * Features:
 * - Grid of RunbookCards with responsive layout
 * - Filters: Team, Approval Status (DRAFT/APPROVED/DEPRECATED)
 * - Search by name/description
 * - Create/Edit dialog for CRUD operations
 * - Execution history panel
 * - Pagination
 * - Empty state
 */

import { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
  History,
  Edit,
  Trash2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Globe,
  Users,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  useRunbooks,
  useCreateRunbook,
  useUpdateRunbook,
  useDeleteRunbook,
  useRunbookExecutions,
  useExecuteRunbookStandalone,
  type Runbook,
  type CreateRunbookInput,
} from '@/hooks/useRunbooks';
import { useTeams } from '@/hooks/useTeams';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

type ApprovalStatusFilter = 'all' | 'DRAFT' | 'APPROVED' | 'DEPRECATED';

// =============================================================================
// RUNBOOK CARD
// =============================================================================

interface RunbookCardProps {
  runbook: Runbook;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onExecute: () => void;
}

function RunbookCard({
  runbook,
  onEdit,
  onDelete,
  onViewHistory,
  onExecute,
}: RunbookCardProps) {
  const statusColors: Record<string, string> = {
    DRAFT: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    APPROVED: 'bg-green-500/10 text-green-600 border-green-500/20',
    DEPRECATED: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {runbook.name}
            </CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {runbook.description || 'No description'}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewHistory}>
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="outline" className={cn('text-xs', statusColors[runbook.approvalStatus])}>
            {runbook.approvalStatus}
          </Badge>
          {runbook.teamId ? (
            <Badge variant="secondary" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              {runbook.team?.name || 'Team'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              <Globe className="h-3 w-3 mr-1" />
              Global
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            v{runbook.version}
          </Badge>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {runbook.webhookMethod} request
          </span>
          {runbook.approvalStatus === 'APPROVED' && (
            <Button size="sm" variant="outline" onClick={onExecute}>
              <Play className="h-3 w-3 mr-1" />
              Execute
            </Button>
          )}
          {runbook.approvalStatus === 'DRAFT' && (
            <span className="text-xs text-muted-foreground italic">
              Awaiting approval
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function RunbookCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex justify-between pt-2 border-t">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-20 rounded" />
      </div>
    </div>
  );
}

// =============================================================================
// CREATE/EDIT DIALOG
// =============================================================================

interface RunbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runbook?: Runbook;
  onSubmit: (data: CreateRunbookInput) => void;
  isSubmitting: boolean;
  teams: { id: string; name: string }[];
}

function RunbookDialog({
  open,
  onOpenChange,
  runbook,
  onSubmit,
  isSubmitting,
  teams,
}: RunbookDialogProps) {
  const [formData, setFormData] = useState<CreateRunbookInput>({
    name: runbook?.name || '',
    description: runbook?.description || '',
    teamId: runbook?.teamId || undefined,
    webhookUrl: runbook?.webhookUrl || '',
    webhookMethod: runbook?.webhookMethod || 'POST',
    payloadTemplate: runbook?.payloadTemplate || '',
    timeoutSeconds: runbook?.timeoutSeconds || 30,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when dialog opens with different runbook
  useState(() => {
    if (open) {
      setFormData({
        name: runbook?.name || '',
        description: runbook?.description || '',
        teamId: runbook?.teamId || undefined,
        webhookUrl: runbook?.webhookUrl || '',
        webhookMethod: runbook?.webhookMethod || 'POST',
        payloadTemplate: runbook?.payloadTemplate || '',
        timeoutSeconds: runbook?.timeoutSeconds || 30,
      });
      setErrors({});
    }
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.webhookUrl.trim()) {
      newErrors.webhookUrl = 'Webhook URL is required';
    } else {
      try {
        new URL(formData.webhookUrl);
      } catch {
        newErrors.webhookUrl = 'Must be a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {runbook ? 'Edit Runbook' : 'Create Runbook'}
          </DialogTitle>
          <DialogDescription>
            {runbook
              ? 'Modify the runbook configuration. Changes will create a new version.'
              : 'Create a new runbook to automate operational tasks.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Restart Service"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this runbook does..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team">Team (optional)</Label>
            <Select
              value={formData.teamId || 'global'}
              onValueChange={(v) => setFormData({ ...formData, teamId: v === 'global' ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team or global" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Global (all teams)
                  </div>
                </SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL *</Label>
              <Input
                id="webhookUrl"
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                placeholder="https://api.example.com/webhook"
                className={errors.webhookUrl ? 'border-destructive' : ''}
              />
              {errors.webhookUrl && (
                <p className="text-xs text-destructive">{errors.webhookUrl}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookMethod">HTTP Method</Label>
              <Select
                value={formData.webhookMethod}
                onValueChange={(v: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') =>
                  setFormData({ ...formData, webhookMethod: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payloadTemplate">Payload Template (JSON)</Label>
            <Textarea
              id="payloadTemplate"
              value={formData.payloadTemplate}
              onChange={(e) => setFormData({ ...formData, payloadTemplate: e.target.value })}
              placeholder='{"action": "restart", "service": "{{service_name}}"}'
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{parameter_name}}'} for dynamic values
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeout">Timeout (seconds)</Label>
            <Input
              id="timeout"
              type="number"
              min={1}
              max={300}
              value={formData.timeoutSeconds}
              onChange={(e) => setFormData({ ...formData, timeoutSeconds: parseInt(e.target.value) || 30 })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {runbook ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// EXECUTION HISTORY PANEL
// =============================================================================

interface ExecutionHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runbook: Runbook | null;
}

function ExecutionHistoryPanel({ open, onOpenChange, runbook }: ExecutionHistoryPanelProps) {
  const { data: executions, isLoading } = useRunbookExecutions(runbook?.id);

  const statusIcons: Record<string, React.ReactNode> = {
    PENDING: <Clock className="h-4 w-4 text-muted-foreground" />,
    RUNNING: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    SUCCESS: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    FAILED: <XCircle className="h-4 w-4 text-red-500" />,
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-muted text-muted-foreground',
    RUNNING: 'bg-blue-500/10 text-blue-600',
    SUCCESS: 'bg-green-500/10 text-green-600',
    FAILED: 'bg-red-500/10 text-red-600',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Execution History</DialogTitle>
          <DialogDescription>
            {runbook?.name || 'Runbook'} - Recent executions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (!executions || executions.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No executions yet</p>
              <p className="text-sm mt-1">
                Executions will appear here once the runbook is triggered.
              </p>
            </div>
          )}

          {!isLoading && executions && executions.length > 0 && (
            <div className="space-y-3">
              {executions.map((execution) => (
                <Card key={execution.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {statusIcons[execution.status]}
                      <Badge variant="outline" className={cn('text-xs', statusColors[execution.status])}>
                        {execution.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(execution.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="mt-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Triggered by:</span>
                      <Badge variant="secondary" className="text-xs">
                        {execution.triggeredBy}
                      </Badge>
                      {execution.executedBy && (
                        <span className="text-xs">
                          {execution.executedBy.firstName} {execution.executedBy.lastName}
                        </span>
                      )}
                    </div>

                    {execution.incident && (
                      <div className="flex items-center gap-2 mt-1">
                        <AlertCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Incident: {execution.incident.id.slice(0, 8)}...
                        </span>
                      </div>
                    )}

                    {execution.completedAt && (
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Duration: {Math.round((new Date(execution.completedAt).getTime() - new Date(execution.createdAt).getTime()) / 1000)}s
                        </span>
                      </div>
                    )}

                    {execution.error && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
                        {execution.error}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// EXECUTE RUNBOOK DIALOG
// =============================================================================

interface ExecuteRunbookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runbook: Runbook | null;
  onExecute: (runbookId: string, parameters: Record<string, unknown>) => void;
  isExecuting: boolean;
}

function ExecuteRunbookDialog({
  open,
  onOpenChange,
  runbook,
  onExecute,
  isExecuting,
}: ExecuteRunbookDialogProps) {
  const [parameters, setParameters] = useState<Record<string, string>>({});

  if (!runbook) return null;

  const paramProperties = runbook.parameters?.properties || {};
  const requiredParams = runbook.parameters?.required || [];

  const handleExecute = () => {
    // Convert string values to appropriate types
    const typedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      const propDef = paramProperties[key];
      if (propDef?.type === 'number') {
        typedParams[key] = parseFloat(value);
      } else if (propDef?.type === 'boolean') {
        typedParams[key] = value === 'true';
      } else {
        typedParams[key] = value;
      }
    }
    onExecute(runbook.id, typedParams);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Execute Runbook</DialogTitle>
          <DialogDescription>
            Execute "{runbook.name}". This action will be logged.
          </DialogDescription>
        </DialogHeader>

        {Object.keys(paramProperties).length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure parameters for this execution:
            </p>
            {Object.entries(paramProperties).map(([key, prop]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
                  {key}
                  {requiredParams.includes(key) && <span className="text-destructive">*</span>}
                </Label>
                {prop.description && (
                  <p className="text-xs text-muted-foreground">{prop.description}</p>
                )}
                {prop.enum ? (
                  <Select
                    value={parameters[key] || String(prop.default || '')}
                    onValueChange={(v) => setParameters({ ...parameters, [key]: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select value" />
                    </SelectTrigger>
                    <SelectContent>
                      {prop.enum.map((opt) => (
                        <SelectItem key={String(opt)} value={String(opt)}>
                          {String(opt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={key}
                    type={prop.type === 'number' ? 'number' : 'text'}
                    value={parameters[key] || String(prop.default || '')}
                    onChange={(e) => setParameters({ ...parameters, [key]: e.target.value })}
                    placeholder={prop.type === 'boolean' ? 'true or false' : `Enter ${prop.type}`}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This runbook has no parameters. Click Execute to run it.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExecute} disabled={isExecuting}>
            {isExecuting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RunbooksPage() {
  const { toast } = useToast();

  // Filters
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 12;

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState<Runbook | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Runbook | null>(null);
  const [historyRunbook, setHistoryRunbook] = useState<Runbook | null>(null);
  const [executeRunbook, setExecuteRunbook] = useState<Runbook | null>(null);

  // Data fetching
  const {
    data: runbooksData,
    isLoading,
    error,
  } = useRunbooks({
    teamId: teamFilter === 'all' ? undefined : teamFilter,
    approvalStatus: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit,
  });

  const { data: teams } = useTeams();

  // Mutations
  const createRunbook = useCreateRunbook();
  const updateRunbook = useUpdateRunbook();
  const deleteRunbook = useDeleteRunbook();
  const executeStandalone = useExecuteRunbookStandalone();

  // Client-side search filter
  const filteredRunbooks = useMemo(() => {
    if (!runbooksData?.runbooks) return [];
    if (!searchQuery.trim()) return runbooksData.runbooks;

    const query = searchQuery.toLowerCase();
    return runbooksData.runbooks.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query)
    );
  }, [runbooksData?.runbooks, searchQuery]);

  // Check for any active filters
  const hasActiveFilters = teamFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim();

  // Reset filters
  const resetFilters = () => {
    setTeamFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setPage(1);
  };

  // Handlers
  const handleCreate = async (data: CreateRunbookInput) => {
    try {
      await createRunbook.mutateAsync(data);
      setCreateDialogOpen(false);
      toast({
        title: 'Runbook created',
        description: 'The runbook has been created and is awaiting approval.',
      });
    } catch (err) {
      toast({
        title: 'Failed to create runbook',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async (data: CreateRunbookInput) => {
    if (!editingRunbook) return;
    try {
      await updateRunbook.mutateAsync({ id: editingRunbook.id, ...data });
      setEditingRunbook(null);
      toast({
        title: 'Runbook updated',
        description: 'A new version has been created.',
      });
    } catch (err) {
      toast({
        title: 'Failed to update runbook',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRunbook.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast({
        title: 'Runbook deleted',
        description: 'The runbook has been permanently deleted.',
      });
    } catch (err) {
      toast({
        title: 'Failed to delete runbook',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleExecute = async (runbookId: string, parameters: Record<string, unknown>) => {
    try {
      await executeStandalone.mutateAsync({ runbookId, parameters });
      setExecuteRunbook(null);
      toast({
        title: 'Runbook execution started',
        description: 'The runbook is now executing. Check the history for results.',
      });
    } catch (err) {
      toast({
        title: 'Failed to execute runbook',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Pagination
  const totalPages = Math.ceil((runbooksData?.total || 0) / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Runbooks</h1>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Runbook
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search runbooks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Team filter */}
        <Select
          value={teamFilter}
          onValueChange={(v) => {
            setTeamFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams?.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v: ApprovalStatusFilter) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="DEPRECATED">Deprecated</SelectItem>
          </SelectContent>
        </Select>

        {/* Reset filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <RunbookCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load runbooks. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && filteredRunbooks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No runbooks yet</p>
          <p className="text-sm mt-1">
            {hasActiveFilters
              ? 'Try adjusting your filters or search query.'
              : 'Create one to automate operational tasks.'}
          </p>
          {!hasActiveFilters && (
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Runbook
            </Button>
          )}
        </div>
      )}

      {/* Runbook grid */}
      {!isLoading && filteredRunbooks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRunbooks.map((runbook) => (
            <RunbookCard
              key={runbook.id}
              runbook={runbook}
              onEdit={() => setEditingRunbook(runbook)}
              onDelete={() => setDeleteTarget(runbook)}
              onViewHistory={() => setHistoryRunbook(runbook)}
              onExecute={() => setExecuteRunbook(runbook)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={!hasPrevPage}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-4">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <RunbookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreate}
        isSubmitting={createRunbook.isPending}
        teams={teams || []}
      />

      {/* Edit Dialog */}
      <RunbookDialog
        open={!!editingRunbook}
        onOpenChange={(open) => !open && setEditingRunbook(null)}
        runbook={editingRunbook || undefined}
        onSubmit={handleUpdate}
        isSubmitting={updateRunbook.isPending}
        teams={teams || []}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Runbook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action
              cannot be undone. All execution history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Execution History Panel */}
      <ExecutionHistoryPanel
        open={!!historyRunbook}
        onOpenChange={(open) => !open && setHistoryRunbook(null)}
        runbook={historyRunbook}
      />

      {/* Execute Runbook Dialog */}
      <ExecuteRunbookDialog
        open={!!executeRunbook}
        onOpenChange={(open) => !open && setExecuteRunbook(null)}
        runbook={executeRunbook}
        onExecute={handleExecute}
        isExecuting={executeStandalone.isPending}
      />
    </div>
  );
}
