/**
 * WorkflowsPage - Workflow list and management page
 *
 * Features:
 * - Grid of WorkflowCards with responsive layout
 * - Filters: Scope (All/Team/Global), Status (All/Enabled/Disabled)
 * - Team selector for multi-team users
 * - Search by name
 * - Template Library tab with category filters
 * - Pagination
 * - Empty state
 * - Permission-based create button
 *
 * Per user decisions:
 * - Template library organized by categories (Ticketing, Communication, Auto-resolution)
 * - Search/filter for templates
 * - Workflow duplication enabled
 * - Team admin permissions for create/edit
 */

import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Loader2,
  Workflow,
  Library,
  ChevronLeft,
  ChevronRight,
  Zap,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { WorkflowCard } from '@/components/workflow/WorkflowCard';
import {
  useWorkflows,
  useToggleWorkflow,
  useDuplicateWorkflow,
  useDeleteWorkflow,
  useWorkflowTemplates,
  useCreateFromTemplate,
  useWorkflowAnalytics,
} from '@/hooks/useWorkflows';
import type {
  WorkflowScope,
  TemplateCategory,
  Workflow as WorkflowType,
  WorkflowTemplate,
} from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

type ScopeFilter = 'all' | WorkflowScope;
type StatusFilter = 'all' | 'enabled' | 'disabled';

// =============================================================================
// TEMPLATE CARD
// =============================================================================

interface TemplateCardProps {
  template: WorkflowTemplate;
  onUse: () => void;
  isCreating: boolean;
}

function TemplateCard({ template, onUse, isCreating }: TemplateCardProps) {
  const categoryIcons: Record<TemplateCategory, React.ReactNode> = {
    Ticketing: <Zap className="h-4 w-4" />,
    Communication: <MessageSquare className="h-4 w-4" />,
    'Auto-resolution': <RotateCcw className="h-4 w-4" />,
  };

  return (
    <div className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10 text-primary">
            {categoryIcons[template.category]}
          </div>
          <h3 className="font-medium">{template.name}</h3>
        </div>
        <Badge variant="outline" className="text-xs">
          {template.category}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
        {template.description}
      </p>
      <Button
        size="sm"
        onClick={onUse}
        disabled={isCreating}
        className="w-full"
      >
        {isCreating ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <Plus className="h-4 w-4 mr-1" />
        )}
        Use Template
      </Button>
    </div>
  );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function WorkflowCardSkeleton() {
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
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function WorkflowsPage() {
  const navigate = useNavigate();

  // Filters
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 12;

  // Template filters
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory | 'all'>('all');
  const [templateSearch, setTemplateSearch] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<WorkflowType | null>(null);

  // Creating from template state
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  // Data fetching
  const {
    data: workflowsData,
    isLoading,
    error,
  } = useWorkflows({
    scopeType: scopeFilter === 'all' ? undefined : scopeFilter,
    isEnabled: statusFilter === 'all' ? undefined : statusFilter === 'enabled',
    page,
    limit,
  });

  const { data: templatesData, isLoading: templatesLoading } = useWorkflowTemplates({
    category: templateCategory === 'all' ? undefined : templateCategory,
    search: templateSearch || undefined,
  });

  // Mutations
  const toggleWorkflow = useToggleWorkflow();
  const duplicateWorkflow = useDuplicateWorkflow();
  const deleteWorkflow = useDeleteWorkflow();
  const createFromTemplate = useCreateFromTemplate();

  // Filter workflows by search query client-side
  const filteredWorkflows = useMemo(() => {
    if (!workflowsData?.workflows) return [];
    if (!searchQuery.trim()) return workflowsData.workflows;

    const query = searchQuery.toLowerCase();
    return workflowsData.workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query)
    );
  }, [workflowsData?.workflows, searchQuery]);

  // Permission error check
  const isPermissionError =
    error instanceof Error &&
    (error.message.includes('403') || error.message.includes('Forbidden'));

  if (isPermissionError) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to view workflows.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handlers
  const handleToggle = (workflow: WorkflowType, enabled: boolean) => {
    toggleWorkflow.mutate({ id: workflow.id, enabled });
  };

  const handleDuplicate = async (workflow: WorkflowType) => {
    const result = await duplicateWorkflow.mutateAsync(workflow.id);
    navigate(`/workflows/${result.workflow.id}`);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteWorkflow.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleUseTemplate = async (templateId: string) => {
    setCreatingTemplateId(templateId);
    try {
      const result = await createFromTemplate.mutateAsync({
        templateId,
        name: 'New Workflow from Template',
        description: 'Created from template - customize as needed',
      });
      navigate(`/workflows/${result.workflow.id}`);
    } finally {
      setCreatingTemplateId(null);
    }
  };

  // Pagination
  const totalPages = Math.ceil((workflowsData?.total || 0) / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Workflow className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Workflows</h1>
        </div>
        <Button asChild>
          <Link to="/workflows/new">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Workflow
          </Link>
        </Button>
      </div>

      {/* Tabs: My Workflows | Template Library */}
      <Tabs defaultValue="workflows" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflows" className="gap-1.5">
            <Workflow className="h-4 w-4" />
            My Workflows
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <Library className="h-4 w-4" />
            Template Library
          </TabsTrigger>
        </TabsList>

        {/* My Workflows Tab */}
        <TabsContent value="workflows" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Scope filter */}
            <Select
              value={scopeFilter}
              onValueChange={(v: ScopeFilter) => {
                setScopeFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scopes</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={statusFilter}
              onValueChange={(v: StatusFilter) => {
                setStatusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <WorkflowCardSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error state */}
          {error && !isPermissionError && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load workflows. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {/* Empty state */}
          {!isLoading && filteredWorkflows.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Workflow className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No workflows yet</p>
              <p className="text-sm mt-1">
                Create one to automate incident response, or start from a template.
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button asChild>
                  <Link to="/workflows/new">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Workflow
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Workflow grid */}
          {!isLoading && filteredWorkflows.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onEdit={() => navigate(`/workflows/${workflow.id}`)}
                  onDuplicate={() => handleDuplicate(workflow)}
                  onDelete={() => setDeleteTarget(workflow)}
                  onToggle={(enabled) => handleToggle(workflow, enabled)}
                  onViewHistory={() => navigate(`/workflows/${workflow.id}?tab=history`)}
                  onViewAnalytics={() => navigate(`/workflows/${workflow.id}?tab=analytics`)}
                  isToggling={toggleWorkflow.isPending}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
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
        </TabsContent>

        {/* Template Library Tab per user decision */}
        <TabsContent value="templates" className="space-y-4">
          {/* Template filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category filter per user decision */}
            <Select
              value={templateCategory}
              onValueChange={(v: TemplateCategory | 'all') => setTemplateCategory(v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Ticketing">Ticketing</SelectItem>
                <SelectItem value="Communication">Communication</SelectItem>
                <SelectItem value="Auto-resolution">Auto-resolution</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {templatesLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!templatesLoading && templatesData?.templates?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Library className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No templates found</p>
              <p className="text-sm mt-1">
                {templateSearch || templateCategory !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Templates will appear here once created.'}
              </p>
            </div>
          )}

          {/* Template grid */}
          {!templatesLoading && (templatesData?.templates?.length || 0) > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templatesData?.templates?.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => handleUseTemplate(template.id)}
                  isCreating={creatingTemplateId === template.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action
              cannot be undone.
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
    </div>
  );
}
