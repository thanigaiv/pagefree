import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  ReactFlowProvider
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import { ServiceNode } from './ServiceNode';
import { useServiceGraph } from '@/hooks/useServiceDependencies';
import { Loader2 } from 'lucide-react';

const nodeTypes: NodeTypes = {
  service: ServiceNode
};

// Node dimensions for dagre layout
const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

/**
 * Auto-layout using dagre (pattern from WorkflowCanvas)
 */
function getLayoutedElements(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',  // Left to right (upstream -> downstream)
    nodesep: 60,
    ranksep: 100,
    marginx: 20,
    marginy: 20
  });

  nodes.forEach(node => g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach(edge => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map(node => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

interface DependencyGraphProps {
  serviceId: string;
  onNodeClick?: (serviceId: string) => void;
}

function DependencyGraphInner({ serviceId, onNodeClick }: DependencyGraphProps) {
  const { data: graph, isLoading, error } = useServiceGraph(serviceId);

  // Convert API response to React Flow nodes/edges
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    const rfNodes: Node[] = graph.nodes.map(node => ({
      id: node.id,
      type: 'service',
      position: { x: 0, y: 0 },  // Will be set by dagre
      data: {
        name: node.name,
        teamName: node.teamName,
        status: node.status,
        isFocused: node.isFocused
      }
    }));

    const rfEdges: Edge[] = graph.edges.map((edge) => ({
      id: `e-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      style: { strokeWidth: 2, stroke: '#6b7280' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }
    }));

    return getLayoutedElements(rfNodes, rfEdges);
  }, [graph]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node.id);
    }
  }, [onNodeClick]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        Failed to load dependency graph
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No dependencies to display
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      className="bg-gray-50 dark:bg-gray-900"
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
      {nodes.length >= 5 && (
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          nodeColor={(node) => {
            const status = (node.data as { status?: string })?.status;
            if (status === 'ACTIVE') return '#22c55e';
            if (status === 'DEPRECATED') return '#f59e0b';
            return '#9ca3af';
          }}
        />
      )}
    </ReactFlow>
  );
}

// Wrap with ReactFlowProvider for proper context
export function DependencyGraph(props: DependencyGraphProps) {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export default DependencyGraph;
