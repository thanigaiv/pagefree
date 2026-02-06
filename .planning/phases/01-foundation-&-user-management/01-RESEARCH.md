# Phase 1: Foundation & User Management - Research

**Researched:** 2026-02-06
**Domain:** Enterprise SSO authentication (Okta SAML/SCIM), user provisioning, team organization, audit logging
**Confidence:** MEDIUM

## Summary

Phase 1 requires implementing Okta SSO integration with both SAML authentication and SCIM 2.0 provisioning, building a team organization system with flat structure and multi-team membership, comprehensive audit logging infrastructure, and contact method verification for on-call engineers. The standard approach uses Passport.js with passport-openidconnect for authentication, custom SCIM 2.0 server endpoints following RFC 7644, Prisma ORM with PostgreSQL for type-safe data access, and structured logging with explicit audit event capture.

Key technical decisions are locked by the user: Okta as the SSO provider with both SAML and SCIM support, soft delete for user deprovisioning, break-glass local admin accounts for emergency access, long-lived refresh tokens for mobile apps, and hybrid team provisioning (initial sync from Okta groups, then platform-managed). The system must support both platform-level and team-level RBAC with four roles (admin, team admin, responder, observer), maintain 90-day audit logs with API access, and enforce UTC timestamp storage throughout.

**Primary recommendation:** Use Passport.js with passport-openidconnect for authentication flow, implement custom SCIM 2.0 endpoints with scim2-parse-filter for query support, use Prisma ORM with timestamptz columns for all timestamps, and create a separate audit_events table with composite indexes for efficient querying. Avoid rolling custom RBAC logic - use declarative permission checks at the route/service layer.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Authentication Flow:**
- SSO Provider: Okta integration (not email/password)
- Provisioning: Both SAML (authentication) + SCIM (user provisioning)
- Session handling: Immediate logout when Okta session expires or user removed from Okta
- Mobile authentication: Long-lived refresh tokens after initial Okta auth (for 24/7 on-call scenarios)
- Emergency access: Break-glass local admin accounts bypass Okta for disaster recovery
- API authentication: API keys per service for external webhooks (DataDog, New Relic), separate from Okta
- Email/password auth: Keep ONLY for break-glass emergency admin accounts (update USER-01 requirement)
- User deprovisioning: Soft delete - mark inactive, preserve all historical data for audit trail

**User Profiles & Preferences:**
- Profile data source: All profile data (name, email, phone) synced from Okta via SCIM - platform is read-only for contact info
- Notification preferences: Managed in platform (user sets preferences for email vs SMS vs push)
- Contact verification: Independent verification required even though data comes from Okta (send test notifications)
- Required contact methods: All three required for on-call engineers:
  - Email (verified)
  - Phone/SMS (verified)
  - Push notifications (mobile device registered)

**Team Organization Model:**
- Team source: Hybrid - initial teams from Okta groups via SCIM, platform admins can create additional teams
- Team structure: Flat with tags/labels, not hierarchical
  - Organizational tags (Engineering, Product, SRE, Security)
  - Technical tags (Backend, Frontend, Mobile, Payments, Auth)
- Team ownership:
  - Teams own: on-call schedules, services/alerts, escalation policies, integrations
  - Service ownership: Primary + secondary ownership model (one primary team, optional secondary teams for escalation)
- Cross-team model:
  - Users can be on multiple teams
  - Escalation can cross team boundaries
  - Full visibility - all teams can see other teams' incidents and on-call schedules
- Roles: Both global platform roles AND per-team roles
  - Platform admin: complete control across all teams
  - Team admin: full team control (add/remove users, configure schedules, integrations, all settings)
  - Responder: can acknowledge and resolve incidents
  - Observer: read-only for stakeholders, managers, support staff, audit/compliance
- Team lifecycle:
  - Creation: Request-based (users request new teams, platform admin approves)
  - Disbanding: Archive with history (marked inactive, data preserved, can't create new incidents)
  - Admin role changes: Admin assigns/removes team admin roles
- Team settings:
  - Team-level notification defaults and escalation defaults
  - Notification preferences: Hybrid (team sets minimum requirements, users can add additional channels)
  - Cost tracking: Track per-team costs (SMS, voice calls) for budgeting/chargeback
  - Maintenance mode: Teams can enter maintenance mode with alert suppression
- Team features:
  - Dedicated Slack channel per team for incidents
  - Rich team profiles (description, runbooks, key contacts, Slack channels)
  - Team health metrics visible to all (response times, incident volume)
  - Dashboard views: Users can toggle between team-only view and cross-team view
- Team constraints:
  - Recommended guidelines (warn if <3 responders or no admin) but no hard limits
  - Users can self-service opt-out from teams (admin notified)
  - No team dependency tracking in Phase 1 (deferred to later phases)
- Multi-team scenarios:
  - Users on-call for multiple teams: all incidents routed normally (user's responsibility to manage)

**Audit Logging Scope:**
- What to log: Everything - all user actions for complete audit trail:
  - Authentication events (login, logout, session expiry, failed auth)
  - Incident actions (acknowledge, resolve, reassign, notes added)
  - Configuration changes (team settings, escalation policies, integrations)
- Retention: 90 days
- Access control: Team admins can view audit logs for their team, platform admins see all
- Presentation: Both approaches:
  - Dedicated audit log page with filterable table
  - Inline audit events on team pages, incident timelines, user profiles
- Export: API access for programmatic querying (not CSV/streaming to SIEM in Phase 1)
- Metadata captured:
  - User identity (user ID, name, email)
  - Timestamp (UTC)
  - IP address / location
  - User agent / device info
- Integrity: Standard database storage, trust database permissions (not write-only/immutable)
- Anomaly detection: Not for Phase 1 (manual review only, anomaly detection deferred)

### Claude's Discretion

- Authentication error message UX and rate limiting approach
- Exact Okta webhook or polling mechanism for session expiry detection
- Database schema optimization for audit logs (partitioning, indexing)
- Team tag taxonomy (predefined vs custom)
- User onboarding flow and welcome screens

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope. Some features explicitly deferred to later phases:
- Team dependency tracking (service catalog phase)
- Anomaly detection on audit logs (security monitoring phase)
- SIEM integration for audit logs (observability phase)
- Advanced team analytics (reporting phase)

</user_constraints>

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| passport | 0.7.x | Authentication middleware | De facto standard for Node.js authentication, pluggable strategy architecture |
| passport-openidconnect | 0.1.x | OIDC/OAuth2 strategy | Official Passport strategy for OpenID Connect (Okta's recommended auth flow) |
| @prisma/client | 6.x | Type-safe ORM | Industry standard for TypeScript ORMs, excellent migration system, compile-time type safety |
| express-session | 1.18.x | Session management | Standard Express session middleware with multiple store backends |
| zod | 4.3.x | Schema validation | Zero-dependency TypeScript-first validation (2.7M dependents, 41.7k stars) |
| helmet | 8.x | Security headers | OWASP-recommended security middleware for Express |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| passport-saml | 3.2.x | SAML 2.0 strategy | If SAML authentication needed (user decided both OIDC + SCIM, SAML may be optional) |
| scim2-parse-filter | 0.2.x | SCIM filter parsing | For implementing SCIM query filtering (parses RFC 7643 filter expressions into AST) |
| connect-pg-simple | 9.x | PostgreSQL session store | Production session storage (replaces default memory store) |
| rate-limiter-flexible | 5.x | Rate limiting | OWASP-recommended for brute-force protection on auth endpoints |
| bcrypt | 5.x | Password hashing | For break-glass admin account passwords (not Okta users) |
| pino | 9.x | Structured logging | Fast JSON logger for Node.js (audit trail foundation) |
| firebase-admin | 13.6.x | Push notifications | For sending mobile push notifications (FCM), Node 18+ required |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma | TypeORM 0.3.x | TypeORM offers DataMapper pattern flexibility but less mature TypeScript integration, Prisma has better DX |
| Zod | Joi 17.x | Joi is mature but not TypeScript-first, loses compile-time type inference |
| passport-openidconnect | Custom OAuth2 | Passport provides battle-tested flows, custom implementation risks security bugs |
| scim2-parse-filter | Hand-rolled parser | SCIM filter grammar is complex (RFC 7643), custom parser will have edge case bugs |

**Installation:**
```bash
npm install passport passport-openidconnect passport-saml express-session connect-pg-simple
npm install @prisma/client bcrypt helmet rate-limiter-flexible
npm install zod pino firebase-admin scim2-parse-filter
npm install --save-dev prisma @types/passport @types/express-session
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/               # Authentication logic
│   ├── strategies/     # Passport strategies (OIDC, SAML, local)
│   ├── middleware/     # Auth middleware (requireAuth, requireRole)
│   └── scim/          # SCIM 2.0 server endpoints
├── models/            # Prisma schema and database models
├── services/          # Business logic layer
│   ├── user.service.ts
│   ├── team.service.ts
│   ├── audit.service.ts
│   └── notification.service.ts
├── routes/            # Express route handlers
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── team.routes.ts
│   └── audit.routes.ts
├── middleware/        # App-wide middleware
│   ├── errorHandler.ts
│   ├── requestLogger.ts
│   └── rateLimiter.ts
└── utils/             # Shared utilities
    ├── permissions.ts  # RBAC permission checks
    └── validators.ts   # Zod schemas
```

### Pattern 1: Passport Multi-Strategy Authentication

**What:** Configure multiple Passport strategies (OIDC for Okta, local for break-glass) with single authentication middleware
**When to use:** When supporting both SSO and emergency local admin accounts
**Example:**
```typescript
// Source: https://www.passportjs.org/packages/passport-openidconnect/
import passport from 'passport';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { Strategy as LocalStrategy } from 'passport-local';

// OIDC for Okta users
passport.use('okta', new OpenIDConnectStrategy({
  issuer: process.env.OKTA_ISSUER,
  authorizationURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/authorize`,
  tokenURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/token`,
  userInfoURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/userinfo`,
  clientID: process.env.OKTA_CLIENT_ID,
  clientSecret: process.env.OKTA_CLIENT_SECRET,
  callbackURL: '/auth/callback',
  scope: ['openid', 'profile', 'email']
}, (issuer, profile, done) => {
  // Find or create user from Okta profile
  return done(null, profile);
}));

// Local strategy for break-glass admin accounts ONLY
passport.use('local', new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  // Verify this is a break-glass account (not synced from Okta)
  const user = await prisma.user.findUnique({
    where: { email, isBreakGlassAccount: true }
  });

  if (!user || !user.passwordHash) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  // Audit log break-glass login
  await auditService.log({
    action: 'auth.breakglass.login',
    userId: user.id,
    severity: 'HIGH',
    metadata: { email }
  });

  return done(null, user);
}));
```

### Pattern 2: SCIM 2.0 Server Implementation

**What:** RESTful endpoints implementing RFC 7644 for Okta user/group provisioning
**When to use:** When Okta needs to sync users and groups to your application
**Example:**
```typescript
// Source: RFC 7644 https://www.rfc-editor.org/rfc/rfc7644.html
// SCIM filter parsing: https://github.com/thomaspoignant/scim2-parse-filter

import express from 'express';
import { parse as parseScimFilter, filter as applyScimFilter } from 'scim2-parse-filter';
import { z } from 'zod';

const scimRouter = express.Router();

// SCIM authentication (Okta will use OAuth 2.0 bearer token)
scimRouter.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.SCIM_BEARER_TOKEN) {
    return res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid authentication'
    });
  }
  next();
});

// SCIM User Schema (required attributes per Okta docs)
const ScimUser = z.object({
  schemas: z.array(z.string()),
  userName: z.string(),
  name: z.object({
    givenName: z.string(),
    familyName: z.string()
  }),
  emails: z.array(z.object({
    value: z.string().email(),
    primary: z.boolean().optional()
  })),
  active: z.boolean(),
  externalId: z.string().optional() // Okta user ID
});

// GET /scim/v2/Users - List users with filtering
scimRouter.get('/Users', async (req, res) => {
  const { filter, startIndex = 1, count = 100 } = req.query;

  // Parse SCIM filter if provided
  let users = await prisma.user.findMany({
    where: { isBreakGlassAccount: false }, // Don't expose break-glass accounts to SCIM
    skip: Number(startIndex) - 1,
    take: Number(count)
  });

  // Apply SCIM filter
  if (filter) {
    const filterAst = parseScimFilter(filter as string);
    users = users.filter(user => applyScimFilter(filterAst, toScimUser(user)));
  }

  return res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: users.length,
    startIndex: Number(startIndex),
    itemsPerPage: users.length,
    Resources: users.map(toScimUser)
  });
});

// POST /scim/v2/Users - Create user
scimRouter.post('/Users', async (req, res) => {
  const scimUser = ScimUser.parse(req.body);

  const user = await prisma.user.create({
    data: {
      oktaId: scimUser.externalId,
      email: scimUser.emails[0].value,
      firstName: scimUser.name.givenName,
      lastName: scimUser.name.familyName,
      isActive: scimUser.active,
      syncedFromOkta: true
    }
  });

  await auditService.log({
    action: 'user.provisioned',
    userId: user.id,
    metadata: { source: 'okta_scim' }
  });

  return res.status(201).json(toScimUser(user));
});

// PATCH /scim/v2/Users/:id - Update user (including soft delete)
scimRouter.patch('/Users/:id', async (req, res) => {
  const { Operations } = req.body;

  // Handle deactivation (soft delete)
  const deactivateOp = Operations.find(op =>
    op.op === 'replace' && op.path === 'active' && op.value === false
  );

  if (deactivateOp) {
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });

    await auditService.log({
      action: 'user.deprovisioned',
      userId: req.params.id,
      metadata: { source: 'okta_scim', reason: 'okta_deactivation' }
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  return res.json(toScimUser(user));
});

function toScimUser(user: any) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: {
      givenName: user.firstName,
      familyName: user.lastName
    },
    emails: [{ value: user.email, primary: true }],
    active: user.isActive,
    externalId: user.oktaId
  };
}
```

### Pattern 3: Comprehensive Audit Logging

**What:** Capture all user actions in structured audit_events table with queryable metadata
**When to use:** For compliance, security monitoring, and debugging user issues
**Example:**
```typescript
// Source: OWASP logging best practices
// PostgreSQL timestamptz: https://wiki.postgresql.org/wiki/Don't_Do_This

// Prisma schema
model AuditEvent {
  id           String   @id @default(cuid())
  action       String   // e.g., "user.login", "team.settings.updated", "incident.acknowledged"
  userId       String?  // Null for system actions
  user         User?    @relation(fields: [userId], references: [id])
  teamId       String?  // If action is team-scoped
  team         Team?    @relation(fields: [teamId], references: [id])
  resourceType String?  // e.g., "user", "team", "incident"
  resourceId   String?  // ID of affected resource
  metadata     Json     // Flexible JSON for action-specific data
  ipAddress    String?
  userAgent    String?
  severity     String   // INFO, WARN, HIGH (for filtering)
  timestamp    DateTime @default(now()) @db.Timestamptz // CRITICAL: Always timestamptz for UTC

  @@index([userId, timestamp])
  @@index([teamId, timestamp])
  @@index([action, timestamp])
  @@index([timestamp]) // For retention cleanup
}

// Audit service
export class AuditService {
  async log(params: {
    action: string;
    userId?: string;
    teamId?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    severity?: 'INFO' | 'WARN' | 'HIGH';
    req?: Request; // Extract IP/user-agent if provided
  }) {
    return prisma.auditEvent.create({
      data: {
        action: params.action,
        userId: params.userId,
        teamId: params.teamId,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata || {},
        severity: params.severity || 'INFO',
        ipAddress: params.req?.ip,
        userAgent: params.req?.get('user-agent'),
        timestamp: new Date() // Prisma will store as UTC in timestamptz column
      }
    });
  }

  async query(filters: {
    userId?: string;
    teamId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    return prisma.auditEvent.findMany({
      where: {
        userId: filters.userId,
        teamId: filters.teamId,
        action: filters.action,
        timestamp: {
          gte: filters.startDate,
          lte: filters.endDate
        }
      },
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 100,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        team: { select: { id: true, name: true } }
      }
    });
  }

  // Cleanup old audit logs (run as cron job)
  async cleanup(retentionDays: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await prisma.auditEvent.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    });

    return { deletedCount: result.count };
  }
}
```

### Pattern 4: Multi-Level RBAC (Platform + Team Roles)

**What:** Two-level permission system - global platform roles and per-team roles
**When to use:** When users need different permissions across teams (e.g., admin on TeamA, observer on TeamB)
**Example:**
```typescript
// Prisma schema
enum PlatformRole {
  PLATFORM_ADMIN  // Global admin
  USER            // Regular user
}

enum TeamRole {
  TEAM_ADMIN      // Full team control
  RESPONDER       // Can ack/resolve incidents
  OBSERVER        // Read-only
}

model User {
  id            String       @id @default(cuid())
  platformRole  PlatformRole @default(USER)
  teamMembers   TeamMember[] // Many-to-many through join table
}

model TeamMember {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id])
  role      TeamRole
  joinedAt  DateTime @default(now()) @db.Timestamptz

  @@unique([userId, teamId])
}

// Permission checking utility
export class PermissionService {
  canManageTeam(user: User, team: Team): boolean {
    // Platform admins can manage all teams
    if (user.platformRole === 'PLATFORM_ADMIN') return true;

    // Team admins can manage their team
    const membership = user.teamMembers.find(m => m.teamId === team.id);
    return membership?.role === 'TEAM_ADMIN';
  }

  canRespondToIncident(user: User, incident: Incident): boolean {
    // Platform admins can respond to anything
    if (user.platformRole === 'PLATFORM_ADMIN') return true;

    // Check if user has RESPONDER or TEAM_ADMIN role on incident's team
    const membership = user.teamMembers.find(m => m.teamId === incident.teamId);
    return membership?.role === 'RESPONDER' || membership?.role === 'TEAM_ADMIN';
  }

  canViewAuditLogs(user: User, teamId?: string): boolean {
    // Platform admins see all audit logs
    if (user.platformRole === 'PLATFORM_ADMIN') return true;

    // Team admins can see their team's logs
    if (teamId) {
      const membership = user.teamMembers.find(m => m.teamId === teamId);
      return membership?.role === 'TEAM_ADMIN';
    }

    return false;
  }
}

// Express middleware
export function requireTeamRole(minRole: TeamRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { teamId } = req.params;
    const user = req.user as User;

    if (user.platformRole === 'PLATFORM_ADMIN') {
      return next();
    }

    const membership = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: user.id, teamId }
      }
    });

    const roleHierarchy = {
      OBSERVER: 1,
      RESPONDER: 2,
      TEAM_ADMIN: 3
    };

    if (!membership || roleHierarchy[membership.role] < roleHierarchy[minRole]) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
```

### Pattern 5: Contact Verification Flow

**What:** Send test notifications to verify user can receive alerts on each channel
**When to use:** When user adds/updates email, phone, or push notification device
**Example:**
```typescript
// Contact verification schema
model ContactVerification {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  method       String   // "email", "sms", "push"
  value        String   // email address, phone number, or device token
  code         String   // 6-digit verification code
  verified     Boolean  @default(false)
  expiresAt    DateTime @db.Timestamptz
  verifiedAt   DateTime? @db.Timestamptz
  createdAt    DateTime @default(now()) @db.Timestamptz

  @@index([userId, method])
}

export class ContactVerificationService {
  async sendVerification(userId: string, method: 'email' | 'sms' | 'push', value: string) {
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store verification record
    const verification = await prisma.contactVerification.create({
      data: {
        userId,
        method,
        value,
        code,
        expiresAt
      }
    });

    // Send verification message
    switch (method) {
      case 'email':
        await this.sendVerificationEmail(value, code);
        break;
      case 'sms':
        await this.sendVerificationSMS(value, code);
        break;
      case 'push':
        await this.sendVerificationPush(value, code);
        break;
    }

    await auditService.log({
      action: 'contact.verification.sent',
      userId,
      metadata: { method, value: this.maskValue(method, value) }
    });

    return verification;
  }

  async verifyCode(userId: string, method: string, code: string) {
    const verification = await prisma.contactVerification.findFirst({
      where: {
        userId,
        method,
        code,
        verified: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!verification) {
      throw new Error('Invalid or expired verification code');
    }

    await prisma.contactVerification.update({
      where: { id: verification.id },
      data: {
        verified: true,
        verifiedAt: new Date()
      }
    });

    // Update user's verified contact
    await prisma.user.update({
      where: { id: userId },
      data: {
        [`${method}Verified`]: true
      }
    });

    await auditService.log({
      action: 'contact.verification.completed',
      userId,
      metadata: { method }
    });
  }

  private maskValue(method: string, value: string): string {
    if (method === 'email') {
      const [local, domain] = value.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    if (method === 'sms') {
      return `***${value.slice(-4)}`;
    }
    return '***';
  }
}
```

### Anti-Patterns to Avoid

- **Storing timestamps without timezone:** Always use `@db.Timestamptz` in Prisma schema. Plain `timestamp` will cause timezone bugs (user decision: all timestamps in UTC).
- **Hard delete users:** Never delete user records. Always soft delete with `isActive: false` and preserve audit trail (user decision).
- **Session state in application memory:** Use PostgreSQL session store (`connect-pg-simple`) for production. Memory store loses sessions on restart.
- **Custom RBAC logic scattered in routes:** Centralize permission checks in service layer or dedicated middleware. Don't check `user.role === 'admin'` in every route.
- **Exposing internal errors:** Never return stack traces or database errors to clients. Use centralized error handler with generic messages.
- **Single admin role:** User decided two-level RBAC (platform admin + team roles). Don't collapse into single role.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SCIM filter parsing | Custom query parser | scim2-parse-filter | SCIM filter grammar (RFC 7643) is complex with operators, grouping, attribute paths. Parser must handle eq, ne, co, sw, ew, pr, gt, ge, lt, le, and, or, not with correct precedence. |
| Password hashing | Custom crypto | bcrypt (or argon2) | Timing attacks, salt generation, work factor tuning are all subtle. Use battle-tested library. |
| Session management | Custom token system | express-session + connect-pg-simple | Session fixation, CSRF, secure cookie flags, rolling expiry are easy to get wrong. |
| Input validation | Manual checks | Zod schemas | Type coercion, nested validation, custom refinements, TypeScript integration. Zod provides all this. |
| Rate limiting | In-memory counters | rate-limiter-flexible | Distributed rate limiting, memory leaks, atomic operations. Library handles Redis/Postgres backends. |
| UUID generation | Math.random() | @prisma/client default(cuid()) or uuid() | Collision resistance, sortability, predictability. Use database-native or proven library. |
| JWT verification | Custom parsing | passport-jwt or jose | Signature verification, expiry checks, algorithm confusion attacks. Don't roll your own. |
| SCIM 2.0 protocol | Full custom implementation | Start with scim2-parse-filter + RFC examples | RFC 7644 defines complex pagination, filtering, patching, bulk operations. Start with proven filter parser. |

**Key insight:** Authentication and authorization are security-critical. Use proven libraries. Custom implementations will have bugs that attackers exploit.

## Common Pitfalls

### Pitfall 1: Timezone Confusion with Timestamps

**What goes wrong:** Storing timestamps as `timestamp without time zone` causes bugs when users in different timezones view the same event. Incident timestamps show different times depending on server timezone setting.

**Why it happens:** PostgreSQL defaults to `timestamp` without timezone, and developers don't realize it's not UTC-aware.

**How to avoid:**
- Always use `@db.Timestamptz` in Prisma schema (maps to `timestamp with time zone`)
- PostgreSQL stores timestamptz as UTC internally, converts on display
- Never use `timestamp`, `date`, or `time without time zone` for audit logs or user events
- User decision: "Must store all timestamps in UTC to prevent timezone bugs (critical pitfall)"

**Warning signs:**
- Test user sees incident time as "2pm" but production user in different timezone sees "7am" for same incident
- Audit log query by date range returns wrong results depending on server timezone
- Daylight saving time transitions cause off-by-one-hour bugs

### Pitfall 2: Exposing SCIM Endpoints Without Authentication

**What goes wrong:** SCIM endpoints (/scim/v2/Users) are publicly accessible, allowing attackers to enumerate users or create fake admin accounts.

**Why it happens:** Developer focuses on implementing SCIM protocol and forgets authentication layer.

**How to avoid:**
- Require bearer token authentication on all SCIM routes
- Use separate token from Okta SSO (SCIM client credentials, not user access tokens)
- Store SCIM bearer token in environment variable, generate with high entropy
- Rate limit SCIM endpoints (Okta makes infrequent sync calls, aggressive rate limits are safe)
- User decision: "API authentication: API keys per service for external webhooks"

**Warning signs:**
- `/scim/v2/Users` returns data without Authorization header
- SCIM token is short or guessable
- No rate limiting on SCIM routes (allows brute force token guessing)

### Pitfall 3: Not Handling Okta Session Expiry

**What goes wrong:** User's Okta session expires (or they're removed from Okta), but application session remains valid. User continues accessing platform even though they're deprovisioned.

**Why it happens:** Application session is independent of Okta session. No mechanism to detect Okta logout or user deactivation.

**How to avoid:**
- Implement Okta Event Hooks for `user.session.end` and `user.lifecycle.deactivate` events
- Webhook endpoint validates Okta signature and invalidates application session
- Alternative: Poll Okta session API on each request (adds latency, not recommended)
- When SCIM PATCH sets `active: false`, immediately invalidate all user sessions
- User decision: "Session handling: Immediate logout when Okta session expires or user removed from Okta"

**Warning signs:**
- User deleted in Okta but can still log into platform
- Okta admin reports "user was deactivated 2 hours ago but incident was acknowledged 1 hour ago"
- No webhook verification in SCIM/event endpoints (allows spoofed deactivation requests)

### Pitfall 4: Break-Glass Accounts Synced to Okta

**What goes wrong:** Break-glass admin accounts are stored in Okta or exposed via SCIM, defeating the purpose of emergency access when Okta is down.

**Why it happens:** Developer doesn't separate break-glass accounts from normal user provisioning flow.

**How to avoid:**
- Mark break-glass accounts with `isBreakGlassAccount: true` in database
- Exclude break-glass accounts from SCIM endpoints (filter out in GET /Users)
- Break-glass accounts use local Passport strategy, not Okta OIDC
- Store break-glass passwords as bcrypt hashes, not in Okta
- Audit log all break-glass logins with HIGH severity
- User decision: "Email/password auth: Keep ONLY for break-glass emergency admin accounts"

**Warning signs:**
- Break-glass account email appears in Okta user list
- SCIM GET /Users returns break-glass accounts
- Break-glass login redirects to Okta
- No audit log differentiation between normal login and break-glass login

### Pitfall 5: Audit Log Retention Doesn't Account for Growth

**What goes wrong:** Audit log table grows unbounded, slowing down queries and filling disk. 90-day retention policy exists but no cleanup job runs.

**Why it happens:** Retention policy documented but not implemented as automated cleanup.

**How to avoid:**
- Create scheduled job (cron or AWS EventBridge) to delete old audit events
- Run cleanup daily: `DELETE FROM audit_events WHERE timestamp < NOW() - INTERVAL '90 days'`
- Add index on `timestamp` column for efficient cleanup queries
- Monitor audit log table size (alert if growth rate exceeds expected)
- Consider partitioning by month for large deployments (Postgres 10+ native partitioning)
- User decision: "Retention: 90 days"

**Warning signs:**
- Audit log queries take >5 seconds
- Table size grows 10GB+/month with <1000 users
- No scheduled cleanup job visible in codebase
- Database disk usage alerts

### Pitfall 6: Soft Delete Breaks Foreign Key Queries

**What goes wrong:** User is soft-deleted (`isActive: false`) but queries like "get all incidents for user" still return results, or team membership checks include inactive users.

**Why it happens:** Soft delete flag is inconsistently applied in queries. Developers forget to filter `WHERE isActive = true`.

**How to avoid:**
- Add `isActive: true` filter to all user queries by default
- Use Prisma middleware to inject `isActive` filter globally (except admin queries)
- Create database views for "active users" if needed
- Explicitly document which endpoints show inactive users (e.g., admin user list, audit logs)
- User decision: "Soft delete - mark inactive, preserve all historical data for audit trail"

**Warning signs:**
- Deactivated user still appears in team member dropdown
- Inactive user count includes deleted users
- Audit log shows actions by "null" user because user was soft-deleted

### Pitfall 7: Team Tag Explosion (No Taxonomy)

**What goes wrong:** Teams create arbitrary tags ("backend", "back-end", "be", "Backend", "backend-team") causing fragmentation and useless filtering.

**Why it happens:** No predefined tag list or validation, users invent their own tags.

**How to avoid:**
- Start with predefined tag taxonomy (Organizational: Engineering, Product, SRE; Technical: Backend, Frontend, Mobile)
- Allow custom tags but provide autocomplete from existing tags
- Normalize tags on save (lowercase, trim, de-duplicate)
- Admin UI to merge duplicate tags if needed
- User discretion: "Team tag taxonomy (predefined vs custom)" - decide during implementation

**Warning signs:**
- Tag filter dropdown has 50+ tags with obvious duplicates
- Teams tagged with both "backend" and "back-end"
- No tag usage analytics (which tags are actually used)

## Code Examples

### Mobile Refresh Token Flow

```typescript
// Source: OAuth 2.0 Refresh Token pattern (user decision: long-lived refresh tokens for mobile)

interface RefreshToken {
  id: string;
  userId: string;
  token: string; // Hashed
  deviceInfo: string; // For tracking which device
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
}

// After successful Okta login on mobile, issue refresh token
export async function issueRefreshToken(userId: string, deviceInfo: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(token, 10);

  const refreshToken = await prisma.refreshToken.create({
    data: {
      userId,
      token: hashedToken,
      deviceInfo,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      lastUsedAt: new Date()
    }
  });

  await auditService.log({
    action: 'auth.refresh_token.issued',
    userId,
    metadata: { deviceInfo, tokenId: refreshToken.id }
  });

  return token; // Return plaintext to client ONCE
}

// Mobile app uses refresh token to get new access token
export async function refreshAccessToken(refreshToken: string) {
  const tokens = await prisma.refreshToken.findMany({
    where: {
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  // Check token against all hashed tokens (constant-time comparison)
  let matchedToken = null;
  for (const stored of tokens) {
    if (await bcrypt.compare(refreshToken, stored.token)) {
      matchedToken = stored;
      break;
    }
  }

  if (!matchedToken) {
    throw new Error('Invalid or expired refresh token');
  }

  // Check user is still active
  if (!matchedToken.user.isActive) {
    await prisma.refreshToken.delete({ where: { id: matchedToken.id } });
    throw new Error('User is deactivated');
  }

  // Update last used
  await prisma.refreshToken.update({
    where: { id: matchedToken.id },
    data: { lastUsedAt: new Date() }
  });

  // Issue new JWT access token (short-lived, e.g., 15 min)
  const accessToken = jwt.sign(
    { userId: matchedToken.userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  return { accessToken, user: matchedToken.user };
}

// Revoke refresh token (on logout or user deactivation)
export async function revokeRefreshToken(tokenId: string) {
  await prisma.refreshToken.delete({ where: { id: tokenId } });

  await auditService.log({
    action: 'auth.refresh_token.revoked',
    metadata: { tokenId }
  });
}
```

### Rate Limiting Authentication Endpoints

```typescript
// Source: Express security best practices https://expressjs.com/en/advanced/best-practice-security.html
// rate-limiter-flexible: https://github.com/animir/node-rate-limiter-flexible

import { RateLimiterPostgres } from 'rate-limiter-flexible';

// Create rate limiter with Postgres backend (shared across instances)
const loginRateLimiter = new RateLimiterPostgres({
  storeClient: pgPool, // Existing Postgres connection pool
  tableName: 'rate_limit_login',
  keyPrefix: 'login',
  points: 5, // 5 attempts
  duration: 60 * 15, // per 15 minutes
  blockDuration: 60 * 60, // Block for 1 hour after exceeding
});

// Middleware for login routes
export async function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const key = `${req.body.email}_${req.ip}`; // Combination of email + IP

  try {
    await loginRateLimiter.consume(key);
    next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;

    await auditService.log({
      action: 'auth.rate_limit.exceeded',
      metadata: {
        email: req.body.email,
        ip: req.ip,
        blockedForSeconds: secs
      },
      severity: 'WARN'
    });

    res.set('Retry-After', String(secs));
    res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter: secs
    });
  }
}

// Apply to break-glass login route
app.post('/auth/login/emergency', rateLimitLogin, passport.authenticate('local'), (req, res) => {
  res.json({ user: req.user });
});
```

### Okta Event Hook Handler

```typescript
// Source: Okta Event Hooks https://developer.okta.com/docs/concepts/event-hooks/

import crypto from 'crypto';

// Verify Okta webhook signature
function verifyOktaSignature(req: Request): boolean {
  const signature = req.headers['x-okta-verification-challenge'];
  if (signature) {
    // One-time verification challenge
    return true;
  }

  const oktaSignature = req.headers['x-okta-signature'] as string;
  const payload = JSON.stringify(req.body);

  const hmac = crypto.createHmac('sha256', process.env.OKTA_WEBHOOK_SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(oktaSignature),
    Buffer.from(expectedSignature)
  );
}

// Handle Okta events
app.post('/webhooks/okta/events', express.json(), async (req, res) => {
  // Verify signature
  if (!verifyOktaSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // One-time verification challenge
  if (req.headers['x-okta-verification-challenge']) {
    return res.json({
      verification: req.headers['x-okta-verification-challenge']
    });
  }

  const { data } = req.body;

  for (const event of data.events) {
    switch (event.eventType) {
      case 'user.session.end':
        // Invalidate application session
        await handleSessionEnd(event);
        break;

      case 'user.lifecycle.deactivate':
        // Soft delete user
        await handleUserDeactivation(event);
        break;

      case 'user.lifecycle.activate':
        // Reactivate user
        await handleUserActivation(event);
        break;
    }
  }

  res.json({ success: true });
});

async function handleSessionEnd(event: any) {
  const oktaUserId = event.actor.id;

  const user = await prisma.user.findUnique({
    where: { oktaId: oktaUserId }
  });

  if (!user) return;

  // Delete all sessions for this user
  await prisma.session.deleteMany({
    where: {
      data: { contains: user.id } // express-session stores userId in session data
    }
  });

  await auditService.log({
    action: 'auth.session.okta_expired',
    userId: user.id,
    metadata: { oktaEventId: event.eventId }
  });
}

async function handleUserDeactivation(event: any) {
  const oktaUserId = event.target[0].id;

  const user = await prisma.user.update({
    where: { oktaId: oktaUserId },
    data: {
      isActive: false,
      deactivatedAt: new Date()
    }
  });

  // Delete all sessions
  await prisma.session.deleteMany({
    where: {
      data: { contains: user.id }
    }
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id }
  });

  await auditService.log({
    action: 'user.deactivated',
    userId: user.id,
    metadata: {
      source: 'okta_webhook',
      oktaEventId: event.eventId
    },
    severity: 'HIGH'
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| email/password auth | SSO (SAML/OIDC) | ~2015 | Enterprise SaaS requires SSO for security and centralized user management |
| Hard delete users | Soft delete (isActive flag) | ~2010 | GDPR/compliance requires audit trail, foreign key integrity preserved |
| Passport.js 0.4.x | Passport 0.7.x | 2024 | Breaking changes in callback signatures, improved TypeScript support |
| `serial` columns | Identity columns | Postgres 10 (2017) | Standard SQL syntax, better replication behavior |
| TypeORM 0.2.x | TypeORM 0.3.x or Prisma | 2022 | TypeORM 0.3 breaking changes, Prisma gained traction for better DX |
| Custom RBAC | Policy-based (Casbin/OPA) | ~2018 | Complex permissions need declarative policy engines, but may be overkill for simple roles |
| Session cookies | JWT tokens | ~2015 | Stateless auth for microservices, but sessions still valid for monoliths |
| Joi validation | Zod | 2020+ | TypeScript-first validation with type inference |

**Deprecated/outdated:**
- **okta-oidc-js monorepo**: Retired January 2025, use separate @okta/oidc-middleware package
- **passport-oauth2**: Use passport-openidconnect for OIDC flows (more complete implementation)
- **timestamp without timezone**: Always use timestamptz in Postgres (avoid timezone bugs)
- **scrypt-js**: Use native crypto.scrypt (Node 10.5+) or bcrypt for password hashing

## Open Questions

### 1. Exact Okta Event Types for Session Management

**What we know:** Okta Event Hooks support user deactivation events, webhook payload format defined in docs

**What's unclear:** Whether `user.session.end` is actually an event-hook-eligible event type (docs show `user.session.start` example but don't confirm session.end). Need to check Okta Event Types catalog with `event-hook-eligible` parameter.

**Recommendation:** During implementation, verify event types in Okta admin console Event Hooks configuration. If `user.session.end` not available, alternative is to poll Okta Sessions API on each request (adds latency) or implement session timeout matching Okta's timeout (less secure).

### 2. SCIM Group Provisioning Depth

**What we know:** User decided hybrid team provisioning (initial sync from Okta groups via SCIM, then platform admins can create additional teams). SCIM supports /Groups endpoint for group sync.

**What's unclear:** Should SCIM Groups map 1:1 to platform Teams, or should Groups be intermediate entities that populate Teams? How to handle Okta group membership changes (add/remove user from group) - should that automatically add/remove from team?

**Recommendation:** Start with 1:1 mapping (Okta Group → Platform Team). Implement SCIM /Groups endpoint to sync group metadata and members. When user removed from Okta group, automatically remove from corresponding team. User decided "platform admins can create additional teams" so teams have `syncedFromOkta: boolean` flag.

### 3. Mobile Push Notification Architecture

**What we know:** User decided push notifications required for on-call engineers, mobile devices must be registered

**What's unclear:** Firebase Admin SDK vs Expo Push Notifications vs native APNs/FCM. How to handle device token refresh, multi-device per user, notification delivery confirmation.

**Recommendation:** Use Firebase Admin SDK 13.6+ (Node 18+) as it supports both iOS (APNs) and Android (FCM) with unified API. Store device tokens in `user_devices` table with `platform` (ios/android), `deviceToken`, `lastSeenAt`. Send critical notifications to ALL user devices. Implement device token refresh endpoint. Handle delivery confirmation via FCM delivery receipts for audit logs.

### 4. Break-Glass Account Creation Process

**What we know:** Break-glass accounts for emergency access when Okta down, use email/password, not synced to Okta

**What's unclear:** How are break-glass accounts initially created? Manual database insert? Special admin endpoint? How many break-glass accounts (1 super-admin or multiple)? How to secure break-glass account creation (requires existing platform admin?).

**Recommendation:** Create break-glass accounts via database migration or CLI tool (not web UI). Require 2-3 break-glass accounts for redundancy. Store in 1Password/LastPass, not documented in code. Implement special login route `/auth/emergency` that bypasses Okta check. Audit log all break-glass usage with HIGH severity alerts.

### 5. Team Tag Taxonomy Design

**What we know:** User decided flat team structure with organizational and technical tags (Engineering, Product, SRE, Backend, Frontend, etc.)

**What's unclear:** Are tags predefined enum or freeform strings? Can teams have multiple tags per category? Who can create new tags (anyone or admin-only)?

**Recommendation:** Start with predefined tag enums in database (TeamOrgTag, TeamTechTag). Allow multiple tags per team (many-to-many). Platform admins can add new tags via admin UI. Regular users select from existing tags. Avoids tag explosion while allowing future flexibility. User discretion: decide during implementation whether to allow custom tags.

## Sources

### Primary (HIGH confidence)

- Okta Developer Docs - Sign into web app guide: https://developer.okta.com/docs/guides/sign-into-web-app-redirect/node-express/main/
- Okta SCIM Provisioning Concepts: https://developer.okta.com/docs/concepts/scim/
- Okta SCIM Preparation Guide: https://developer.okta.com/docs/guides/scim-provisioning-integration-prepare/main/
- Okta Event Hooks Documentation: https://developer.okta.com/docs/concepts/event-hooks/
- RFC 7644 - SCIM Protocol: https://www.rfc-editor.org/rfc/rfc7644.html
- PostgreSQL Timestamp Types: https://www.postgresql.org/docs/current/datatype-datetime.html
- PostgreSQL Anti-Patterns Wiki: https://wiki.postgresql.org/wiki/Don't_Do_This
- Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html
- Passport.js SAML Package: https://www.passportjs.org/packages/passport-saml/
- Prisma ORM Documentation: https://www.prisma.io/docs/orm/overview/introduction/what-is-prisma
- TypeORM Documentation: https://typeorm.io
- Zod v4 GitHub: https://github.com/colinhacks/zod (v4.3.6 released Jan 2026)
- Zod Documentation: https://zod.dev

### Secondary (MEDIUM confidence)

- Node.js Best Practices Repository: https://github.com/goldbergyoni/nodebestpractices (July 2024 edition)
- okta-oidc-js Archived Repository: https://github.com/okta/okta-oidc-js (retired Jan 2025)
- scim2-parse-filter GitHub: https://github.com/thomaspoignant/scim2-parse-filter (v0.2.10, Apr 2024)
- Firebase Admin Node.js SDK: https://github.com/firebase/firebase-admin-node (v13.6.1, Feb 2026)
- Expo Push Notifications Overview: https://docs.expo.dev/push-notifications/overview/

### Tertiary (LOW confidence)

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html (no break-glass specific guidance found)
- Auth0 Refresh Token Blog: https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/ (content not accessible)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Verified Passport.js, Prisma, Zod via official docs. Some package versions not confirmed (npm registry blocked).
- Architecture: MEDIUM - SCIM and audit patterns based on RFCs and official Okta docs. Multi-level RBAC pattern inferred from requirements.
- Pitfalls: HIGH - Timezone pitfall from PostgreSQL docs, soft delete patterns from user decisions, SCIM auth pitfall from security best practices.

**Research date:** 2026-02-06
**Valid until:** 2026-03-08 (30 days - stable domain with mature libraries)

**Notes:**
- npm registry blocked for several package lookups (Pino, express-session, Twilio, Nodemailer) - versions based on training data (LOW confidence)
- Okta event types for session.end not fully confirmed - needs verification during implementation
- User decisions heavily constrain architecture - research focused on validating feasibility of locked decisions
