# Phase 15: Runbook Automation Foundation - Research

**Researched:** 2026-02-08
**Domain:** Script library management, webhook execution, JSON Schema parameter validation
**Confidence:** HIGH

## Summary

Phase 15 builds runbook automation infrastructure that closely mirrors the existing workflow system. The codebase already contains mature patterns for versioned definitions (Workflow), webhook execution with retry (webhook.action.ts), Handlebars templating (template.service.ts), queue-based execution (BullMQ), and audit logging. The runbook system should reuse these patterns directly rather than building new abstractions.

The key differentiator from workflows is the **approval gate**: runbooks require explicit PLATFORM_ADMIN approval before execution. This adds a DRAFT -> APPROVED -> DEPRECATED lifecycle that workflows don't have. The other major addition is **JSON Schema parameter validation** to ensure runbook parameters conform to expected types before webhook execution.

**Primary recommendation:** Implement runbooks as a parallel system to workflows, reusing the webhook action executor, Handlebars templating, and queue infrastructure. Use Zod for JSON Schema validation (it can generate schemas and validate against them). Follow the established service/routes/types pattern exactly.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^6.0.0 | Database ORM | Already used for all models; established patterns |
| BullMQ | ^5.67.3 | Job queue for execution | Workflow queue pattern already proven |
| Handlebars | ^4.7.8 | Parameter templating | Existing template.service.ts handles safely |
| Zod | ^4.3.0 | Request validation + JSON Schema | Already used everywhere; can parse JSON Schema-like definitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Date handling | Formatting timestamps in audit logs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zod for JSON Schema | ajv | ajv is the canonical JSON Schema validator but adds a dependency; Zod already handles our needs |
| BullMQ | Direct execution | Queue provides retry, monitoring, and graceful shutdown |
| Custom templating | Handlebars | Handlebars already sandboxed and integrated |

**Installation:**
No new packages required - all dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
prisma/
  schema.prisma              # Add Runbook, RunbookVersion, RunbookExecution models

src/
  types/
    runbook.ts               # Type definitions (mirrors workflow.ts pattern)
  services/
    runbook/
      runbook.service.ts     # CRUD + version + approval (mirrors workflow.service.ts)
      runbook-executor.service.ts  # Execution logic (mirrors workflow-executor.service.ts)
  routes/
    runbook.routes.ts        # REST endpoints (mirrors workflow.routes.ts)
  queues/
    runbook.queue.ts         # Job queue (mirrors workflow.queue.ts)
  workers/
    runbook.worker.ts        # Job processor (mirrors workflow.worker.ts)

frontend/
  src/
    types/runbook.ts         # Frontend type definitions
    hooks/useRunbooks.ts     # React Query hooks
    pages/RunbooksPage.tsx   # List page (mirrors WorkflowsPage.tsx)
    components/runbook/
      RunbookForm.tsx        # Create/edit form with JSON Schema parameter builder
      RunbookCard.tsx        # List card component
```

### Pattern 1: Approval State Machine
**What:** Runbook lifecycle with DRAFT -> APPROVED -> DEPRECATED transitions
**When to use:** Any resource requiring explicit approval before activation
**Example:**
```typescript
// ApprovalStatus enum in Prisma schema
enum RunbookApprovalStatus {
  DRAFT       // Initial state, can be edited
  APPROVED    // Platform admin approved, can be executed
  DEPRECATED  // Soft-delete, not executable but preserved for audit
}

// Only PLATFORM_ADMIN can transition to APPROVED
async function approveRunbook(id: string, user: AuthenticatedUser) {
  if (!permissionService.isPlatformAdmin(user)) {
    throw new Error('Only platform admins can approve runbooks');
  }

  const runbook = await prisma.runbook.findUnique({ where: { id } });
  if (runbook.approvalStatus !== 'DRAFT') {
    throw new Error('Only DRAFT runbooks can be approved');
  }

  // Create new version snapshot on approval
  const nextVersion = runbook.version + 1;
  await prisma.$transaction([
    prisma.runbook.update({
      where: { id },
      data: { approvalStatus: 'APPROVED', version: nextVersion }
    }),
    prisma.runbookVersion.create({
      data: {
        runbookId: id,
        version: nextVersion,
        definition: runbook.definition,
        changedById: user.id,
        changeNote: 'Approved for production'
      }
    })
  ]);
}
```

### Pattern 2: JSON Schema Parameter Validation with Zod
**What:** Define parameters as JSON Schema-like structure, validate at execution time
**When to use:** User-defined parameter schemas that need runtime validation
**Example:**
```typescript
// Parameter schema stored in runbook.parameters JSON field
interface RunbookParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean';
    description?: string;
    default?: unknown;
    enum?: (string | number)[];  // For select inputs
  }>;
  required?: string[];
}

// Validate parameters against schema at execution time
import { z } from 'zod';

function validateParameters(
  schema: RunbookParameterSchema,
  values: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  // Build Zod schema from JSON Schema definition
  const zodSchema = z.object(
    Object.fromEntries(
      Object.entries(schema.properties).map(([key, prop]) => {
        let fieldSchema;
        switch (prop.type) {
          case 'string':
            fieldSchema = prop.enum ? z.enum(prop.enum as [string, ...string[]]) : z.string();
            break;
          case 'number':
            fieldSchema = z.number();
            break;
          case 'boolean':
            fieldSchema = z.boolean();
            break;
        }

        // Handle optional vs required
        const isRequired = schema.required?.includes(key) ?? false;
        return [key, isRequired ? fieldSchema : fieldSchema.optional()];
      })
    )
  );

  const result = zodSchema.safeParse(values);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
  };
}
```

### Pattern 3: Execution Context Building (Reuse workflow templating)
**What:** Build incident context for Handlebars templating in runbook payload
**When to use:** Preparing data for webhook body interpolation
**Example:**
```typescript
// Reuse existing buildTemplateContext from workflow system
import { buildTemplateContext, interpolateTemplate } from '../workflow/template.service.js';

async function buildRunbookExecutionPayload(
  runbook: Runbook,
  incidentId: string,
  parameters: Record<string, unknown>,
  executionId: string
): Promise<string> {
  // Get incident context (same as workflow)
  const context = await buildTemplateContext(
    incidentId,
    runbook.id,
    executionId,
    runbook.name
  );

  // Extend context with runbook-specific data
  const extendedContext = {
    ...context,
    runbook: {
      id: runbook.id,
      name: runbook.name,
      version: runbook.version
    },
    params: parameters  // User-provided parameters for {{params.serviceName}} etc
  };

  // Interpolate the execution payload template
  return interpolateTemplate(runbook.executionPayloadTemplate, extendedContext);
}
```

### Pattern 4: Webhook Execution with Retry (Reuse existing)
**What:** POST to webhook endpoint with exponential backoff retry
**When to use:** All runbook executions
**Example:**
```typescript
// Reuse existing executeWebhookWithRetry from workflow system
import { executeWebhookWithRetry, WebhookConfig } from '../actions/webhook.action.js';

async function executeRunbook(
  runbook: Runbook,
  context: TemplateContext,
  parameters: Record<string, unknown>
): Promise<RunbookExecutionResult> {
  const config: WebhookConfig = {
    url: runbook.webhookUrl,
    method: runbook.webhookMethod || 'POST',
    headers: runbook.webhookHeaders || {},
    body: interpolateTemplate(runbook.payloadTemplate, { ...context, params: parameters }),
    auth: runbook.webhookAuth || { type: 'none' }
  };

  // 3 retries with exponential backoff (per requirement AUTO-08)
  const result = await executeWebhookWithRetry(config, context, 3, 1000);

  return {
    success: result.success,
    statusCode: result.statusCode,
    responseBody: result.responseBody,
    error: result.error
  };
}
```

### Anti-Patterns to Avoid
- **Building custom webhook executor:** Reuse `executeWebhookWithRetry` from workflow system
- **Building custom templating:** Reuse `interpolateTemplate` from template.service.ts
- **In-process execution:** Always use BullMQ queue for reliability and monitoring
- **Skipping approval check at execution time:** Always verify `approvalStatus === 'APPROVED'` before executing

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP with retry | Custom fetch wrapper | `executeWebhookWithRetry` | Edge cases handled (timeouts, 5xx retry, logging) |
| Template interpolation | String replace | `interpolateTemplate` | Sandboxed Handlebars prevents injection |
| Job queue | setTimeout/setImmediate | BullMQ queue | Persistence, retry, monitoring, graceful shutdown |
| Parameter validation | Manual type checking | Zod schema builder | Type-safe, descriptive errors |
| Audit logging | Manual INSERT | `auditService.log()` | Consistent format, relations, indexing |

**Key insight:** The workflow system (Phase 8) already solved webhook execution, templating, queuing, and audit logging. Runbooks are a simpler variant (no complex flow, no conditions) but with an approval gate.

## Common Pitfalls

### Pitfall 1: Forgetting to Check Approval Status at Execution Time
**What goes wrong:** Runbook can be demoted to DRAFT/DEPRECATED between queue add and worker processing
**Why it happens:** Approval status can change while job is waiting in queue
**How to avoid:** Worker must re-fetch runbook and verify `approvalStatus === 'APPROVED'` before executing
**Warning signs:** Deprecated runbooks still executing occasionally

### Pitfall 2: Not Snapshotting Definition at Execution Time
**What goes wrong:** Runbook edited mid-execution causes inconsistent behavior
**Why it happens:** In-flight execution uses live definition instead of snapshot
**How to avoid:** Store `definitionSnapshot` in RunbookExecution record (same pattern as WorkflowExecution)
**Warning signs:** Execution logs don't match current runbook definition

### Pitfall 3: Missing Parameter Validation Before Queue
**What goes wrong:** Invalid parameters fail at webhook time, wasting retry attempts
**Why it happens:** Validation only happens in worker, not at trigger time
**How to avoid:** Validate parameters against schema in route handler before queuing
**Warning signs:** Many failed executions with "Invalid parameter type" errors

### Pitfall 4: Not Setting Timeouts on Webhook Calls
**What goes wrong:** Hung HTTP requests block worker indefinitely
**Why it happens:** Default fetch has no timeout; external services can hang
**How to avoid:** Use `executeWebhookWithRetry` which uses AbortController with 30s default
**Warning signs:** Worker concurrency exhausted, jobs stuck in "active" state

### Pitfall 5: Inadequate Audit Trail for Approval Changes
**What goes wrong:** Cannot trace who approved a runbook and when
**Why it happens:** Only logging CRUD, not state transitions
**How to avoid:** Explicit audit events for `runbook.approved`, `runbook.deprecated`
**Warning signs:** Compliance questions about "who approved this script?"

## Code Examples

### Database Schema (Prisma)
```prisma
// prisma/schema.prisma additions

enum RunbookApprovalStatus {
  DRAFT
  APPROVED
  DEPRECATED
}

model Runbook {
  id               String                @id @default(cuid())
  name             String
  description      String
  version          Int                   @default(1)

  // Webhook execution target
  webhookUrl       String                // URL to POST to (Ansible Tower, SSM, custom)
  webhookMethod    String                @default("POST")  // POST, PUT
  webhookHeaders   Json                  @default("{}")    // Additional headers
  webhookAuth      Json?                 // Auth config (same as WorkflowWebhookAuth)

  // Parameters defined as JSON Schema
  parameters       Json                  @default("{}")    // JSON Schema for params

  // Payload template (Handlebars)
  payloadTemplate  String                // Handlebars template for request body

  // Timeout (in seconds)
  timeoutSeconds   Int                   @default(300)     // 5 minutes per AUTO-08

  // Approval workflow
  approvalStatus   RunbookApprovalStatus @default(DRAFT)
  approvedById     String?
  approvedBy       User?                 @relation("RunbookApprovedBy", fields: [approvedById], references: [id])
  approvedAt       DateTime?             @db.Timestamptz

  // Scope (team or global)
  teamId           String?
  team             Team?                 @relation(fields: [teamId], references: [id])

  // Ownership
  createdById      String
  createdBy        User                  @relation("RunbookCreatedBy", fields: [createdById], references: [id])

  // Timestamps
  createdAt        DateTime              @default(now()) @db.Timestamptz
  updatedAt        DateTime              @updatedAt @db.Timestamptz

  // Relations
  versions         RunbookVersion[]
  executions       RunbookExecution[]

  @@index([teamId, approvalStatus])
  @@index([approvalStatus])
  @@index([createdById])
}

model RunbookVersion {
  id          String   @id @default(cuid())
  runbookId   String
  runbook     Runbook  @relation(fields: [runbookId], references: [id], onDelete: Cascade)
  version     Int
  definition  Json     // Snapshot of runbook at this version
  changedById String
  changedBy   User     @relation(fields: [changedById], references: [id])
  changeNote  String?
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@unique([runbookId, version])
  @@index([runbookId, version])
}

model RunbookExecution {
  id                 String   @id @default(cuid())
  runbookId          String
  runbook            Runbook  @relation(fields: [runbookId], references: [id])
  runbookVersion     Int      // Version at execution time

  // Frozen definition at execution time
  definitionSnapshot Json

  // Incident link (optional - can be manual trigger without incident)
  incidentId         String?
  incident           Incident? @relation(fields: [incidentId], references: [id])

  // Parameters used for this execution
  parameters         Json     @default("{}")

  // Execution state
  status             String   // PENDING, RUNNING, SUCCESS, FAILED
  result             Json?    // Response payload from webhook
  error              String?

  // Who triggered
  triggeredBy        String   // 'workflow' | 'manual'
  executedById       String?
  executedBy         User?    @relation(fields: [executedById], references: [id])

  // Timestamps
  startedAt          DateTime? @db.Timestamptz
  completedAt        DateTime? @db.Timestamptz
  createdAt          DateTime  @default(now()) @db.Timestamptz

  @@index([runbookId, status])
  @@index([incidentId])
  @@index([status, createdAt])
}
```

### Service Pattern (runbook.service.ts skeleton)
```typescript
// src/services/runbook/runbook.service.ts

import { z } from 'zod';
import { Prisma, RunbookApprovalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { auditService } from '../audit.service.js';
import { permissionService } from '../permission.service.js';
import { logger } from '../../config/logger.js';
import type { AuthenticatedUser } from '../../types/auth.js';

// Validation schemas (follow workflow.service.ts pattern)
export const createRunbookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  webhookUrl: z.string().url(),
  webhookMethod: z.enum(['POST', 'PUT']).optional(),
  webhookHeaders: z.record(z.string()).optional(),
  webhookAuth: z.any().optional(),
  parameters: z.any(), // JSON Schema for parameters
  payloadTemplate: z.string(),
  timeoutSeconds: z.number().int().min(30).max(900).optional(),
  teamId: z.string().optional()
});

export const runbookService = {
  // CRUD operations follow workflow.service.ts pattern exactly

  async approve(id: string, user: AuthenticatedUser) {
    // PLATFORM_ADMIN check
    if (!permissionService.isPlatformAdmin(user)) {
      throw new Error('Only platform admins can approve runbooks');
    }

    const runbook = await prisma.runbook.findUnique({ where: { id } });
    if (!runbook) throw new Error('Runbook not found');
    if (runbook.approvalStatus !== 'DRAFT') {
      throw new Error('Only DRAFT runbooks can be approved');
    }

    const newVersion = runbook.version + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.runbook.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
          version: newVersion
        }
      });

      // Create version snapshot
      await tx.runbookVersion.create({
        data: {
          runbookId: id,
          version: newVersion,
          definition: {
            name: runbook.name,
            description: runbook.description,
            webhookUrl: runbook.webhookUrl,
            webhookMethod: runbook.webhookMethod,
            webhookHeaders: runbook.webhookHeaders,
            parameters: runbook.parameters,
            payloadTemplate: runbook.payloadTemplate,
            timeoutSeconds: runbook.timeoutSeconds
          },
          changedById: user.id,
          changeNote: 'Approved for production'
        }
      });

      return result;
    });

    // Audit log
    await auditService.log({
      action: 'runbook.approved',
      userId: user.id,
      teamId: updated.teamId ?? undefined,
      resourceType: 'runbook',
      resourceId: id,
      severity: 'HIGH',
      metadata: { name: runbook.name, version: newVersion }
    });

    return updated;
  },

  async deprecate(id: string, user: AuthenticatedUser) {
    // Similar pattern to approve, changes to DEPRECATED
    // ...
  }
};
```

### Routes Pattern
```typescript
// src/routes/runbook.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { runbookService, createRunbookSchema } from '../services/runbook/runbook.service.js';
import type { AuthenticatedUser } from '../types/auth.js';

export const runbookRoutes = Router();
runbookRoutes.use(requireAuth);

// POST /api/runbooks - Create runbook (starts as DRAFT)
runbookRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRunbookSchema.parse(req.body);
    const user = req.user as AuthenticatedUser;
    const runbook = await runbookService.create(input, user);
    return res.status(201).json({ runbook });
  } catch (error) {
    // Error handling follows workflow.routes.ts pattern
  }
});

// POST /api/runbooks/:id/approve - Approve runbook (PLATFORM_ADMIN only)
runbookRoutes.post('/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as AuthenticatedUser;
    const runbook = await runbookService.approve(req.params.id, user);
    return res.json({ runbook });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('platform admin')) {
        return res.status(403).json({ error: error.message });
      }
    }
    return next(error);
  }
});

// POST /api/runbooks/:id/execute - Trigger manual execution
runbookRoutes.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { incidentId, parameters } = req.body;
    const user = req.user as AuthenticatedUser;

    // Validate parameters against schema before queuing
    const runbook = await runbookService.get(req.params.id, user);
    const validation = validateParameters(runbook.parameters, parameters);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid parameters', details: validation.errors });
    }

    const execution = await runbookService.triggerExecution(
      req.params.id,
      incidentId,
      parameters,
      user
    );

    return res.status(202).json({ execution });
  } catch (error) {
    // ...
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline script execution | Webhook-based external execution | Current | Security: scripts run outside platform boundary |
| No approval workflow | DRAFT/APPROVED/DEPRECATED lifecycle | Current | Compliance: change control audit trail |
| Static parameters | JSON Schema-defined parameters | Current | Flexibility: self-describing runbooks |

**Deprecated/outdated:**
- Direct shell execution from Node.js: Security risk, use webhooks to external automation platforms

## Open Questions

1. **Should runbook edits auto-revert to DRAFT?**
   - What we know: Requirements say version on edit, keep history
   - What's unclear: Does editing an APPROVED runbook require re-approval?
   - Recommendation: Yes, editing an APPROVED runbook should set status back to DRAFT (common compliance pattern). Document this behavior clearly in UI.

2. **What about secrets in webhook auth?**
   - What we know: Workflow system has WorkflowActionSecret model
   - What's unclear: Should runbooks share that or have RunbookSecret?
   - Recommendation: Create RunbookSecret with same pattern. Don't share with workflows to maintain separation of concerns.

3. **Should parameters support nested objects or arrays?**
   - What we know: Requirements say "JSON schema for validation"
   - What's unclear: How complex should parameter schemas be allowed?
   - Recommendation: Start with flat object (string/number/boolean properties only). Add nesting in future phase if needed.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/services/workflow/*.ts` - established patterns for versioning, execution, templating
- Codebase analysis: `src/services/actions/webhook.action.ts` - retry logic with exponential backoff
- Codebase analysis: `src/queues/workflow.queue.ts`, `src/workers/workflow.worker.ts` - BullMQ patterns
- Codebase analysis: `prisma/schema.prisma` - existing model patterns for User, Team, Workflow relations
- Codebase analysis: `src/services/permission.service.ts` - RBAC patterns for PLATFORM_ADMIN checks

### Secondary (MEDIUM confidence)
- Zod documentation: JSON Schema-like validation patterns
- BullMQ documentation: Queue configuration and worker patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already exist in codebase
- Architecture: HIGH - Direct mirror of workflow system patterns
- Pitfalls: HIGH - Based on analysis of workflow system and common queue patterns
- JSON Schema validation: MEDIUM - Zod can handle this but exact implementation TBD

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - stable patterns)
