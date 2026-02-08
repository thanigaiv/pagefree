# Architecture Research: v1.2 Runbook Automation & Partner Status Pages

**Domain:** OnCall Platform - Production Readiness Features
**Researched:** 2026-02-08
**Confidence:** HIGH (based on existing codebase patterns + industry standards)

## Executive Summary

This document details how runbook automation and partner status pages integrate with the existing OnCall platform architecture. Both features extend existing patterns rather than introducing new architectural paradigms.

**Key findings:**
1. Runbooks are a new workflow action type, not a separate system
2. Partner access extends existing token-based status page authentication
3. Both features reuse BullMQ workers and follow existing service patterns
4. Security boundaries require new isolation mechanisms for script execution

---

## System Overview: Current + New Components

```
                              EXISTING                                    NEW
+-----------------------------------------------------------------------------------+
|                              API LAYER                                            |
|  +-------------+  +-------------+  +-------------+  +-------------+  +---------+  |
|  | Auth Routes |  | Team Routes |  |Status Routes|  |Workflow Rts |  |Runbook  |  |
|  +------+------+  +------+------+  +------+------+  +------+------+  |Routes** |  |
|         |                |                |                |         +---------+  |
+---------+----------------+----------------+----------------+----------------------+
|                            SERVICE LAYER                                          |
|  +-------------+  +-------------+  +-------------+  +-------------+  +---------+  |
|  | Permission  |  | StatusPage  |  | Workflow    |  | Escalation  |  |Runbook  |  |
|  | Service     |  | Service     |  | Executor    |  | Service     |  |Service**|  |
|  +------+------+  +------+------+  +------+------+  +------+------+  +---------+  |
|         |                |                |                |                      |
+---------+----------------+----------------+----------------+----------------------+
|                            WORKER LAYER (BullMQ)                                  |
|  +-------------+  +-------------+  +-------------+  +-------------+  +---------+  |
|  | Escalation  |  | Notification|  | Workflow    |  | Maintenance |  |Runbook  |  |
|  | Worker      |  | Worker      |  | Worker      |  | Worker      |  |Worker** |  |
|  +------+------+  +------+------+  +------+------+  +------+------+  +---------+  |
|         |                |                |                |                      |
+---------+----------------+----------------+----------------+----------------------+
|                            DATA LAYER                                             |
|  +-------------+  +-------------+  +-------------+  +-------------+  +---------+  |
|  | User/Team   |  | StatusPage  |  | Workflow    |  | Incident    |  |Runbook  |  |
|  | Models      |  | + Partner** |  | + Runbook** |  | Models      |  |Models** |  |
|  +-------------+  +-------------+  +-------------+  +-------------+  +---------+  |
+-----------------------------------------------------------------------------------+

** = New components for v1.2
```

---

## Feature 1: Runbook Automation

### Integration Strategy

Runbooks integrate as a **new workflow action type** within the existing workflow system. This approach:
- Reuses workflow triggers, execution tracking, and failure notifications
- Follows established patterns for secrets management
- Leverages BullMQ job processing with existing retry/timeout logic

### New Components Required

| Component | Type | Purpose | Integrates With |
|-----------|------|---------|-----------------|
| `Runbook` | Prisma Model | Store script definitions, metadata, approval status | Team, Service |
| `RunbookVersion` | Prisma Model | Immutable script snapshots for audit/rollback | Runbook |
| `RunbookExecution` | Prisma Model | Track individual execution results | Incident, Runbook |
| `runbook.service.ts` | Service | CRUD, validation, version management | Existing team/permission services |
| `runbook.action.ts` | Action Handler | Execute scripts in workflow context | workflow-executor.service.ts |
| `runbook.worker.ts` | BullMQ Worker | Isolated script execution with sandboxing | runbook.queue.ts |
| `runbook.routes.ts` | API Routes | Admin management endpoints | Existing auth middleware |

### Data Model Design

```prisma
// New models for runbook automation

enum RunbookStatus {
  DRAFT           // Being created, not approved
  PENDING_REVIEW  // Submitted for approval
  APPROVED        // Ready for use
  DEPRECATED      // Still works but discouraged
  ARCHIVED        // Disabled
}

enum ScriptLanguage {
  BASH
  PYTHON
  JAVASCRIPT
}

model Runbook {
  id              String          @id @default(cuid())
  name            String
  description     String

  // Scope and ownership
  teamId          String
  team            Team            @relation(fields: [teamId], references: [id])
  serviceId       String?         // Optional: restrict to specific service
  service         Service?        @relation(fields: [serviceId], references: [id])

  // Script definition
  language        ScriptLanguage
  currentVersion  Int             @default(1)

  // Lifecycle
  status          RunbookStatus   @default(DRAFT)
  approvedById    String?
  approvedAt      DateTime?       @db.Timestamptz

  // Execution constraints
  timeoutSeconds  Int             @default(60)     // Max 300
  maxRetries      Int             @default(0)      // Max 3
  requiresConfirm Boolean         @default(false)  // Manual trigger requires confirmation

  // Relations
  versions        RunbookVersion[]
  executions      RunbookExecution[]

  createdById     String
  createdAt       DateTime        @default(now()) @db.Timestamptz
  updatedAt       DateTime        @updatedAt @db.Timestamptz

  @@unique([teamId, name])
  @@index([teamId, status])
  @@index([serviceId])
}

model RunbookVersion {
  id            String   @id @default(cuid())
  runbookId     String
  runbook       Runbook  @relation(fields: [runbookId], references: [id], onDelete: Cascade)
  version       Int
  scriptContent String   // The actual script (immutable)
  parameters    Json     @default("[]")  // Parameter definitions
  changeNote    String?
  createdById   String
  createdAt     DateTime @default(now()) @db.Timestamptz

  @@unique([runbookId, version])
}

model RunbookExecution {
  id           String   @id @default(cuid())
  runbookId    String
  runbook      Runbook  @relation(fields: [runbookId], references: [id])
  versionUsed  Int      // Which version was executed

  // Trigger context
  incidentId   String?
  incident     Incident? @relation(fields: [incidentId], references: [id])
  triggeredBy  String    // 'workflow' | 'manual'
  triggeredById String?  // User who triggered (if manual)

  // Execution state
  status       String    // PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, TIMEOUT
  parameters   Json      @default("{}")  // Actual parameters used

  // Results
  stdout       String?   // Captured output (truncated at 64KB)
  stderr       String?   // Captured errors (truncated at 64KB)
  exitCode     Int?
  error        String?   // System-level error if any

  // Timing
  startedAt    DateTime? @db.Timestamptz
  completedAt  DateTime? @db.Timestamptz

  createdAt    DateTime  @default(now()) @db.Timestamptz

  @@index([runbookId, status])
  @@index([incidentId])
  @@index([status, createdAt])
}
```

### Workflow Integration Point

Runbooks become a new action type in the existing workflow system:

```typescript
// In workflow-executor.service.ts - extend executeActionNode

case 'runbook':
  return await executeRunbookAction(node.id, data, context, secrets, remainingTimeout);

// New function
async function executeRunbookAction(
  nodeId: string,
  data: RunbookActionData,
  context: TemplateContext,
  secrets: Map<string, string>,
  remainingTimeout: number
): Promise<NodeResult> {
  // 1. Load runbook and verify APPROVED status
  // 2. Resolve parameters using template context
  // 3. Queue execution job (separate worker for isolation)
  // 4. Wait for completion or timeout
  // 5. Return result with stdout/stderr
}
```

### Security Isolation Architecture

**Critical:** Script execution MUST be isolated from the main application process.

```
+------------------------------------------------------------------+
|  Main Application Process                                         |
|  +------------------+      +------------------+                   |
|  | Workflow Worker  | ---> | Runbook Queue    |                   |
|  +------------------+      +--------+---------+                   |
|                                     |                             |
+------------------------------------------------------------------+
                                      | Job dispatch
                                      v
+------------------------------------------------------------------+
|  Runbook Worker Process (separate Node.js process)               |
|  +------------------+                                             |
|  | Job Processor    |                                             |
|  +--------+---------+                                             |
|           |                                                       |
|           v                                                       |
|  +------------------+      +------------------+                   |
|  | Script Sandbox   | ---> | Child Process    |                   |
|  | (vm2 or similar) |      | (spawn with      |                   |
|  +------------------+      | resource limits) |                   |
|                            +------------------+                   |
+------------------------------------------------------------------+
```

**Isolation mechanisms:**

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Process | Separate worker process | Crash isolation from main app |
| Execution | Child process spawn | Script runs outside Node.js |
| Resources | ulimit / cgroups | CPU, memory, disk limits |
| Network | Optional: network namespace | Prevent script from calling external services |
| Filesystem | Temp directory only | No access to application files |
| Time | Hard timeout via `kill` | Prevent runaway scripts |

### Execution Flow

```
[Incident Trigger] or [Manual Execution]
         |
         v
+------------------+
| Workflow Service | (existing)
| - Check runbook status = APPROVED
| - Resolve parameters
| - Create RunbookExecution record
+--------+---------+
         |
         v
+------------------+
| Runbook Queue    | (new)
| - Add job with executionId
| - Set timeout, retries
+--------+---------+
         |
         v (separate process)
+------------------+
| Runbook Worker   | (new)
| - Load execution & script
| - Spawn child process
| - Capture stdout/stderr
| - Enforce timeout
| - Update execution record
+--------+---------+
         |
         v
+------------------+
| Result Handling  |
| - Update RunbookExecution
| - Continue workflow (success)
| - OR trigger failure notifications
+------------------+
```

### Permission Model Extension

```typescript
// Extend permission.service.ts

/**
 * Check if user can manage runbooks (create, edit, approve)
 * Only TEAM_ADMIN or PLATFORM_ADMIN
 */
canManageRunbooks(user: AuthenticatedUser, teamId: string): PermissionResult {
  if (this.isPlatformAdmin(user)) return { allowed: true };

  const role = this.getTeamRole(user, teamId);
  if (role === 'TEAM_ADMIN') return { allowed: true };

  return { allowed: false, reason: 'Only team admins can manage runbooks' };
}

/**
 * Check if user can execute runbooks manually
 * RESPONDER or above
 */
canExecuteRunbook(user: AuthenticatedUser, teamId: string): PermissionResult {
  if (this.isPlatformAdmin(user)) return { allowed: true };

  return this.hasMinimumTeamRole(user, teamId, 'RESPONDER')
    ? { allowed: true }
    : { allowed: false, reason: 'Only responders can execute runbooks' };
}

/**
 * Check if user can approve runbooks
 * TEAM_ADMIN only (cannot approve own runbooks)
 */
canApproveRunbook(user: AuthenticatedUser, teamId: string, createdById: string): PermissionResult {
  if (user.id === createdById) {
    return { allowed: false, reason: 'Cannot approve your own runbook' };
  }
  return this.canManageRunbooks(user, teamId);
}
```

---

## Feature 2: Partner Status Pages

### Integration Strategy

Partner access extends the existing token-based access pattern for private status pages. Instead of a single `accessToken`, we introduce a `PartnerAccess` model that enables:
- Multiple partners per status page
- Per-partner revocation without regenerating tokens
- Partner identity tracking for audit logs
- Optional IP allowlisting

### New Components Required

| Component | Type | Purpose | Integrates With |
|-----------|------|---------|-----------------|
| `PartnerAccess` | Prisma Model | Partner credentials and permissions | StatusPage |
| `PartnerSession` | Prisma Model | Track partner authentication sessions | PartnerAccess |
| `partner.service.ts` | Service | Partner CRUD, token management | statusPage.service.ts |
| `partner-auth.middleware.ts` | Middleware | Authenticate partner requests | statusPublic.routes.ts |
| Partner management routes | API Routes | Admin endpoints for partner management | statusPage.routes.ts |

### Data Model Design

```prisma
// New models for partner access

model PartnerAccess {
  id              String      @id @default(cuid())
  statusPageId    String
  statusPage      StatusPage  @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  // Partner identity
  partnerName     String      // e.g., "Acme Corp", "Client XYZ"
  contactEmail    String      // For notifications

  // Authentication
  accessToken     String      @unique  // Bearer token (hashed for storage)
  tokenPrefix     String               // First 8 chars for identification

  // Access control
  isActive        Boolean     @default(true)
  ipAllowlist     String[]    @default([])  // Empty = any IP allowed

  // Usage tracking
  lastAccessAt    DateTime?   @db.Timestamptz
  accessCount     Int         @default(0)

  // Lifecycle
  expiresAt       DateTime?   @db.Timestamptz  // Optional expiration
  createdById     String
  createdAt       DateTime    @default(now()) @db.Timestamptz
  revokedAt       DateTime?   @db.Timestamptz
  revokedById     String?

  // Relations
  sessions        PartnerSession[]

  @@unique([statusPageId, partnerName])
  @@index([statusPageId, isActive])
  @@index([accessToken])
}

model PartnerSession {
  id              String        @id @default(cuid())
  partnerAccessId String
  partnerAccess   PartnerAccess @relation(fields: [partnerAccessId], references: [id], onDelete: Cascade)

  // Session tracking
  ipAddress       String
  userAgent       String?

  // Timestamps
  startedAt       DateTime      @default(now()) @db.Timestamptz
  lastActiveAt    DateTime      @default(now()) @db.Timestamptz

  @@index([partnerAccessId])
  @@index([startedAt])
}

// Extend StatusPage model (add relation)
// StatusPage.partnerAccess PartnerAccess[]
```

### Authentication Flow

Partner authentication follows a different path than internal user authentication:

```
[Partner Request to /status/:slug]
         |
         v
+------------------------+
| partner-auth.middleware |
| 1. Check Authorization header
| 2. If Bearer token present:
|    - Hash token, lookup PartnerAccess
|    - Verify isActive, not expired
|    - Check IP allowlist (if configured)
|    - Create/update PartnerSession
|    - Attach partner context to request
| 3. If no Bearer token:
|    - Fall back to ?token= query param
|    - (existing behavior for simple access)
+------------------------+
         |
         v
+------------------------+
| statusPublic.routes.ts |
| - req.partnerAccess available
| - Log access for partner audit
+------------------------+
```

### Middleware Implementation Pattern

```typescript
// partner-auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface PartnerContext {
  partnerId: string;
  partnerName: string;
  statusPageId: string;
}

declare global {
  namespace Express {
    interface Request {
      partnerAccess?: PartnerContext;
    }
  }
}

/**
 * Authenticate partner requests.
 * Checks Bearer token, validates partner access, enforces IP allowlist.
 * Non-blocking: continues without partner context if no token provided.
 */
export async function partnerAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    // No partner token, continue (may use ?token= query param later)
    return next();
  }

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Look up partner access
  const partnerAccess = await prisma.partnerAccess.findUnique({
    where: { accessToken: tokenHash },
    include: { statusPage: { select: { id: true, slug: true } } }
  });

  if (!partnerAccess) {
    res.status(401).json({ error: 'Invalid partner token' });
    return;
  }

  // Check active status
  if (!partnerAccess.isActive || partnerAccess.revokedAt) {
    res.status(403).json({ error: 'Partner access revoked' });
    return;
  }

  // Check expiration
  if (partnerAccess.expiresAt && new Date() > partnerAccess.expiresAt) {
    res.status(403).json({ error: 'Partner access expired' });
    return;
  }

  // Check IP allowlist (if configured)
  if (partnerAccess.ipAllowlist.length > 0) {
    const clientIp = req.ip || req.socket.remoteAddress;
    if (!partnerAccess.ipAllowlist.includes(clientIp!)) {
      res.status(403).json({ error: 'IP address not allowed' });
      return;
    }
  }

  // Attach partner context
  req.partnerAccess = {
    partnerId: partnerAccess.id,
    partnerName: partnerAccess.partnerName,
    statusPageId: partnerAccess.statusPageId
  };

  // Update usage tracking (fire and forget)
  prisma.partnerAccess.update({
    where: { id: partnerAccess.id },
    data: {
      lastAccessAt: new Date(),
      accessCount: { increment: 1 }
    }
  }).catch(() => {}); // Non-blocking

  next();
}
```

### Route Updates

```typescript
// statusPublic.routes.ts updates

import { partnerAuthMiddleware } from '../middleware/partner-auth.middleware.js';

const router = Router();

// Apply partner auth to all status page public routes
router.use(partnerAuthMiddleware);

// GET /status/:slug - existing route, now partner-aware
router.get('/:slug', async (req, res, next) => {
  const { slug } = req.params;
  const { token } = req.query;

  // Partner access takes precedence
  if (req.partnerAccess) {
    const statusPage = await statusPageService.getBySlugForPartner(
      slug,
      req.partnerAccess.partnerId
    );
    // ... rest of handler
  }

  // Fall back to token-based access (existing behavior)
  const statusPage = await statusPageService.getBySlug(slug, token as string);
  // ... existing handler
});
```

### Admin Management Endpoints

```typescript
// Add to statusPage.routes.ts

// Partner management (team admin only)
router.post(
  '/:statusPageId/partners',
  requireAuth,
  requireTeamRole('TEAM_ADMIN'),
  createPartnerAccess
);

router.get(
  '/:statusPageId/partners',
  requireAuth,
  requireTeamRole('OBSERVER'),  // Read access for observers
  listPartners
);

router.patch(
  '/:statusPageId/partners/:partnerId',
  requireAuth,
  requireTeamRole('TEAM_ADMIN'),
  updatePartnerAccess
);

router.delete(
  '/:statusPageId/partners/:partnerId',
  requireAuth,
  requireTeamRole('TEAM_ADMIN'),
  revokePartnerAccess
);

router.post(
  '/:statusPageId/partners/:partnerId/regenerate-token',
  requireAuth,
  requireTeamRole('TEAM_ADMIN'),
  regeneratePartnerToken
);
```

---

## Data Flow: Complete Picture

### Runbook Execution Data Flow

```
+------------------+     +------------------+     +------------------+
| Incident Created | --> | Workflow Trigger | --> | Match Runbook    |
| (alert.service)  |     | (workflow-       |     | Action Node      |
|                  |     |  integration.ts) |     |                  |
+------------------+     +------------------+     +--------+---------+
                                                          |
                         +------------------+             |
                         | Create Execution | <-----------+
                         | Record (PENDING) |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         | Runbook Queue    |
                         | (runbook.queue)  |
                         +--------+---------+
                                  |
                                  v (separate process)
                         +------------------+
                         | Runbook Worker   |
                         | 1. Load script   |
                         | 2. Spawn process |
                         | 3. Capture output|
                         | 4. Enforce limits|
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         | Update Execution |
                         | (COMPLETED/FAILED)|
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         | Workflow resumes |
                         | or sends failure |
                         | notification     |
                         +------------------+
```

### Partner Status Page Data Flow

```
+------------------+     +------------------+     +------------------+
| Partner Request  | --> | Auth Middleware  | --> | Validate Token   |
| GET /status/slug |     | (partner-auth)   |     | + IP + Expiry    |
+------------------+     +------------------+     +--------+---------+
                                                          |
                         +------------------+             |
                         | Status Page      | <-----------+
                         | Service          |     If partner valid
                         | (compute status) |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         | Response with    |
                         | components +     |
                         | computed status  |
                         +------------------+
                                  |
                                  v (async)
                         +------------------+
                         | Track session    |
                         | + audit log      |
                         +------------------+
```

---

## Build Order: Dependency Analysis

### Phase Dependencies

```
                          +-------------------+
                          | Phase A: Runbook  |
                          | Data Model        |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
          +-------------------+         +-------------------+
          | Phase B: Runbook  |         | Phase C: Workflow |
          | Service + Routes  |         | Integration       |
          +--------+----------+         +--------+----------+
                   |                             |
                   +-------------+---------------+
                                 |
                                 v
                       +-------------------+
                       | Phase D: Runbook  |
                       | Worker + Sandbox  |
                       +-------------------+


                          +-------------------+
                          | Phase E: Partner  |
                          | Data Model        |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
          +-------------------+         +-------------------+
          | Phase F: Partner  |         | Phase G: Partner  |
          | Auth Middleware   |         | Admin Routes      |
          +--------+----------+         +-------------------+
                   |
                   v
          +-------------------+
          | Phase H: Public   |
          | Route Updates     |
          +-------------------+
```

### Recommended Build Sequence

| Order | Phase | Duration | Dependencies | Risk |
|-------|-------|----------|--------------|------|
| 1 | Runbook Data Model | 2h | None | LOW |
| 2 | Runbook Service + Routes | 4h | Phase 1 | LOW |
| 3 | Partner Data Model | 1h | None (parallel with 1-2) | LOW |
| 4 | Partner Service + Admin Routes | 3h | Phase 3 | LOW |
| 5 | Workflow Runbook Integration | 4h | Phase 2 | MEDIUM |
| 6 | Partner Auth Middleware | 3h | Phase 4 | LOW |
| 7 | Public Route Updates | 2h | Phase 6 | LOW |
| 8 | Runbook Worker + Sandbox | 8h | Phase 5 | HIGH |

**Critical path:** Runbook Worker (Phase 8) is the highest risk item due to security isolation requirements. Consider prototyping early.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running Scripts in Main Process

**What people do:** Execute scripts using `eval()` or `vm` module in the API process.
**Why it's wrong:** Crash in script takes down entire API; no resource limits; security nightmare.
**Do this instead:** Spawn separate child process with resource limits; use dedicated worker process.

### Anti-Pattern 2: Single Token for All Partners

**What people do:** Share one `accessToken` across all partners.
**Why it's wrong:** Cannot revoke single partner; no audit trail per partner; token compromise affects all.
**Do this instead:** Unique token per partner with individual tracking and revocation.

### Anti-Pattern 3: Storing Partner Tokens in Plain Text

**What people do:** Store the raw bearer token in the database.
**Why it's wrong:** Database breach exposes all partner credentials.
**Do this instead:** Hash tokens before storage; only display token once at creation.

### Anti-Pattern 4: Synchronous Script Execution in Workflow

**What people do:** Block workflow execution waiting for script completion.
**Why it's wrong:** Long scripts block worker threads; timeout handling becomes complex.
**Do this instead:** Queue execution to separate worker; poll for completion or use callbacks.

### Anti-Pattern 5: Unlimited Script Resources

**What people do:** Run scripts without CPU/memory/time limits.
**Why it's wrong:** Runaway script can exhaust server resources; denial of service.
**Do this instead:** Hard limits on all resources; aggressive timeouts; kill scripts that exceed limits.

---

## Scaling Considerations

| Scale | Runbooks | Partner Access |
|-------|----------|----------------|
| 0-100 executions/day | Single worker, no isolation | In-memory token cache |
| 100-1000/day | Worker pool (3-5), basic container isolation | Redis token cache |
| 1000+/day | Kubernetes jobs, full container isolation | Rate limiting per partner |

### First Bottleneck: Runbook Worker

**What breaks:** Single worker process can only run so many concurrent scripts.
**Solution:** Scale worker pool horizontally; consider cloud functions for burst capacity.

### Second Bottleneck: Partner Token Lookups

**What breaks:** Database query on every partner request.
**Solution:** Cache valid tokens in Redis with short TTL (5 min); invalidate on revocation.

---

## Integration Points Summary

### Runbooks Integration

| Integration Point | Existing Component | Integration Type |
|-------------------|-------------------|------------------|
| Workflow actions | `workflow-executor.service.ts` | Add new action type |
| Permissions | `permission.service.ts` | Extend with runbook methods |
| Audit logging | `audit.service.ts` | Log execution events |
| Failure notifications | `notification.service.ts` | Reuse workflow failure pattern |
| Socket updates | `socket.service.ts` | Broadcast execution status |

### Partner Access Integration

| Integration Point | Existing Component | Integration Type |
|-------------------|-------------------|------------------|
| Status page access | `statusPage.service.ts` | Extend with partner methods |
| Public routes | `statusPublic.routes.ts` | Add partner middleware |
| Admin routes | `statusPage.routes.ts` | Add partner management endpoints |
| Audit logging | `audit.service.ts` | Log partner access events |

---

## Sources

- AWS Systems Manager Automation documentation (execution isolation patterns)
- Auth0 multi-organization architecture (partner access patterns)
- Prisma relations documentation (explicit join tables for access control)
- Existing codebase analysis: `/Users/tvellore/work/pagefree/src/`

---
*Architecture research for: OnCall Platform v1.2*
*Researched: 2026-02-08*
