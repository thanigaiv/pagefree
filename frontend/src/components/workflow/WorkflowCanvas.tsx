/**
 * WorkflowCanvas - React Flow visual workflow builder
 *
 * Main canvas component for visualizing and editing workflows.
 * Features:
 * - Custom node types (trigger, action, condition, delay)
 * - Auto-layout using dagre for tree/DAG structure
 * - Connection validation (can't connect to triggers, no cycles)
 * - Edge styling based on condition handles (green for true, red for false)
 * - MiniMap for complex workflows (per Claude's discretion)
 * - Performance warning for >20 nodes
 */

import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { ConditionNode } from './nodes/ConditionNode';
import { DelayNode } from './nodes/DelayNode';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

// Register custom node types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

// Node dimensions for layout calculation
const NODE_DIMENSIONS = {
  trigger: { width: 200, height: 100 },
  action: { width: 220, height: 120 },
  condition: { width: 180, height: 140 },
  delay: { width: 160, height: 100 },
};

// Performance threshold
const MAX_RECOMMENDED_NODES = 20;

interface WorkflowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  readOnly?: boolean;
  onNodeDrop?: (type: string, subType: string | undefined, position: { x: number; y: number }) => void;
}

/**
 * Calculate auto-layout positions using dagre
 */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 100,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes to dagre graph with dimensions
  nodes.forEach((node) => {
    const dimensions = NODE_DIMENSIONS[node.type as keyof typeof NODE_DIMENSIONS] || {
      width: 200,
      height: 100,
    };
    dagreGraph.setNode(node.id, dimensions);
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const dimensions = NODE_DIMENSIONS[node.type as keyof typeof NODE_DIMENSIONS] || {
      width: 200,
      height: 100,
    };

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - dimensions.width / 2,
        y: nodeWithPosition.y - dimensions.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Validate if a connection is allowed
 */
function isValidConnection(
  connection: Connection,
  nodes: Node[],
  edges: Edge[]
): { valid: boolean; reason?: string } {
  // Cannot connect to trigger nodes (they're always first)
  const targetNode = nodes.find((n) => n.id === connection.target);
  if (targetNode?.type === 'trigger') {
    return { valid: false, reason: 'Cannot connect to trigger nodes' };
  }

  // Cannot connect from a node to itself
  if (connection.source === connection.target) {
    return { valid: false, reason: 'Cannot connect a node to itself' };
  }

  // Check for cycles using DFS
  const wouldCreateCycle = detectCycle(
    connection.source!,
    connection.target!,
    edges
  );
  if (wouldCreateCycle) {
    return { valid: false, reason: 'Connection would create a cycle' };
  }

  // Condition nodes must use sourceHandle 'true' or 'false'
  const sourceNode = nodes.find((n) => n.id === connection.source);
  if (sourceNode?.type === 'condition') {
    if (connection.sourceHandle !== 'true' && connection.sourceHandle !== 'false') {
      return { valid: false, reason: 'Condition nodes require true/false handles' };
    }
  }

  return { valid: true };
}

/**
 * Detect if adding an edge would create a cycle
 */
function detectCycle(source: string, target: string, edges: Edge[]): boolean {
  // Build adjacency list including the proposed new edge
  const adjacency = new Map<string, string[]>();

  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  });

  // Add the proposed edge
  if (!adjacency.has(source)) {
    adjacency.set(source, []);
  }
  adjacency.get(source)!.push(target);

  // DFS from target to see if we can reach source (which would indicate a cycle)
  const visited = new Set<string>();
  const stack = [target];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === source) {
      return true; // Found a cycle
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    stack.push(...neighbors);
  }

  return false;
}

/**
 * Get edge style based on source handle
 */
function getEdgeStyle(sourceHandle: string | null | undefined): {
  style: { strokeWidth: number; stroke: string };
  markerEnd: { type: MarkerType; color: string };
} {
  if (sourceHandle === 'true') {
    return {
      style: { strokeWidth: 2, stroke: '#22c55e' }, // green
      markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e' },
    };
  }
  if (sourceHandle === 'false') {
    return {
      style: { strokeWidth: 2, stroke: '#ef4444' }, // red
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
    };
  }
  // Default edge style
  return {
    style: { strokeWidth: 2, stroke: '#6b7280' }, // gray
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
  };
}

export function WorkflowCanvas({
  initialNodes,
  initialEdges,
  onChange,
  readOnly = false,
  onNodeDrop,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();

  // Apply auto-layout to initial elements
  const { nodes: layoutedInitialNodes, edges: layoutedInitialEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges),
    // Only run layout on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);

  // Track the previous initialNodes/initialEdges to detect when they change
  const prevInitialNodesRef = useRef(initialNodes);
  const prevInitialEdgesRef = useRef(initialEdges);

  // Update internal state when initialNodes/initialEdges change (e.g., when loading a workflow)
  useEffect(() => {
    if (prevInitialNodesRef.current !== initialNodes) {
      prevInitialNodesRef.current = initialNodes;
      setNodes(initialNodes);
    }
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (prevInitialEdgesRef.current !== initialEdges) {
      prevInitialEdgesRef.current = initialEdges;
      setEdges(initialEdges);
    }
  }, [initialEdges, setEdges]);

  // Check for performance warning
  useEffect(() => {
    setShowPerformanceWarning(nodes.length > MAX_RECOMMENDED_NODES);
  }, [nodes.length]);

  // Notify parent of changes only when nodes/edges actually change from user interaction
  useEffect(() => {
    if (onChange) {
      onChange(nodes, edges);
    }
  }, [nodes, edges, onChange]);

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      const validation = isValidConnection(connection, nodes, edges);
      if (!validation.valid) {
        console.warn('Invalid connection:', validation.reason);
        return;
      }

      // Apply styling based on source handle
      const edgeStyle = getEdgeStyle(connection.sourceHandle);

      const newEdge: Edge = {
        ...connection,
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        ...edgeStyle,
      } as Edge;

      setEdges((eds) => addEdge(newEdge, eds));
    },
    [nodes, edges, setEdges]
  );

  // Style existing edges based on source handle
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const edgeStyle = getEdgeStyle(edge.sourceHandle);
      return {
        ...edge,
        ...edgeStyle,
      };
    });
  }, [edges]);

  // Determine if MiniMap should be shown (per Claude's discretion)
  // Show for workflows with 5+ nodes
  const showMiniMap = nodes.length >= 5;

  // Handle drop with proper coordinate transformation using ReactFlow's screenToFlowPosition
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const data = event.dataTransfer.getData('application/reactflow');

      if (!data) {
        return;
      }

      const { type, subType } = JSON.parse(data);

      // Check if we already have a trigger (only one allowed)
      const hasTrigger = nodes.some(n => n.type === 'trigger');
      if (type === 'trigger' && hasTrigger) {
        console.log('Cannot add multiple triggers');
        return;
      }

      // Convert screen coordinates to flow coordinates
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Create default node data based on type
      let defaultData: any = {};
      switch (type) {
        case 'trigger':
          defaultData = {
            name: 'New Trigger',
            triggerType: subType || 'incident_created',
            conditions: [],
          };
          break;
        case 'action':
          defaultData = {
            name: subType === 'jira' ? 'New Jira Ticket' : subType === 'linear' ? 'New Linear Issue' : 'New Webhook',
            actionType: subType || 'webhook',
            config: subType === 'jira' ? { projectKey: '', issueType: 'Bug', summary: '', description: '' }
              : subType === 'linear' ? { teamId: '', title: '', description: '' }
              : { url: '', method: 'POST', headers: {}, body: '{}', auth: { type: 'none' } },
            retry: { attempts: 1, backoff: 'exponential', initialDelayMs: 1000 },
          };
          break;
        case 'condition':
          defaultData = {
            name: 'New Condition',
            field: '',
            operator: '=',
            value: '',
          };
          break;
        case 'delay':
          defaultData = {
            name: 'Wait',
            durationMinutes: 5,
          };
          break;
      }

      // Create new node and add directly to canvas state
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: defaultData,
      };

      console.log('Adding node directly to canvas:', newNode);
      setNodes((nds) => [...nds, newNode]);

      // Notify parent if callback provided (for additional handling)
      if (onNodeDrop) {
        onNodeDrop(type, subType, position);
      }
    },
    [nodes, reactFlow, setNodes, onNodeDrop]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div
      ref={reactFlowWrapper}
      className="relative h-full w-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Performance warning */}
      {showPerformanceWarning && (
        <Alert className="absolute top-2 left-2 z-10 w-auto bg-yellow-50 border-yellow-200">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700">
            Workflow has {nodes.length} nodes. Consider simplifying for better performance.
          </AlertDescription>
        </Alert>
      )}

      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
        }}
        className="bg-gray-50 dark:bg-gray-900"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="bg-gray-50 dark:bg-gray-900"
        />
        <Controls
          showInteractive={!readOnly}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        />
        {showMiniMap && (
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#8b5cf6'; // purple
                case 'action':
                  return '#3b82f6'; // blue
                case 'condition':
                  return '#f59e0b'; // amber
                case 'delay':
                  return '#6b7280'; // gray
                default:
                  return '#9ca3af';
              }
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
}

// Export layout helper for use in other components
export { getLayoutedElements };

export default WorkflowCanvas;
