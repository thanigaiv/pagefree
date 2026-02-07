/**
 * WorkflowBuilderPage - Visual workflow builder page
 *
 * Complete workflow builder with:
 * - 3-column layout: Sidebar | Canvas | Config Panel
 * - Drag-and-drop node creation
 * - Node configuration
 * - Save/test/export functionality
 * - Template starter flow
 *
 * Per user decisions:
 * - Visual drag-and-drop builder
 * - Template library on workflow creation
 * - Real-time validation feedback
 * - Test mode with sample data
 * - Required name and description
 * - JSON export
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { Node, Edge } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileJson,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { WorkflowCanvas, getLayoutedElements } from '@/components/workflow/WorkflowCanvas';
import { WorkflowSidebar } from '@/components/workflow/WorkflowSidebar';
import { WorkflowToolbar } from '@/components/workflow/WorkflowToolbar';
import { NodeConfigPanel } from '@/components/workflow/NodeConfigPanel';
import { WorkflowTestMode } from '@/components/workflow/WorkflowTestMode';
import {
  useWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  useToggleWorkflow,
  useDuplicateWorkflow,
  useExportWorkflow,
  useWorkflowVersions,
  useRollbackWorkflow,
  useWorkflowTemplates,
  useCreateFromTemplate,
} from '@/hooks/useWorkflows';
import type {
  Workflow,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  TriggerData,
  ActionData,
  ConditionData,
  DelayData,
  WorkflowScope,
  TriggerType,
  ActionType,
} from '@/types/workflow';

// =============================================================================
// HELPERS
// =============================================================================

function createDefaultNodeData(
  type: string,
  subType?: TriggerType | ActionType
): TriggerData | ActionData | ConditionData | DelayData {
  switch (type) {
    case 'trigger':
      return {
        name: 'New Trigger',
        triggerType: (subType as TriggerType) || 'incident_created',
        conditions: [],
      };
    case 'action':
      if (subType === 'webhook') {
        return {
          name: 'New Webhook',
          actionType: 'webhook',
          config: {
            url: '',
            method: 'POST',
            headers: {},
            body: '{}',
            auth: { type: 'none' },
          },
          retry: { attempts: 1, backoff: 'exponential', initialDelayMs: 1000 },
        };
      } else if (subType === 'jira') {
        return {
          name: 'New Jira Ticket',
          actionType: 'jira',
          config: {
            projectKey: '',
            issueType: 'Bug',
            summary: '',
            description: '',
          },
          retry: { attempts: 1, backoff: 'exponential', initialDelayMs: 1000 },
        };
      } else if (subType === 'linear') {
        return {
          name: 'New Linear Issue',
          actionType: 'linear',
          config: {
            teamId: '',
            title: '',
            description: '',
          },
          retry: { attempts: 1, backoff: 'exponential', initialDelayMs: 1000 },
        };
      }
      // Default to webhook
      return {
        name: 'New Action',
        actionType: 'webhook',
        config: {
          url: '',
          method: 'POST',
          headers: {},
          body: '{}',
          auth: { type: 'none' },
        },
        retry: { attempts: 1, backoff: 'exponential', initialDelayMs: 1000 },
      };
    case 'condition':
      return {
        name: 'New Condition',
        field: '',
        operator: '=',
        value: '',
      };
    case 'delay':
      return {
        name: 'Wait',
        durationMinutes: 5,
      };
    default:
      return {
        name: 'Unknown',
        triggerType: 'manual',
        conditions: [],
      };
  }
}

function validateWorkflow(
  name: string,
  description: string,
  nodes: Node[],
  edges: Edge[]
): string[] {
  const errors: string[] = [];

  // Required name and description per user decision
  if (!name.trim()) {
    errors.push('Workflow name is required');
  }
  if (!description.trim()) {
    errors.push('Workflow description is required');
  }

  // Must have at least one trigger
  const triggers = nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) {
    errors.push('Workflow must have a trigger');
  }
  if (triggers.length > 1) {
    errors.push('Workflow can only have one trigger');
  }

  // Validate each node
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    if (!data.name) {
      errors.push(`Node ${node.id} is missing a name`);
    }

    if (node.type === 'action') {
      const actionData = data as ActionData;
      if (actionData.actionType === 'webhook' && !actionData.config?.url) {
        errors.push(`Webhook action "${data.name || node.id}" is missing URL`);
      }
      if (actionData.actionType === 'jira' && !actionData.config?.projectKey) {
        errors.push(`Jira action "${data.name || node.id}" is missing project key`);
      }
      if (actionData.actionType === 'linear' && !actionData.config?.teamId) {
        errors.push(`Linear action "${data.name || node.id}" is missing team ID`);
      }
    }

    if (node.type === 'condition') {
      const condData = data as ConditionData;
      if (!condData.field || !condData.value) {
        errors.push(`Condition "${data.name || node.id}" is incomplete`);
      }
    }

    if (node.type === 'delay') {
      const delayData = data as DelayData;
      if (!delayData.durationMinutes || delayData.durationMinutes <= 0) {
        errors.push(`Delay "${data.name || node.id}" must have a positive duration`);
      }
    }
  }

  // Check for unconnected nodes (except trigger which is always first)
  const connectedTargets = new Set(edges.map((e) => e.target));
  for (const node of nodes) {
    if (node.type !== 'trigger' && !connectedTargets.has(node.id)) {
      errors.push(`Node "${(node.data as { name?: string }).name || node.id}" is not connected`);
    }
  }

  return errors;
}

// =============================================================================
// TEMPLATE DIALOG
// =============================================================================

interface TemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string) => void;
  onStartBlank: () => void;
}

function TemplateDialog({
  isOpen,
  onClose,
  onSelectTemplate,
  onStartBlank,
}: TemplateDialogProps) {
  const { data: templatesData } = useWorkflowTemplates();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const templates = templatesData?.templates || [];
  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start from Template</DialogTitle>
          <DialogDescription>
            Choose a pre-built workflow template or start with a blank canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Label>Category:</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Ticketing">Ticketing</SelectItem>
                <SelectItem value="Communication">Communication</SelectItem>
                <SelectItem value="Auto-resolution">Auto-resolution</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Template grid */}
          <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                className="p-4 border rounded-lg text-left hover:bg-muted/50 transition-colors"
                onClick={() => onSelectTemplate(template.id)}
              >
                <h4 className="font-medium">{template.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {template.description}
                </p>
                <span className="text-xs text-primary mt-2 inline-block">
                  {template.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onStartBlank}>
            <FileJson className="h-4 w-4 mr-1.5" />
            Start Blank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// VERSION HISTORY DIALOG
// =============================================================================

interface VersionHistoryDialogProps {
  workflowId: string;
  isOpen: boolean;
  onClose: () => void;
  onRollback: (version: number) => void;
}

function VersionHistoryDialog({
  workflowId,
  isOpen,
  onClose,
  onRollback,
}: VersionHistoryDialogProps) {
  const { data: versionsData, isLoading } = useWorkflowVersions(workflowId);
  const versions = versionsData?.versions || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Version History</DialogTitle>
          <DialogDescription>
            View and restore previous versions of this workflow.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {versions.map((version, idx) => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium">Version {version.version}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  {version.changeNote && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {version.changeNote}
                    </div>
                  )}
                </div>
                {idx > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRollback(version.version)}
                  >
                    Restore
                  </Button>
                )}
                {idx === 0 && (
                  <span className="text-sm text-primary">Current</span>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function WorkflowBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isNew = !id || id === 'new';
  const teamId = searchParams.get('teamId') || undefined;

  // Data fetching
  const { data: workflowData, isLoading } = useWorkflow(isNew ? undefined : id);
  const workflow = workflowData?.workflow;

  // Mutations
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const duplicateWorkflow = useDuplicateWorkflow();
  const { data: exportData, refetch: fetchExport } = useExportWorkflow(id, { enabled: false });
  const rollbackWorkflow = useRollbackWorkflow();
  const createFromTemplate = useCreateFromTemplate();

  // UI State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeType, setScopeType] = useState<WorkflowScope>('team');
  const [isDirty, setIsDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Dialog states
  const [showTestMode, setShowTestMode] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(isNew);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Initialize from loaded workflow
  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setDescription(workflow.description);
      setScopeType(workflow.scopeType);
      setNodes(workflow.definition.nodes as Node[]);
      setEdges(workflow.definition.edges as Edge[]);
      setIsDirty(false);
    }
  }, [workflow]);

  // Validate on changes
  useEffect(() => {
    const errors = validateWorkflow(name, description, nodes, edges);
    setValidationErrors(errors);
  }, [name, description, nodes, edges]);

  // Selected node
  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null),
    [nodes, selectedNodeId]
  );

  // Check if workflow has a trigger
  const hasTrigger = useMemo(
    () => nodes.some((n) => n.type === 'trigger'),
    [nodes]
  );

  // Handle canvas changes
  const handleCanvasChange = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      setNodes(newNodes);
      setEdges(newEdges);
      setIsDirty(true);

      // Update selected node if it was removed
      if (selectedNodeId && !newNodes.find((n) => n.id === selectedNodeId)) {
        setSelectedNodeId(null);
      }
    },
    [selectedNodeId]
  );

  // Handle node selection
  useEffect(() => {
    const handleNodeClick = (event: CustomEvent) => {
      setSelectedNodeId(event.detail?.nodeId || null);
    };

    window.addEventListener('workflow-node-click' as never, handleNodeClick as never);
    return () => {
      window.removeEventListener('workflow-node-click' as never, handleNodeClick as never);
    };
  }, []);

  // Handle node config change
  const handleNodeChange = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) =>
          node.id === nodeId ? { ...node, data } : node
        )
      );
      setIsDirty(true);
    },
    []
  );

  // Handle drop from sidebar
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      const { type, subType, label } = JSON.parse(data);

      // Don't allow multiple triggers
      if (type === 'trigger' && hasTrigger) {
        return;
      }

      // Get drop position relative to canvas
      const canvasRect = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - canvasRect.left - 100,
        y: event.clientY - canvasRect.top - 50,
      };

      // Create new node
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: createDefaultNodeData(type, subType),
      };

      setNodes((prevNodes) => [...prevNodes, newNode]);
      setSelectedNodeId(newNode.id);
      setIsDirty(true);
    },
    [hasTrigger]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Save workflow
  const handleSave = async () => {
    if (validationErrors.length > 0) return;

    // Get trigger config from trigger node
    const triggerNode = nodes.find((n) => n.type === 'trigger');
    const triggerData = triggerNode?.data as TriggerData | undefined;

    const definition: WorkflowDefinition = {
      id: workflow?.id || 'new',
      name,
      description,
      version: workflow?.version || 1,
      nodes: nodes as WorkflowNode[],
      edges: edges as WorkflowEdge[],
      trigger: {
        type: triggerData?.triggerType || 'manual',
        conditions: triggerData?.conditions || [],
        ageThresholdMinutes: triggerData?.ageThresholdMinutes,
        stateTransition: triggerData?.stateTransition,
      },
      settings: {
        timeout: '5min',
        enabled: workflow?.isEnabled || false,
      },
    };

    try {
      if (isNew) {
        const result = await createWorkflow.mutateAsync({
          name,
          description,
          definition,
          scopeType,
          teamId,
        });
        navigate(`/workflows/${result.workflow.id}/edit`, { replace: true });
      } else {
        await updateWorkflow.mutateAsync({
          id: id!,
          data: { name, description, definition },
        });
        setIsDirty(false);
      }
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  // Toggle enabled
  const handleToggle = async (enabled: boolean) => {
    if (!workflow) return;
    await toggleWorkflow.mutateAsync({ id: workflow.id, enabled });
  };

  // Export JSON
  const handleExport = async () => {
    if (!workflow) return;
    await fetchExport();
    if (exportData) {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workflow.name.replace(/\s+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Duplicate
  const handleDuplicate = async () => {
    if (!workflow) return;
    const result = await duplicateWorkflow.mutateAsync(workflow.id);
    navigate(`/workflows/${result.workflow.id}/edit`);
  };

  // Rollback
  const handleRollback = async (version: number) => {
    if (!workflow) return;
    await rollbackWorkflow.mutateAsync({ id: workflow.id, toVersion: version });
    setShowVersionHistory(false);
  };

  // Template selection
  const handleSelectTemplate = async (templateId: string) => {
    const result = await createFromTemplate.mutateAsync({
      templateId,
      name: 'New Workflow from Template',
      description: 'Created from template',
      teamId,
    });
    navigate(`/workflows/${result.workflow.id}/edit`, { replace: true });
    setShowTemplateDialog(false);
  };

  const handleStartBlank = () => {
    setShowTemplateDialog(false);
  };

  // Navigation guard
  const handleNavigate = (path: string) => {
    if (isDirty) {
      setPendingNavigation(path);
      setShowExitConfirm(true);
    } else {
      navigate(path);
    }
  };

  // Loading state
  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Create a mock workflow for new workflows
  const displayWorkflow: Workflow = workflow || {
    id: 'new',
    name: name || 'New Workflow',
    description: description || '',
    version: 1,
    definition: {
      id: 'new',
      name: '',
      description: '',
      version: 1,
      nodes: [],
      edges: [],
      trigger: { type: 'manual', conditions: [] },
      settings: { timeout: '5min', enabled: false },
    },
    scopeType,
    teamId: teamId || null,
    isEnabled: false,
    isTemplate: false,
    templateCategory: null,
    createdById: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header with metadata editing */}
      <div className="border-b bg-background px-4 py-2">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNavigate('/workflows')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1 grid grid-cols-2 gap-4 max-w-xl">
            <div>
              <Label htmlFor="workflow-name" className="sr-only">
                Name
              </Label>
              <Input
                id="workflow-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Workflow name (required)"
                className={cn(!name && 'border-red-300')}
              />
            </div>
            <div>
              <Label htmlFor="workflow-scope" className="sr-only">
                Scope
              </Label>
              <Select
                value={scopeType}
                onValueChange={(v: WorkflowScope) => {
                  setScopeType(v);
                  setIsDirty(true);
                }}
                disabled={!isNew}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team Scope</SelectItem>
                  <SelectItem value="global">Global Scope</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex-1">
            <Input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Description (required)"
              className={cn(!description && 'border-red-300')}
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <WorkflowToolbar
        workflow={displayWorkflow}
        isDirty={isDirty}
        isSaving={createWorkflow.isPending || updateWorkflow.isPending}
        validationErrors={validationErrors}
        onSave={handleSave}
        onTest={() => setShowTestMode(true)}
        onToggle={handleToggle}
        onExport={handleExport}
        onDuplicate={handleDuplicate}
        onVersionHistory={() => setShowVersionHistory(true)}
      />

      {/* Main content - 3 column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <WorkflowSidebar
          hasTrigger={hasTrigger}
          onStartFromTemplate={() => setShowTemplateDialog(true)}
        />

        {/* Canvas */}
        <div
          className="flex-1 relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <WorkflowCanvas
            initialNodes={nodes}
            initialEdges={edges}
            onChange={handleCanvasChange}
          />
        </div>

        {/* Right config panel */}
        <NodeConfigPanel
          selectedNode={selectedNode}
          onChange={handleNodeChange}
        />
      </div>

      {/* Test Mode Dialog */}
      <WorkflowTestMode
        workflow={displayWorkflow}
        isOpen={showTestMode}
        onClose={() => setShowTestMode(false)}
      />

      {/* Template Dialog (for new workflows) */}
      <TemplateDialog
        isOpen={showTemplateDialog && isNew}
        onClose={() => setShowTemplateDialog(false)}
        onSelectTemplate={handleSelectTemplate}
        onStartBlank={handleStartBlank}
      />

      {/* Version History Dialog */}
      {workflow && (
        <VersionHistoryDialog
          workflowId={workflow.id}
          isOpen={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
          onRollback={handleRollback}
        />
      )}

      {/* Exit Confirmation */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavigation(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingNavigation) {
                  navigate(pendingNavigation);
                }
                setShowExitConfirm(false);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
