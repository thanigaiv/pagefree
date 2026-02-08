# Stack Additions for v1.2 Production Readiness

**Milestone:** v1.2 - Production Readiness
**Focus:** Runbook Automation + Partner Status Pages
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

v1.2 requires minimal stack additions. The existing infrastructure (BullMQ, Redis, PostgreSQL, Passport) handles most requirements. Two new capabilities need targeted additions:

1. **Runbook Automation:** Secure script execution with sandboxing
2. **Partner Status Pages:** JWT-based authentication for external access

## Stack Additions Required

### Runbook Automation - Script Execution

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **vm2** | 3.10.x | JavaScript sandbox | Active maintenance (published 4 days ago). Mature sandbox for untrusted code. Whitelisted Node.js built-ins. Used by 1.8M+ projects. Safer than native `vm` module. |
| **piscina** | 5.1.x | Worker thread pool | High-performance worker pool. Isolates script execution to separate threads. Prevents runaway scripts from blocking main event loop. |

**Architecture Decision:** Execute runbooks via BullMQ workers using vm2 sandbox + piscina thread pool.

**Why NOT isolated-vm:**
- Requires native compilation (C++)
- More complex setup
- vm2 sufficient for pre-approved scripts with timeouts and memory limits

**Why NOT Docker/container execution:**
- Overkill for v1.2 scope
- Adds infrastructure complexity
- Consider for v2.0 if untrusted third-party scripts needed

**Confidence:** HIGH - vm2 npm registry shows active maintenance (3.10.4 published 2026-02-04).

### Partner Status Pages - External Authentication

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **jose** | 6.1.x | JWT signing/verification | Modern, actively maintained JWT library. No dependencies. Supports all JWS/JWE algorithms. TypeScript-first. Preferred over jsonwebtoken for new code. |

**Why jose over jsonwebtoken:**
- Zero dependencies (jsonwebtoken has 4)
- Smaller bundle size
- Better TypeScript support
- Active maintenance by Okta/Auth0

**Confidence:** HIGH - jose 6.1.3 is latest, actively maintained.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **nanoid** | 5.1.x | Short unique IDs | Partner access tokens. URL-safe, cryptographically random. Already lightweight. |
| **uuid** | 13.x | Standard UUIDs | Runbook execution IDs for correlation. |

**Note:** Project already has crypto for hashing. No additional crypto libraries needed.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **isolated-vm** | Native compilation complexity. vm2 sufficient for pre-approved scripts. | vm2 |
| **dockerode** | Container orchestration overkill for v1.2. Adds infrastructure complexity. | vm2 sandbox |
| **AWS Lambda** | Already have BullMQ workers. No need for separate compute layer. | BullMQ workers |
| **Auth0/Cognito** | External auth service overkill. Simple JWT sufficient for partner pages. | jose + custom middleware |
| **OAuth for partners** | Over-engineered. Partners just need view access, not full OAuth flow. | JWT with expiry |
| **Passport-jwt** | Passport already in stack for SSO. Partners use different auth model (token-based, not session-based). | jose directly |
| **GraphQL subscriptions** | Already have Socket.io. No need for additional real-time layer. | Existing Socket.io |

## Integration with Existing Stack

### Runbook Automation Flow

```
1. Admin uploads script (stored in PostgreSQL, NOT filesystem)
2. Script approval workflow (audit log)
3. Incident triggers runbook via BullMQ job
4. BullMQ worker spawns piscina worker thread
5. Piscina executes script in vm2 sandbox
6. Result captured, logged to AuditEvent
7. Socket.io broadcasts execution status to UI
```

**Why store scripts in database:**
- Versioning via WorkflowVersion pattern (already exists)
- Approval workflow fits existing Workflow model
- Audit trail built-in
- No filesystem access in production containers

### Partner Status Page Auth Flow

```
1. Admin creates PartnerAccess record (new model)
2. System generates JWT with partnerId, statusPageId claims
3. Admin shares JWT with partner
4. Partner hits /api/status/:slug with Authorization: Bearer <token>
5. jose middleware validates JWT, extracts claims
6. Existing statusPublic routes serve data (no change needed)
```

**Why JWT instead of extending current accessToken:**
- Current accessToken is static, never expires
- JWT allows expiry, revocation tracking
- JWT claims encode partnerId for audit logging
- Partners can be issued multiple tokens for different systems

## Database Changes Required

### New Models

```prisma
// Runbook for automated remediation
model Runbook {
  id           String   @id @default(cuid())
  name         String
  description  String?
  script       String   // JavaScript source code
  timeout      Int      @default(30000) // ms
  memoryLimit  Int      @default(128) // MB

  // Scope
  teamId       String
  team         Team     @relation(fields: [teamId], references: [id])

  // Approval
  isApproved   Boolean  @default(false)
  approvedById String?
  approvedAt   DateTime? @db.Timestamptz

  // Trigger conditions (JSON)
  triggerConditions Json @default("{}")

  // Lifecycle
  isActive     Boolean  @default(true)
  createdById  String
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  executions   RunbookExecution[]

  @@index([teamId, isActive])
  @@index([isApproved])
}

model RunbookExecution {
  id           String   @id @default(cuid())
  runbookId    String
  runbook      Runbook  @relation(fields: [runbookId], references: [id])
  incidentId   String?

  // Execution
  status       String   // PENDING, RUNNING, COMPLETED, FAILED, TIMEOUT
  output       String?  // Script stdout/result
  error        String?  // Error message if failed
  durationMs   Int?

  // Timestamps
  startedAt    DateTime? @db.Timestamptz
  completedAt  DateTime? @db.Timestamptz
  createdAt    DateTime  @default(now()) @db.Timestamptz

  @@index([runbookId, status])
  @@index([incidentId])
}

// Partner access for status pages
model PartnerAccess {
  id             String   @id @default(cuid())
  name           String   // Partner org name
  statusPageId   String
  statusPage     StatusPage @relation(fields: [statusPageId], references: [id])

  // JWT tracking
  tokenHash      String   @unique // Hash of issued JWT
  tokenPrefix    String   // First 8 chars for identification

  // Access control
  expiresAt      DateTime? @db.Timestamptz
  isActive       Boolean  @default(true)
  lastUsedAt     DateTime? @db.Timestamptz
  usageCount     Int      @default(0)

  // Audit
  createdById    String
  createdAt      DateTime @default(now()) @db.Timestamptz
  revokedAt      DateTime? @db.Timestamptz

  @@index([statusPageId, isActive])
  @@index([tokenHash])
}
```

### StatusPage Model Update

```prisma
model StatusPage {
  // ... existing fields ...

  // Add relation
  partnerAccess  PartnerAccess[]
}
```

## Installation Commands

```bash
# Runbook automation
npm install vm2@^3.10.0 piscina@^5.1.0

# Partner auth
npm install jose@^6.1.0

# Supporting (if not already installed)
npm install nanoid@^5.1.0 uuid@^13.0.0

# Types (if needed)
npm install -D @types/uuid
```

## Security Configuration

### vm2 Sandbox Settings

```typescript
import { VM } from 'vm2';

const createSandbox = (context: RunbookContext) => {
  return new VM({
    timeout: context.timeoutMs || 30000,
    sandbox: {
      // Allowed globals
      console: {
        log: (...args: any[]) => context.logs.push(args.join(' ')),
        error: (...args: any[]) => context.errors.push(args.join(' ')),
      },
      // Incident context (read-only)
      incident: Object.freeze(context.incident),
      service: Object.freeze(context.service),
      // HTTP client for approved endpoints only
      fetch: createRestrictedFetch(context.allowedHosts),
    },
    eval: false,
    wasm: false,
    fixAsync: true,
  });
};
```

### jose JWT Settings

```typescript
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.PARTNER_JWT_SECRET);
const JWT_ISSUER = 'pagefree';
const JWT_AUDIENCE = 'partner-status';

// Create partner token
const createPartnerToken = async (partnerId: string, statusPageId: string, expiresIn: string = '90d') => {
  return new SignJWT({ partnerId, statusPageId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
};

// Verify partner token
const verifyPartnerToken = async (token: string) => {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return payload;
};
```

## Piscina Worker Pool Configuration

```typescript
import Piscina from 'piscina';
import path from 'path';

const runbookPool = new Piscina({
  filename: path.resolve(__dirname, 'workers/runbook-executor.js'),
  minThreads: 1,
  maxThreads: 4, // Limit concurrent runbook executions
  idleTimeout: 60000,
});

// Usage in BullMQ worker
const executeRunbook = async (runbook: Runbook, incident: Incident) => {
  return runbookPool.run({
    script: runbook.script,
    timeout: runbook.timeout,
    context: {
      incident: sanitizeIncident(incident),
      service: incident.service ? sanitizeService(incident.service) : null,
    },
  });
};
```

## Environment Variables

```bash
# Partner JWT (add to .env)
PARTNER_JWT_SECRET=<generate-32-byte-random-string>
PARTNER_JWT_ISSUER=pagefree
PARTNER_JWT_AUDIENCE=partner-status

# Runbook execution limits
RUNBOOK_DEFAULT_TIMEOUT_MS=30000
RUNBOOK_MAX_TIMEOUT_MS=300000
RUNBOOK_MAX_MEMORY_MB=128
RUNBOOK_MAX_CONCURRENT=4
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| **Script Sandbox** | vm2 | isolated-vm | Native compilation adds complexity. vm2 sufficient for pre-approved scripts. |
| **Script Sandbox** | vm2 | Node.js vm module | Native vm lacks timeout/memory controls and is explicitly marked unsafe for untrusted code. |
| **Script Sandbox** | vm2 | quickjs-emscripten | Smaller ecosystem. vm2 more battle-tested. QuickJS better for edge/WASM scenarios. |
| **Container Execution** | vm2 | dockerode + containers | Infrastructure complexity. Overkill for v1.2. Consider for v2.0 with untrusted scripts. |
| **Worker Pool** | piscina | workerpool | piscina is faster, maintained by Node.js team member. TypeScript-first. |
| **JWT Library** | jose | jsonwebtoken | jose is zero-dep, smaller, better TS support, maintained by Okta. |
| **Partner Auth** | JWT | OAuth2 | OAuth overkill for view-only access. JWT with expiry sufficient. |
| **Partner Auth** | JWT | API Keys (existing) | JWT allows expiry/revocation tracking. API keys are permanent. |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| **vm2 3.10.x** | Node.js 18+ | Uses vm module internally |
| **piscina 5.x** | Node.js 18+ | Uses worker_threads |
| **jose 6.x** | Node.js 18+ | ESM and CJS support |
| **BullMQ 5.x** | piscina | Can spawn piscina workers from BullMQ worker |

## Security Considerations

### Runbook Execution

1. **Pre-approval required:** Scripts must be approved by PLATFORM_ADMIN before execution
2. **Timeout enforcement:** vm2 timeout + piscina task cancellation
3. **Memory limits:** vm2 sandbox limits
4. **Network restrictions:** Custom fetch wrapper allowing only approved hosts
5. **No filesystem access:** Scripts cannot read/write files
6. **Audit logging:** All executions logged with full context
7. **Rate limiting:** Max concurrent executions per team

### Partner Access

1. **JWT expiry:** Default 90 days, configurable per partner
2. **Token revocation:** PartnerAccess.isActive flag checked on every request
3. **Usage tracking:** lastUsedAt and usageCount for monitoring
4. **Audit trail:** All partner access logged
5. **No write access:** Partners can only view status pages, not modify
6. **Scoped access:** Each token scoped to specific statusPageId

## Migration Path

### Phase 1: Database
1. Add Runbook and RunbookExecution models
2. Add PartnerAccess model
3. Add StatusPage.partnerAccess relation
4. Run `prisma db push`

### Phase 2: Backend
1. Install npm packages
2. Implement runbook execution service with vm2 + piscina
3. Implement partner JWT middleware
4. Add runbook and partner admin routes

### Phase 3: Integration
1. Wire runbook triggers to existing Workflow system
2. Update statusPublic routes to accept JWT auth
3. Add admin UI for runbook/partner management

## Sources

**HIGH Confidence:**
- vm2 3.10.4: npm registry (published 2026-02-04, actively maintained)
- piscina 5.1.4: npm registry (maintained by Node.js team member)
- jose 6.1.3: npm registry (maintained by Okta/Auth0)
- isolated-vm 6.0.2: npm registry (considered but rejected for complexity)

**MEDIUM Confidence:**
- vm2 security: GitHub issues show ongoing security hardening
- piscina performance: Benchmarks in repo README

---

*Stack additions research for: PageFree v1.2 - Production Readiness*
*Focus: Runbook Automation + Partner Status Pages*
*Researched: 2026-02-08*
