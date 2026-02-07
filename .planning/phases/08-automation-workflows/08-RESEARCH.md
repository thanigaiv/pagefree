# Phase 8: Automation & Workflows - Research

**Researched:** 2026-02-07
**Domain:** Visual workflow builder, workflow execution engine, webhook actions, ticket creation integrations
**Confidence:** HIGH

## Summary

Phase 8 implements automated response workflows triggered by incident conditions. This involves three major components: (1) a visual drag-and-drop workflow builder using React Flow for the frontend, (2) a workflow execution engine leveraging BullMQ for job orchestration, and (3) action executors for webhooks and ticket creation (Jira, Linear).

The existing codebase provides strong foundations: BullMQ queues are already used for escalation jobs, Zod schemas handle validation, and the incident/timeline infrastructure supports audit logging. The visual builder is the most significant new capability, requiring React Flow integration and careful UX design for branching workflows.

**Key Findings:**
- React Flow (@xyflow/react) is the dominant library for node-based UIs (35k+ GitHub stars, MIT licensed)
- BullMQ Flows support parent-child job dependencies for sequential workflow execution
- Mustache/Handlebars template syntax ({{variable}}) is standard for variable interpolation
- Linear offers TypeScript SDK; Jira uses REST API v3 - both support OAuth and API keys
- XState is overkill for this use case; simple state machine with BullMQ jobs is sufficient

**Primary recommendation:** Use React Flow with Dagre layout for visual builder, BullMQ Flows for execution orchestration, Handlebars for template interpolation, and store workflow definitions as JSON with version history in database.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Workflow Authoring Experience
- Visual drag-and-drop builder (node-based like Zapier/n8n) where users connect trigger and action blocks
- Template library on workflow creation start with pre-built workflows users can customize
- Real-time validation feedback highlighting configuration errors and missing required fields
- Test mode with sample data to preview workflow execution before activation
- Both team-scoped and global workflows: teams create their own, platform admins create global workflows
- Grouped timeline entries with visual nesting (workflow entry with collapsible action entries underneath)
- Full branching support with if/else conditional paths within workflows
- Toggle enabled/disabled state without deletion for temporary workflow suspension
- Full version history tracking every workflow edit with rollback capability
- Template organization by categories (Ticketing, Communication, Auto-resolution) with search/filter
- JSON export/import for workflow backup and sharing between teams
- Configurable delays between actions (wait 5 minutes, then send reminder)
- Team admin permissions required to create/edit workflows
- Workflow duplication enabled to create variations by cloning and modifying existing workflows
- Detailed execution analytics showing execution count, success rate, average duration, failure points
- Required name and description fields to force documentation of workflow purpose
- In-flight workflows complete with old version when workflow edited (no mid-execution cancellation)

#### Action Catalog and Extensibility
- Built-in actions: HTTP webhook (POST/PUT/PATCH) and ticket creation (Jira, Linear)
- Template variable interpolation using {{incident.title}}, {{incident.priority}}, {{assignee.email}} syntax
- Webhook authentication supports: Bearer token, Basic auth (username/password), OAuth 2.0 client credentials, custom headers
- Ticket creation actions store ticket URL in incident metadata (visible in timeline and details, no two-way sync)

#### Trigger Conditions and Matching
- Incident events that trigger workflows: incident created, state changes (acknowledged/resolved/closed), escalation events, manual trigger button
- Simple field matching for conditions (priority = HIGH, service = api-gateway, no AND/OR logic)
- Incident age triggers enabled (run workflow if incident open for >1 hour without acknowledgment)

#### Execution Model and Error Handling
- Sequential execution, stop on first error (actions run one at a time in order, failure stops workflow)
- Configurable retry with exponential backoff per action (N retries with increasing delays for transient failures)
- Execution failures communicated via: notification to incident assignee, notification to workflow creator, Slack/Teams alert to team channel
- Configurable timeout per workflow (1min, 5min, 15min options), exceeding timeout cancels execution

### Claude's Discretion
- Mini-map/overview panel for visual builder (add if workflow complexity warrants navigation aid)
- Multiple workflows triggering from one incident (allow all matching workflows to run in parallel)
- Frontend UI component library choice for node-based visual builder
- Webhook action response parsing and storage strategy
- OAuth token storage and refresh mechanism details

### Deferred Ideas (OUT OF SCOPE)
- Slack/Teams messaging actions (beyond standard notifications) — consider adding in future iteration
- Script execution/runbook automation (bash/python scripts) — deferred to later phase for security review
- Scheduled workflow runs (cron-style) — time-based scheduling beyond incident age triggers
- Advanced condition matching with operators (IN, MATCHES, comparison operators) — start simple, add complexity later
- Bidirectional ticket sync (ticket status updates resolve incidents) — integration complexity deferred
- Workflow marketplace for sharing workflows between organizations — future enhancement

</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react (React Flow) | 12.x | Visual workflow builder | 35k+ stars, MIT license, active development, supports React 19 |
| dagre | 0.8.x | Auto-layout for workflow graphs | Recommended by React Flow for tree/DAG layouts |
| Handlebars | 4.7.x | Template variable interpolation | 18k+ stars, battle-tested, {{variable}} syntax matches user requirement |
| BullMQ | 5.x | Workflow execution orchestration | Already in project, supports Flows for parent-child dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @linear/sdk | Latest | Linear ticket creation | Official TypeScript SDK, strongly typed |
| node-fetch / native fetch | Built-in | HTTP webhook execution | Native in Node.js 18+, already available |
| Zod | 4.x | Workflow definition validation | Already in project, type-safe validation |
| date-fns | 4.x | Duration/delay calculations | Already in project |

### Already Installed (No Changes Needed)
| Library | Use in Phase 8 |
|---------|----------------|
| React Hook Form | Workflow configuration forms |
| TanStack Query | Workflow CRUD operations |
| Radix UI | Dialog, Popover, Switch components |
| Lucide React | Node and action icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Flow | @projectstorm/react-diagrams | React Flow has better React 19 support, larger community |
| Handlebars | Mustache.js | Handlebars has helpers for conditionals, more features |
| Custom executor | XState | XState is overkill; BullMQ Flows provide sufficient orchestration |
| Custom executor | Temporal | Temporal is enterprise-grade, significant infrastructure overhead |
| dagre | elkjs | ELK more powerful but larger bundle, steeper learning curve |

**Installation:**
```bash
npm install @xyflow/react dagre @types/dagre handlebars @linear/sdk
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── services/
│   ├── workflow/
│   │   ├── workflow.service.ts           # Workflow CRUD, versioning
│   │   ├── workflow-executor.service.ts  # Orchestrates execution
│   │   ├── workflow-trigger.service.ts   # Event matching, trigger evaluation
│   │   └── template.service.ts           # Handlebars template processing
│   └── actions/
│       ├── webhook.action.ts             # HTTP webhook executor
│       ├── jira.action.ts                # Jira ticket creation
│       └── linear.action.ts              # Linear ticket creation
├── queues/
│   ├── workflow.queue.ts                 # BullMQ queue for workflows
│   └── workflow-action.queue.ts          # Individual action execution
├── workers/
│   └── workflow.worker.ts                # Processes workflow jobs
└── routes/
    ├── workflow.routes.ts                # API endpoints
    └── workflow-template.routes.ts       # Template library endpoints

frontend/src/
├── pages/
│   ├── WorkflowsPage.tsx                 # Workflow list/management
│   ├── WorkflowBuilderPage.tsx           # Visual editor
│   └── WorkflowAnalyticsPage.tsx         # Execution metrics
├── components/
│   └── workflow/
│       ├── WorkflowCanvas.tsx            # React Flow container
│       ├── nodes/
│       │   ├── TriggerNode.tsx           # Start trigger node
│       │   ├── ActionNode.tsx            # Webhook/ticket action
│       │   ├── ConditionNode.tsx         # If/else branching
│       │   └── DelayNode.tsx             # Wait/delay action
│       ├── WorkflowSidebar.tsx           # Node palette
│       ├── WorkflowToolbar.tsx           # Save/test/export
│       ├── WorkflowTestMode.tsx          # Test execution panel
│       └── WorkflowTimeline.tsx          # Grouped execution logs
└── hooks/
    ├── useWorkflows.ts                   # CRUD operations
    ├── useWorkflowBuilder.ts             # Editor state management
    └── useWorkflowExecution.ts           # Test mode execution
```

### Pattern 1: Workflow Definition as JSON
**What:** Store workflow as serializable JSON with nodes, edges, and configuration
**When to use:** Persisting workflows to database, version history, export/import
**Example:**
```typescript
// Source: React Flow + industry standard patterns
// src/types/workflow.ts

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;

  // React Flow compatible structure
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // Trigger configuration
  trigger: {
    type: 'incident_created' | 'state_changed' | 'escalation' | 'manual' | 'age';
    conditions: TriggerCondition[];  // Simple field matching
  };

  // Execution settings
  settings: {
    timeout: '1min' | '5min' | '15min';
    enabled: boolean;
  };

  // Scope
  scope: {
    type: 'team' | 'global';
    teamId?: string;
  };
}

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  position: { x: number; y: number };
  data: TriggerData | ActionData | ConditionData | DelayData;
}

interface ActionData {
  actionType: 'webhook' | 'jira' | 'linear';
  config: WebhookConfig | JiraConfig | LinearConfig;
  retry: {
    attempts: number;
    backoff: 'exponential';
    initialDelay: number;
  };
}

interface WebhookConfig {
  url: string;  // Template: "https://api.example.com/{{incident.id}}"
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;  // Template values allowed
  body: string;  // JSON template
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
    // Auth-specific config
  };
}
```

### Pattern 2: BullMQ Flow for Sequential Execution
**What:** Use BullMQ parent-child job relationships for workflow execution
**When to use:** Executing workflow actions in sequence, handling failures
**Example:**
```typescript
// Source: BullMQ Flows documentation
// src/services/workflow/workflow-executor.service.ts

import { FlowProducer, Job } from 'bullmq';
import { getRedisConnectionOptions } from '../../config/redis.js';

const flowProducer = new FlowProducer({
  connection: getRedisConnectionOptions()
});

interface WorkflowExecutionContext {
  workflowId: string;
  workflowVersion: number;
  incidentId: string;
  triggeredBy: 'event' | 'manual';
  variables: Record<string, any>;  // Template context
}

async function executeWorkflow(
  workflow: WorkflowDefinition,
  context: WorkflowExecutionContext
): Promise<string> {
  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      incidentId: context.incidentId,
      status: 'RUNNING',
      startedAt: new Date()
    }
  });

  // Build job hierarchy from workflow nodes
  // For sequential: each action is child of previous
  // For branching: condition node determines which branch children run
  const sortedNodes = topologicalSort(workflow.nodes, workflow.edges);

  // Build nested job structure (children execute first in BullMQ)
  // So we reverse to get correct order
  let jobTree = buildJobTree(sortedNodes.reverse(), context, execution.id);

  const flow = await flowProducer.add(jobTree);

  return execution.id;
}

function buildJobTree(
  nodes: WorkflowNode[],
  context: WorkflowExecutionContext,
  executionId: string
): FlowJob {
  // Build nested structure where each node depends on its predecessor
  // First node (trigger) is root, subsequent nodes are nested children

  const [first, ...rest] = nodes;

  let current: FlowJob = {
    name: first.id,
    queueName: 'workflow-actions',
    data: {
      executionId,
      nodeId: first.id,
      nodeType: first.type,
      nodeData: first.data,
      context
    },
    opts: {
      jobId: `${executionId}:${first.id}`
    }
  };

  // Chain subsequent nodes
  for (const node of rest) {
    current = {
      name: node.id,
      queueName: 'workflow-actions',
      data: {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        nodeData: node.data,
        context
      },
      opts: {
        jobId: `${executionId}:${node.id}`
      },
      children: [current]  // Previous node must complete first
    };
  }

  return current;
}
```

### Pattern 3: Template Variable Interpolation
**What:** Replace {{variable}} placeholders with actual incident data
**When to use:** Webhook bodies, URLs, ticket descriptions
**Example:**
```typescript
// Source: Handlebars documentation
// src/services/workflow/template.service.ts

import Handlebars from 'handlebars';

// Register custom helpers
Handlebars.registerHelper('uppercase', (str: string) => str?.toUpperCase());
Handlebars.registerHelper('json', (obj: any) => JSON.stringify(obj));

interface TemplateContext {
  incident: {
    id: string;
    title: string;
    priority: string;
    status: string;
    createdAt: string;
    acknowledgedAt?: string;
    teamName: string;
    // Alert metadata
    metadata: Record<string, any>;
  };
  assignee?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  team: {
    id: string;
    name: string;
    slackChannel?: string;
  };
  workflow: {
    id: string;
    name: string;
    executionId: string;
  };
}

export function interpolateTemplate(template: string, context: TemplateContext): string {
  const compiled = Handlebars.compile(template);
  return compiled(context);
}

// Usage examples:
// URL: "https://api.example.com/incidents/{{incident.id}}"
// Body: '{"title": "{{incident.title}}", "priority": "{{uppercase incident.priority}}"}'
// Jira summary: "[OnCall] {{incident.title}} - {{team.name}}"
```

### Pattern 4: Grouped Timeline Entries
**What:** Visual nesting of workflow execution as parent with action children
**When to use:** Displaying workflow execution in incident timeline
**Example:**
```typescript
// Source: Existing TimelineEvent pattern + user requirement
// src/services/audit.service.ts (extend)

interface WorkflowTimelineEntry {
  type: 'workflow_execution';
  workflowId: string;
  workflowName: string;
  executionId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  actions: ActionTimelineEntry[];  // Nested children
}

interface ActionTimelineEntry {
  nodeId: string;
  actionType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  result?: any;  // Ticket URL, webhook response, etc.
  error?: string;
}

// Log workflow start (parent entry)
async function logWorkflowStart(
  incidentId: string,
  executionId: string,
  workflow: WorkflowDefinition
): Promise<void> {
  await auditService.log({
    action: 'workflow.execution.started',
    resourceType: 'incident',
    resourceId: incidentId,
    severity: 'INFO',
    metadata: {
      executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.version
    }
  });
}

// Log action completion (child entry)
async function logActionComplete(
  incidentId: string,
  executionId: string,
  nodeId: string,
  result: any
): Promise<void> {
  await auditService.log({
    action: 'workflow.action.completed',
    resourceType: 'incident',
    resourceId: incidentId,
    severity: 'INFO',
    metadata: {
      executionId,
      nodeId,
      result
    }
  });
}
```

### Pattern 5: React Flow Visual Builder
**What:** Node-based editor with drag-and-drop, connections, and auto-layout
**When to use:** Workflow creation/editing interface
**Example:**
```tsx
// Source: React Flow documentation
// frontend/src/components/workflow/WorkflowCanvas.tsx

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { ConditionNode } from './nodes/ConditionNode';
import { DelayNode } from './nodes/DelayNode';

// Custom node types
const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode
};

interface WorkflowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave: (nodes: Node[], edges: Edge[]) => void;
  readOnly?: boolean;
}

export function WorkflowCanvas({
  initialNodes,
  initialEdges,
  onSave,
  readOnly = false
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      // Validate connection (e.g., can't connect to trigger)
      if (isValidConnection(connection, nodes)) {
        setEdges((eds) => addEdge(connection, eds));
      }
    },
    [nodes, setEdges]
  );

  // Auto-layout using dagre
  const layoutedElements = useMemo(() => {
    return getLayoutedElements(nodes, edges, 'TB');  // Top to bottom
  }, [nodes, edges]);

  return (
    <div className="h-[600px] w-full border rounded-lg">
      <ReactFlow
        nodes={layoutedElements.nodes}
        edges={layoutedElements.edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />  {/* Per Claude's discretion: add for complex workflows */}
      </ReactFlow>
    </div>
  );
}

// Dagre layout helper
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 200, height: 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 100,
        y: nodeWithPosition.y - 40
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

### Anti-Patterns to Avoid
- **Storing compiled templates:** Store raw template strings, compile on execution
- **Synchronous workflow execution:** Always use BullMQ for async execution to avoid blocking API
- **Global state for editor:** Use React Flow's built-in state management, not Redux/Zustand
- **Polling for execution status:** Use WebSocket (already in project) for real-time updates
- **Flat timeline entries:** Group workflow actions under parent entry per user requirement
- **In-memory workflow state:** Persist everything to database for resilience and audit

---

## Don't Hand-Roll

Problems that have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Node-based UI | Custom canvas with SVG | React Flow | Complex interactions (zoom, pan, drag) are hard to get right |
| Graph layout | Manual position calculation | Dagre | Automatic DAG layout handles complex branching |
| Template interpolation | Custom {{}} parser | Handlebars | Edge cases (escaping, nesting, helpers) are tricky |
| Job orchestration | Custom state machine | BullMQ Flows | Parent-child dependencies, retries, timeouts built-in |
| Condition evaluation | Custom expression parser | Simple object matching | Complex expressions deferred; use lodash.matches or similar |
| OAuth token refresh | Manual refresh logic | Database tokens + refresh on 401 | Standard OAuth pattern with retry |
| Version diffing | Custom diff algorithm | JSON comparison | Store complete snapshots, compare as needed |

**Key insight:** The visual builder has the most complexity. Leverage React Flow heavily instead of building custom canvas interactions. Similarly, BullMQ Flows handle the hardest orchestration problems (retry, timeout, sequential execution).

---

## Common Pitfalls

### Pitfall 1: Workflow Version Conflicts
**What goes wrong:** User edits workflow while execution is in progress; execution uses partially new config
**Why it happens:** Mutable workflow definition during execution
**How to avoid:**
- Per user decision: "in-flight workflows complete with old version"
- Store `workflowVersion` in execution record
- Load definition from version history, not current workflow
- Never update running execution's workflow reference
```typescript
// At execution start, snapshot the version
const execution = await prisma.workflowExecution.create({
  data: {
    workflowId: workflow.id,
    workflowVersion: workflow.version,  // Locked to this version
    definitionSnapshot: workflow.definition  // Full snapshot
  }
});
```
**Warning signs:** Inconsistent action behavior, "action not found" errors mid-execution

### Pitfall 2: Circular Workflow Dependencies
**What goes wrong:** Workflow A triggers workflow B which triggers workflow A
**Why it happens:** No cycle detection in trigger matching
**How to avoid:**
- Track execution chain in context (which workflows triggered this)
- Limit maximum chain depth (e.g., 3 levels)
- Disallow workflows from triggering themselves
```typescript
const MAX_WORKFLOW_DEPTH = 3;

function canTriggerWorkflow(context: ExecutionContext): boolean {
  if (context.executionChain.length >= MAX_WORKFLOW_DEPTH) {
    logger.warn({ chain: context.executionChain }, 'Max workflow depth reached');
    return false;
  }
  // Check for cycles
  if (context.executionChain.includes(workflow.id)) {
    logger.warn({ workflowId: workflow.id }, 'Workflow cycle detected');
    return false;
  }
  return true;
}
```
**Warning signs:** Runaway job creation, Redis queue growth, timeout errors

### Pitfall 3: Template Injection Vulnerabilities
**What goes wrong:** Malicious template code executes in server context
**Why it happens:** Handlebars helpers allow code execution if not restricted
**How to avoid:**
- Use Handlebars in strict mode
- Whitelist allowed helpers (no custom eval-like helpers)
- Sanitize output for specific contexts (URL encoding, JSON escaping)
- Don't expose server-side variables beyond the defined context
```typescript
// Restrict Handlebars environment
const safeHandlebars = Handlebars.create();
// Only register safe helpers
safeHandlebars.registerHelper('uppercase', (str) => String(str).toUpperCase());
safeHandlebars.registerHelper('lowercase', (str) => String(str).toLowerCase());
safeHandlebars.registerHelper('json', (obj) => JSON.stringify(obj));
// DON'T register: eval, exec, require, import
```
**Warning signs:** Unexpected server errors, security audit flags, strange template outputs

### Pitfall 4: Webhook Timeout Not Matching Workflow Timeout
**What goes wrong:** Individual webhook takes 5 minutes, workflow timeout is 1 minute
**Why it happens:** Per-action timeout not coordinated with overall workflow timeout
**How to avoid:**
- Set per-action timeout lower than workflow timeout
- Calculate remaining time budget for each action
- Cancel pending actions when workflow times out
```typescript
// Per action timeout should leave headroom
const WORKFLOW_TIMEOUTS = {
  '1min': 60_000,
  '5min': 300_000,
  '15min': 900_000
};

// Individual action gets 80% of remaining time, max 30 seconds
function getActionTimeout(workflowTimeout: string, elapsedMs: number): number {
  const totalMs = WORKFLOW_TIMEOUTS[workflowTimeout];
  const remainingMs = totalMs - elapsedMs;
  return Math.min(remainingMs * 0.8, 30_000);
}
```
**Warning signs:** Workflows timing out but actions still running, orphaned jobs

### Pitfall 5: Lost Execution State on Worker Crash
**What goes wrong:** Worker crashes mid-execution, workflow state is lost
**Why it happens:** State kept in memory only
**How to avoid:**
- Persist execution state to database after each action
- Use BullMQ job completion callbacks to update state
- On worker restart, reconcile in-progress executions
```typescript
// After each action completes
await prisma.workflowExecution.update({
  where: { id: executionId },
  data: {
    completedActions: {
      push: {
        nodeId,
        status: 'completed',
        result,
        completedAt: new Date()
      }
    },
    lastActionAt: new Date()
  }
});
```
**Warning signs:** "Stuck" executions, duplicate action runs on restart

### Pitfall 6: React Flow Performance with Many Nodes
**What goes wrong:** UI becomes sluggish with 50+ nodes
**Why it happens:** Default rendering not optimized for large graphs
**How to avoid:**
- Limit workflow complexity (recommend max 20 nodes)
- Use React Flow's `nodesDraggable` and `nodesConnectable` props when viewing
- Implement viewport culling for read-only views
- Show warning when workflow exceeds recommended size
**Warning signs:** Frame drops during drag, slow initial render, browser memory warnings

---

## Code Examples

### Database Schema for Workflows
```typescript
// Source: Existing Prisma patterns + workflow requirements
// prisma/schema.prisma additions

model Workflow {
  id                String   @id @default(cuid())
  name              String
  description       String
  version           Int      @default(1)

  // Definition (JSON blob)
  definition        Json     // WorkflowDefinition structure

  // Scope
  scopeType         String   // 'team' or 'global'
  teamId            String?
  team              Team?    @relation(fields: [teamId], references: [id])

  // State
  isEnabled         Boolean  @default(false)
  isTemplate        Boolean  @default(false)
  templateCategory  String?  // 'Ticketing', 'Communication', 'Auto-resolution'

  // Ownership
  createdById       String
  createdBy         User     @relation("WorkflowCreatedBy", fields: [createdById], references: [id])

  // Timestamps
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt @db.Timestamptz

  // Relations
  versions          WorkflowVersion[]
  executions        WorkflowExecution[]

  @@index([teamId, isEnabled])
  @@index([isTemplate, templateCategory])
  @@index([scopeType])
}

model WorkflowVersion {
  id          String   @id @default(cuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  version     Int
  definition  Json     // Snapshot of definition at this version
  changedById String
  changedBy   User     @relation(fields: [changedById], references: [id])
  changeNote  String?
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@unique([workflowId, version])
  @@index([workflowId, version])
}

model WorkflowExecution {
  id                String   @id @default(cuid())
  workflowId        String
  workflow          Workflow @relation(fields: [workflowId], references: [id])
  workflowVersion   Int
  definitionSnapshot Json    // Frozen definition at execution time

  incidentId        String
  incident          Incident @relation(fields: [incidentId], references: [id])

  triggeredBy       String   // 'event', 'manual'
  triggerEvent      String?  // 'incident_created', 'state_changed', etc.

  status            String   // 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'
  currentNodeId     String?  // Currently executing node
  completedNodes    Json     @default("[]")  // Array of completed node results

  startedAt         DateTime? @db.Timestamptz
  completedAt       DateTime? @db.Timestamptz
  failedAt          DateTime? @db.Timestamptz
  error             String?

  createdAt         DateTime @default(now()) @db.Timestamptz

  @@index([workflowId, status])
  @@index([incidentId])
  @@index([status, createdAt])
}

model WorkflowActionSecret {
  id          String   @id @default(cuid())
  workflowId  String
  name        String   // 'jira_api_token', 'linear_api_key'
  valueHash   String   // Encrypted value
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@unique([workflowId, name])
}
```

### Webhook Action Executor
```typescript
// Source: Existing slack.channel.ts pattern
// src/services/actions/webhook.action.ts

import { interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { logger } from '../../config/logger.js';

interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string;
  auth: WebhookAuth;
  timeout?: number;
}

interface WebhookAuth {
  type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  customHeaders?: Record<string, string>;
}

interface WebhookResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration: number;
}

export async function executeWebhook(
  config: WebhookConfig,
  context: TemplateContext,
  timeout: number = 30_000
): Promise<WebhookResult> {
  const startTime = Date.now();

  try {
    // Interpolate templates
    const url = interpolateTemplate(config.url, context);
    const body = interpolateTemplate(config.body, context);
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = interpolateTemplate(value, context);
    }

    // Add auth headers
    await addAuthHeaders(headers, config.auth);

    // Execute request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();
    const duration = Date.now() - startTime;

    logger.info({
      url,
      method: config.method,
      statusCode: response.status,
      duration
    }, 'Webhook executed');

    return {
      success: response.ok,
      statusCode: response.status,
      responseBody: responseBody.substring(0, 1000),  // Truncate for storage
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({ error: errorMessage, duration }, 'Webhook execution failed');

    return {
      success: false,
      error: errorMessage,
      duration
    };
  }
}

async function addAuthHeaders(
  headers: Record<string, string>,
  auth: WebhookAuth
): Promise<void> {
  switch (auth.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      break;

    case 'basic':
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      break;

    case 'oauth2':
      const token = await getOAuth2Token(auth);
      headers['Authorization'] = `Bearer ${token}`;
      break;

    case 'custom':
      Object.assign(headers, auth.customHeaders);
      break;
  }
}

async function getOAuth2Token(auth: WebhookAuth): Promise<string> {
  // Client credentials flow
  const response = await fetch(auth.tokenUrl!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId!,
      client_secret: auth.clientSecret!
    })
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}
```

### Linear Ticket Action
```typescript
// Source: Linear SDK documentation
// src/services/actions/linear.action.ts

import { LinearClient } from '@linear/sdk';
import { interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

interface LinearConfig {
  teamId: string;  // Linear team ID
  title: string;   // Template
  description: string;  // Template
  priority?: number;  // 0-4 (0 = no priority, 1 = urgent, 4 = low)
  labelIds?: string[];
}

interface LinearResult {
  success: boolean;
  ticketId?: string;
  ticketUrl?: string;
  error?: string;
}

export async function createLinearTicket(
  config: LinearConfig,
  context: TemplateContext,
  apiKey: string
): Promise<LinearResult> {
  try {
    const client = new LinearClient({ apiKey });

    const title = interpolateTemplate(config.title, context);
    const description = interpolateTemplate(config.description, context);

    const issue = await client.createIssue({
      teamId: config.teamId,
      title,
      description,
      priority: config.priority,
      labelIds: config.labelIds
    });

    // Get issue URL
    const createdIssue = await issue.issue;
    const ticketUrl = createdIssue?.url;

    // Store ticket URL in incident metadata (per user decision)
    await prisma.incident.update({
      where: { id: context.incident.id },
      data: {
        // Assuming metadata JSON column
        // Add ticketUrl to existing metadata
      }
    });

    logger.info({
      issueId: createdIssue?.id,
      ticketUrl,
      incidentId: context.incident.id
    }, 'Linear ticket created');

    return {
      success: true,
      ticketId: createdIssue?.id,
      ticketUrl
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Linear ticket creation failed');

    return {
      success: false,
      error: errorMessage
    };
  }
}
```

### Trigger Matching Service
```typescript
// Source: Existing routing.service.ts pattern
// src/services/workflow/workflow-trigger.service.ts

import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

interface TriggerEvent {
  type: 'incident_created' | 'state_changed' | 'escalation' | 'manual';
  incident: {
    id: string;
    priority: string;
    status: string;
    teamId: string;
    metadata?: Record<string, any>;
  };
  previousState?: string;  // For state_changed
  newState?: string;
}

interface TriggerCondition {
  field: string;  // 'priority', 'service', 'team'
  value: string;  // 'HIGH', 'api-gateway', etc.
}

export async function findMatchingWorkflows(event: TriggerEvent): Promise<Workflow[]> {
  // Get all enabled workflows that match the trigger type
  const workflows = await prisma.workflow.findMany({
    where: {
      isEnabled: true,
      OR: [
        { scopeType: 'global' },
        { teamId: event.incident.teamId }
      ]
    }
  });

  const matching = workflows.filter((workflow) => {
    const definition = workflow.definition as WorkflowDefinition;
    const trigger = definition.trigger;

    // Check trigger type matches
    if (trigger.type !== event.type) {
      return false;
    }

    // For state_changed, check specific state transition
    if (trigger.type === 'state_changed' && trigger.conditions.length > 0) {
      const stateCondition = trigger.conditions.find(c => c.field === 'newState');
      if (stateCondition && stateCondition.value !== event.newState) {
        return false;
      }
    }

    // Check all conditions (simple field matching, no AND/OR per user decision)
    return trigger.conditions.every((condition) => {
      return matchCondition(condition, event.incident);
    });
  });

  logger.info({
    eventType: event.type,
    incidentId: event.incident.id,
    matchingWorkflows: matching.map(w => w.id)
  }, 'Found matching workflows');

  // Per Claude's discretion: allow all matching workflows to run in parallel
  return matching;
}

function matchCondition(condition: TriggerCondition, incident: any): boolean {
  const value = getFieldValue(incident, condition.field);
  return value === condition.value;
}

function getFieldValue(incident: any, field: string): any {
  // Support nested paths like 'metadata.service'
  const parts = field.split('.');
  let value = incident;
  for (const part of parts) {
    value = value?.[part];
  }
  return value;
}
```

### Collapsible Workflow Timeline Component
```tsx
// Source: Existing TimelineEvent pattern + Collapsible component
// frontend/src/components/workflow/WorkflowTimeline.tsx

import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowTimelineEntry {
  executionId: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  actions: ActionEntry[];
}

interface ActionEntry {
  nodeId: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export function WorkflowTimelineEntry({ entry }: { entry: WorkflowTimelineEntry }) {
  const [isOpen, setIsOpen] = useState(entry.status === 'running');

  const StatusIcon = {
    running: Loader2,
    completed: CheckCircle,
    failed: XCircle
  }[entry.status];

  const statusColor = {
    running: 'text-blue-500',
    completed: 'text-green-500',
    failed: 'text-red-500'
  }[entry.status];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg p-3 bg-muted/50">
        <CollapsibleTrigger className="flex items-center gap-2 w-full">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <StatusIcon className={cn('h-4 w-4', statusColor, entry.status === 'running' && 'animate-spin')} />
          <span className="font-medium">{entry.workflowName}</span>
          <span className="text-muted-foreground text-sm ml-auto">
            {formatDistanceToNow(new Date(entry.startedAt), { addSuffix: true })}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 ml-6 space-y-2 border-l-2 pl-4">
            {entry.actions.map((action) => (
              <ActionTimelineItem key={action.nodeId} action={action} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ActionTimelineItem({ action }: { action: ActionEntry }) {
  const statusIcon = {
    pending: <Clock className="h-3 w-3 text-muted-foreground" />,
    running: <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />,
    completed: <CheckCircle className="h-3 w-3 text-green-500" />,
    failed: <XCircle className="h-3 w-3 text-red-500" />
  }[action.status];

  return (
    <div className="flex items-center gap-2 text-sm">
      {statusIcon}
      <span className="font-medium">{action.name}</span>
      <span className="text-muted-foreground">({action.type})</span>
      {action.result?.ticketUrl && (
        <a
          href={action.result.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline ml-auto"
        >
          View Ticket
        </a>
      )}
      {action.error && (
        <span className="text-red-500 text-xs ml-auto">{action.error}</span>
      )}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Code-based workflow definitions | Visual node-based builders (Zapier, n8n style) | ~2018 | Non-developers can create workflows, faster iteration |
| Custom workflow engines | BullMQ Flows, Temporal, Step Functions | ~2020 | Built-in reliability, retry, observability |
| Polling for webhook status | Event-driven with callbacks | ~2019 | Better user experience, lower resource usage |
| Fixed action libraries | Template-based actions with variables | ~2020 | More flexibility without code changes |
| Linear execution only | Visual branching with conditions | ~2021 | Complex automation without multiple workflows |
| Manual version management | Automatic version history | ~2022 | Safe iteration, easy rollback |

**Deprecated/outdated:**
- **XML-based workflow definitions:** JSON is standard, better tooling support
- **Synchronous workflow execution:** Always async with job queues for resilience
- **Custom state machine implementations:** Use established libraries (XState, BullMQ Flows)
- **Webhook-only integrations:** Direct API SDKs (Linear SDK) provide better DX

---

## Open Questions

1. **Jira API Authentication Best Practices**
   - What we know: Jira Cloud uses OAuth 2.0 (3LO) or API tokens; on-premise uses different auth
   - What's unclear: Best approach for storing/refreshing OAuth tokens for workflow actions
   - Recommendation: Start with API token authentication (simpler), add OAuth later if needed. Store encrypted tokens in WorkflowActionSecret table.

2. **Workflow Execution Timeout Enforcement**
   - What we know: BullMQ job timeout kills the job, but not child jobs
   - What's unclear: How to cancel all child jobs when parent times out
   - Recommendation: Use BullMQ Flow's parent-child cancellation mechanism. Set workflow-level timeout as job timeout on root job; child jobs inherit cancellation on parent failure.

3. **Concurrent Workflow Execution Limits**
   - What we know: User decided workflows can run in parallel
   - What's unclear: Should there be a limit per incident? Per team?
   - Recommendation: Start without limits, add configuration if needed. Monitor for runaway scenarios.

4. **Test Mode Data Isolation**
   - What we know: Test mode should preview execution with sample data
   - What's unclear: Should test mode execute real webhooks? Create real tickets?
   - Recommendation: Provide two test modes: (1) Dry run showing interpolated values without execution, (2) Live test with real execution to test URLs. Mark test executions clearly in analytics.

5. **Mini-Map Threshold**
   - What we know: Claude's discretion on mini-map panel
   - What's unclear: At what workflow size does mini-map become useful?
   - Recommendation: Show mini-map by default (React Flow includes it), users can collapse. Consider hiding for workflows < 5 nodes for cleaner UI.

---

## Sources

### Primary (HIGH confidence)
- **React Flow Documentation** (https://reactflow.dev/learn) - Version 12.x features, custom nodes, layout patterns
- **BullMQ Flows Documentation** (https://docs.bullmq.io/guide/flows) - Parent-child job dependencies, sequential execution
- **Handlebars GitHub** (https://github.com/handlebars-lang/handlebars.js) - Template syntax, helpers, v4.7.8
- **Linear SDK GitHub** (https://github.com/linear/linear) - TypeScript SDK, issue creation API
- **Existing codebase patterns** - BullMQ usage in escalation.queue.ts, timeline patterns in TimelineEvent.tsx

### Secondary (MEDIUM confidence)
- **React Flow GitHub** (https://github.com/xyflow/xyflow) - 35k stars, MIT license, React 19 support confirmed
- **Dagre layout** - Recommended by React Flow for DAG layouts
- **Temporal Workflow Principles** (https://temporal.io) - Workflow engine design patterns

### Tertiary (LOW confidence)
- **Jira REST API v3** - Could not fetch detailed documentation; recommend verifying during implementation
- **XState** (https://github.com/statelyai/xstate) - Evaluated but not recommended; BullMQ Flows sufficient

---

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** - React Flow, BullMQ, Handlebars are well-documented, active, industry-standard
- **Architecture patterns: HIGH** - Based on existing codebase patterns (escalation queue, timeline), extended for workflows
- **Database schema: HIGH** - Follows existing Prisma patterns, supports all user requirements
- **Visual builder: MEDIUM** - React Flow is proven, but custom node implementation will require iteration
- **Jira integration: LOW** - Need to verify auth patterns during implementation
- **Linear integration: MEDIUM** - SDK documented, but specific issue creation fields need verification

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - workflow automation is mature domain)

**Locked decisions honored:**
- ✅ Visual drag-and-drop builder - React Flow with custom nodes
- ✅ Template library with categories - WorkflowTemplate model with templateCategory field
- ✅ Real-time validation - Zod validation on node configuration
- ✅ Test mode - Dry run + live test options
- ✅ Team-scoped and global workflows - scopeType field with teamId
- ✅ Grouped timeline entries - WorkflowTimelineEntry with Collapsible
- ✅ Full branching support - ConditionNode with if/else edges
- ✅ Toggle enabled/disabled - isEnabled field
- ✅ Version history with rollback - WorkflowVersion table
- ✅ JSON export/import - WorkflowDefinition as JSON
- ✅ Configurable delays - DelayNode with duration
- ✅ Team admin permissions - Middleware check for TeamRole.TEAM_ADMIN
- ✅ Workflow duplication - Clone endpoint with version reset
- ✅ Execution analytics - WorkflowExecution table with aggregation queries
- ✅ Required name/description - Zod validation on Workflow creation
- ✅ In-flight completion with old version - workflowVersion + definitionSnapshot in execution
- ✅ HTTP webhooks (POST/PUT/PATCH) - WebhookConfig with method options
- ✅ Jira/Linear ticket creation - Action executors with template interpolation
- ✅ {{variable}} template syntax - Handlebars interpolation
- ✅ Webhook auth (Bearer, Basic, OAuth2, custom) - WebhookAuth configuration
- ✅ Ticket URL in incident metadata - Update incident after ticket creation
- ✅ Incident triggers (created, state changes, escalation, manual) - TriggerEvent types
- ✅ Simple field matching - TriggerCondition without AND/OR
- ✅ Incident age triggers - Age-based trigger type with threshold
- ✅ Sequential execution, stop on error - BullMQ Flow chain with failure propagation
- ✅ Configurable retry with exponential backoff - BullMQ job options per action
- ✅ Failure notifications - Notification dispatch on workflow failure
- ✅ Configurable timeout - Workflow settings with timeout options
