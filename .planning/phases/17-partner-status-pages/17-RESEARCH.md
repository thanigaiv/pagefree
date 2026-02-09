# Phase 17: Partner Status Pages - Research

**Researched:** 2026-02-08
**Domain:** Partner Authentication and Scoped Access Control
**Confidence:** HIGH

## Summary

Phase 17 implements authenticated external access to status pages for partners and contractors. The core challenge is creating a parallel authentication system that:
1. Keeps partner users completely separate from internal users (different database model, different session cookie)
2. Uses passwordless magic link authentication (15-minute token expiry, 24-hour session)
3. Enforces strict scope-based access control (partners see only assigned status pages)
4. Provides comprehensive audit logging for compliance

The codebase already has excellent patterns for this: magic link tokens (from incident notifications), session management (connect-pg-simple), rate limiting (Redis-backed tiers), and audit logging. The main work is creating the PartnerUser model, a separate session middleware, and new API routes with partner-specific access checks.

**Primary recommendation:** Implement partner auth as a parallel track to internal auth - new Prisma model, new session cookie (partner.sid), new middleware (requirePartnerAuth), and new routes under /api/partner/*. Reuse existing services (email, audit) but keep partner logic isolated.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express-session | 1.18.0 | Session management | Already in use for internal auth |
| connect-pg-simple | 9.0.0 | PostgreSQL session store | Already in use, scales with existing infra |
| crypto (Node built-in) | - | Token generation and hashing | OWASP pattern already used for magic links |
| @aws-sdk/client-ses | 3.985.0 | Send magic link emails | Already configured and in use |
| rate-limiter-flexible | 5.0.0 | Rate limiting | Already configured with Redis backend |
| zod | 4.3.0 | Request validation | Already used throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.1.0 | Date manipulation | Token expiry calculations |
| bcrypt | 5.1.0 | (NOT needed) | Partner auth is passwordless |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Session-based | JWT tokens | JWTs are stateless but can't be revoked instantly; sessions allow immediate logout |
| SHA-256 tokens | UUID v4 | SHA-256 hashing provides security-in-depth for token storage |
| Separate Session table | Same Session table | Separate table (PartnerSession) avoids any cross-contamination |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  partner/
    session.ts              # Partner session middleware (partner.sid cookie)
    auth.middleware.ts      # requirePartnerAuth, requirePartnerAccess
    partner.routes.ts       # /api/partner/* routes
    partner.service.ts      # PartnerUser CRUD, token generation
    partnerAccess.service.ts # Access assignment logic
  services/
    audit.service.ts        # Existing - reuse for partner audit
    notification.service.ts # Existing - reuse for magic link emails
```

### Pattern 1: Parallel Session Management
**What:** Create separate session middleware for partners with different cookie name
**When to use:** Always for partner routes
**Example:**
```typescript
// Source: Based on existing src/auth/session.ts pattern
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const PgSession = connectPgSimple(session);

const partnerSessionPool = new Pool({
  connectionString: env.DATABASE_URL
});

export const partnerSessionMiddleware = session({
  store: new PgSession({
    pool: partnerSessionPool,
    tableName: 'PartnerSession',  // Different table from internal sessions
    createTableIfMissing: false
  }),
  secret: env.SESSION_SECRET,     // Can reuse same secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours per PARTNER-02
    sameSite: 'lax'
  },
  name: 'partner.sid'             // Different cookie name from 'oncall.sid'
});
```

### Pattern 2: Magic Link Token Generation
**What:** Secure token generation and storage following OWASP patterns
**When to use:** When partner requests login
**Example:**
```typescript
// Source: Based on existing src/services/notification/channels/email.channel.ts
import crypto from 'crypto';
import { prisma } from '../config/database.js';

async function generateMagicLinkToken(partnerUserId: string): Promise<string> {
  // Generate cryptographically secure token (32 bytes = 256 bits)
  const token = crypto.randomBytes(32).toString('hex');

  // Store hash (never plaintext) - same pattern as incident magic links
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.partnerMagicToken.create({
    data: {
      tokenHash,
      partnerUserId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)  // 15 minutes per PARTNER-02
    }
  });

  return token;  // Return unhashed token for email URL
}
```

### Pattern 3: Scoped Access Middleware
**What:** Middleware that verifies partner has access to requested status page
**When to use:** All partner status page routes
**Example:**
```typescript
// Source: Based on existing src/middleware/auth.ts patterns
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';

export function requirePartnerAccess(req: Request, res: Response, next: NextFunction): void {
  const partner = (req as any).partnerUser;
  const { statusPageId } = req.params;

  if (!partner) {
    res.status(401).json({ error: 'Partner authentication required' });
    return;
  }

  // Check if partner has access to this status page
  const hasAccess = partner.statusPageAccess.some(
    (access: any) => access.statusPageId === statusPageId
  );

  if (!hasAccess) {
    // Log access denial for audit
    auditService.log({
      action: 'partner.access.denied',
      resourceType: 'StatusPage',
      resourceId: statusPageId,
      metadata: {
        partnerEmail: partner.email,
        partnerId: partner.id
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'WARN'
    });

    res.status(403).json({ error: 'Access denied to this status page' });
    return;
  }

  next();
}
```

### Anti-Patterns to Avoid
- **Mixing partner and internal sessions:** Never use the same session store or cookie name
- **Storing plaintext tokens:** Always hash tokens before database storage
- **Relying on frontend hiding:** All access control must be enforced in API middleware
- **Long-lived magic tokens:** Keep magic links short-lived (15 min) - session handles persistence
- **Sharing user session patterns:** Partners are NOT Users - different model, different permissions

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom token/session tracking | express-session + connect-pg-simple | Handles edge cases, cookie security, expiry |
| Rate limiting | IP-based counters | rate-limiter-flexible | Already configured, handles Redis failures gracefully |
| Email sending | SMTP client | Existing notificationService | Already handles SES, error logging |
| Token generation | Math.random() | crypto.randomBytes() | Cryptographically secure randomness |
| Token storage | Plaintext in DB | SHA-256 hash | Security-in-depth even if DB compromised |

**Key insight:** The codebase already implements OWASP-compliant magic links for incident notifications. Reuse this pattern exactly for partner auth - don't invent a new approach.

## Common Pitfalls

### Pitfall 1: Session Cross-Contamination
**What goes wrong:** Partner session interferes with internal user session or vice versa
**Why it happens:** Using same cookie name or session store
**How to avoid:**
- Different cookie name (partner.sid vs oncall.sid)
- Different session table (PartnerSession vs Session)
- Different session middleware mounted on different routes
**Warning signs:** User appears logged in as partner, partner accesses internal routes

### Pitfall 2: Magic Link Token Replay
**What goes wrong:** Same magic link used multiple times
**Why it happens:** Not marking token as used after verification
**How to avoid:**
- Mark token as `used: true` immediately upon successful verification
- Delete or invalidate token after use
- Short expiry (15 min) as defense in depth
**Warning signs:** Same token appears in multiple audit logs

### Pitfall 3: Access Check in Wrong Layer
**What goes wrong:** Partner sees data they shouldn't have access to
**Why it happens:** Access checks only in frontend, not API
**How to avoid:**
- requirePartnerAccess middleware on EVERY partner route
- Service layer also validates access (defense in depth)
- Never trust statusPageId from request without validation
**Warning signs:** Partner API responses contain unexpected data

### Pitfall 4: Partner Data Leaking to Internal Views
**What goes wrong:** Internal admin sees partner-specific data mixed with user data
**Why it happens:** Queries that don't filter by partner vs user type
**How to avoid:**
- PartnerUser is completely separate model from User
- Admin routes for partners are explicit (/api/admin/partners/*)
- Never join User and PartnerUser tables
**Warning signs:** User lists showing partner emails

### Pitfall 5: Audit Logs Missing Context
**What goes wrong:** Can't trace partner activity during security review
**Why it happens:** Not logging IP, user agent, or partner ID on actions
**How to avoid:**
- Always include partnerEmail, partnerId, ipAddress, userAgent
- Use consistent action naming (partner.* prefix)
- Log both successes and failures
**Warning signs:** Audit queries return incomplete data

## Code Examples

Verified patterns from existing codebase:

### Partner Model Schema (Prisma)
```prisma
// Source: Based on existing models in prisma/schema.prisma

model PartnerUser {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  isActive  Boolean  @default(true)

  // Ownership tracking
  createdById String
  createdBy   User   @relation("PartnerCreatedBy", fields: [createdById], references: [id])

  // Timestamps
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  // Relations
  statusPageAccess PartnerStatusPageAccess[]
  sessions         PartnerSession[]
  magicTokens      PartnerMagicToken[]

  @@index([email])
  @@index([isActive])
}

model PartnerStatusPageAccess {
  id            String      @id @default(cuid())
  partnerUserId String
  partnerUser   PartnerUser @relation(fields: [partnerUserId], references: [id], onDelete: Cascade)
  statusPageId  String
  statusPage    StatusPage  @relation(fields: [statusPageId], references: [id], onDelete: Cascade)

  grantedById   String
  grantedAt     DateTime    @default(now()) @db.Timestamptz

  @@unique([partnerUserId, statusPageId])
  @@index([partnerUserId])
  @@index([statusPageId])
}

model PartnerSession {
  sid    String   @id
  sess   Json
  expire DateTime @db.Timestamptz

  @@index([expire])
}

model PartnerMagicToken {
  id            String      @id @default(cuid())
  tokenHash     String      @unique
  partnerUserId String
  partnerUser   PartnerUser @relation(fields: [partnerUserId], references: [id], onDelete: Cascade)
  used          Boolean     @default(false)
  usedAt        DateTime?   @db.Timestamptz
  expiresAt     DateTime    @db.Timestamptz
  createdAt     DateTime    @default(now()) @db.Timestamptz

  @@index([tokenHash])
  @@index([expiresAt])
}
```

### Magic Link Email Template
```typescript
// Source: Based on existing src/services/notification.service.ts pattern

function buildPartnerMagicLinkEmail(partnerName: string, loginUrl: string): { subject: string; body: string } {
  return {
    subject: 'PageFree - Your Status Page Access Link',
    body: `
Hello ${partnerName},

Click the link below to access your status page dashboard:

${loginUrl}

This link will expire in 15 minutes. If you didn't request this link, please ignore this email.

-- PageFree
    `.trim()
  };
}
```

### Partner Login Flow
```typescript
// Source: Based on existing src/routes/mobile.routes.ts and magic-links.ts patterns

// POST /api/partner/auth/request-login
router.post('/auth/request-login', async (req, res) => {
  const { email } = req.body;

  // Find partner by email
  const partner = await prisma.partnerUser.findUnique({
    where: { email, isActive: true }
  });

  if (!partner) {
    // Security: don't reveal if email exists
    return res.json({ success: true, message: 'If this email is registered, you will receive a login link.' });
  }

  // Generate magic link token
  const token = await partnerService.generateMagicLinkToken(partner.id);
  const loginUrl = `${env.API_BASE_URL}/partner/auth/verify/${token}`;

  // Send email
  const emailContent = buildPartnerMagicLinkEmail(partner.name, loginUrl);
  await notificationService.sendEmail(partner.email, emailContent.subject, emailContent.body);

  // Audit log
  await auditService.log({
    action: 'partner.login.requested',
    resourceType: 'PartnerUser',
    resourceId: partner.id,
    metadata: { email: partner.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  return res.json({ success: true, message: 'If this email is registered, you will receive a login link.' });
});

// GET /partner/auth/verify/:token - Magic link handler
router.get('/auth/verify/:token', async (req, res) => {
  const { token } = req.params;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const magicToken = await prisma.partnerMagicToken.findUnique({
    where: { tokenHash },
    include: { partnerUser: true }
  });

  if (!magicToken || magicToken.used || magicToken.expiresAt < new Date()) {
    return res.redirect(`${env.FRONTEND_URL}/partner/login?error=invalid_token`);
  }

  if (!magicToken.partnerUser.isActive) {
    return res.redirect(`${env.FRONTEND_URL}/partner/login?error=account_disabled`);
  }

  // Mark token as used
  await prisma.partnerMagicToken.update({
    where: { id: magicToken.id },
    data: { used: true, usedAt: new Date() }
  });

  // Create session
  (req.session as any).partnerId = magicToken.partnerUser.id;
  (req.session as any).partnerEmail = magicToken.partnerUser.email;

  // Audit log
  await auditService.log({
    action: 'partner.login',
    resourceType: 'PartnerUser',
    resourceId: magicToken.partnerUser.id,
    metadata: { email: magicToken.partnerUser.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  return res.redirect(`${env.FRONTEND_URL}/partner/dashboard`);
});
```

### Partner Status Page View (Read-Only)
```typescript
// Source: Based on existing src/routes/statusPublic.routes.ts patterns

// GET /api/partner/status-pages - List assigned status pages
router.get('/status-pages', requirePartnerAuth, async (req, res) => {
  const partner = (req as any).partnerUser;

  const statusPages = await prisma.statusPage.findMany({
    where: {
      partnerAccess: {
        some: { partnerUserId: partner.id }
      }
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true
    }
  });

  // Audit log
  await auditService.log({
    action: 'partner.access.statusPage',
    resourceType: 'StatusPage',
    metadata: {
      partnerEmail: partner.email,
      statusPageIds: statusPages.map(p => p.id)
    },
    ipAddress: req.ip,
    severity: 'INFO'
  });

  return res.json({ statusPages });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Password-based partner accounts | Magic link (passwordless) | Industry trend 2023+ | Better security, no credential management |
| JWT tokens for sessions | Cookie-based sessions | Per Phase 14 decision | Better security, instant revocation |
| Shared session store | Separate partner session store | This phase | Complete isolation |

**Deprecated/outdated:**
- Password-based auth for external partners (security liability, password reset overhead)
- JWT-only authentication (can't revoke without blacklist complexity)
- Mixing partner and internal user models (access control nightmare)

## Open Questions

1. **Partner audit log retention**
   - What we know: PARTNER-04 specifies 90-day retention for partner access logs
   - What's unclear: Should this be separate cleanup job or extend existing audit cleanup?
   - Recommendation: Add partner-specific cleanup in existing auditCleanup.js job with 90-day filter for partner.* actions

2. **Partner branding on status pages**
   - What we know: Requirements don't specify custom branding per partner
   - What's unclear: Should partners see the same status page UI as public, or a partner-specific view?
   - Recommendation: Reuse PublicStatusPage component, add "Logged in as: partner@example.com" banner

3. **Partner account recovery**
   - What we know: Magic links are the only auth mechanism
   - What's unclear: What if partner loses email access?
   - Recommendation: Admin can deactivate old partner account and create new one with updated email

## Sources

### Primary (HIGH confidence)
- Existing codebase: src/auth/session.ts - Session configuration pattern
- Existing codebase: src/routes/magic-links.ts - Magic link verification pattern
- Existing codebase: src/services/notification/channels/email.channel.ts - Token generation pattern
- Existing codebase: src/middleware/auth.ts - Authorization middleware pattern
- Existing codebase: src/routes/statusPublic.routes.ts - Status page read-only pattern
- Existing codebase: prisma/schema.prisma - Model relationship patterns

### Secondary (MEDIUM confidence)
- OWASP Authentication Cheat Sheet - Magic link security best practices
- Express-session documentation - Session cookie configuration

### Tertiary (LOW confidence)
- None - all patterns verified in existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies already in use, no new packages needed
- Architecture: HIGH - Follows exact patterns from existing auth and status page code
- Pitfalls: HIGH - Based on actual codebase patterns and security considerations

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - stable domain, existing patterns)
