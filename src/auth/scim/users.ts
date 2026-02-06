import { prisma } from '../../config/database.js';
import { auditService } from '../../services/audit.service.js';
import { ScimUserSchema, SCIM_SCHEMAS, ScimListResponse } from './schemas.js';
import { parse as parseScimFilter } from 'scim2-parse-filter';

// Convert internal User to SCIM User representation
function toScimUser(user: any) {
  return {
    schemas: [SCIM_SCHEMAS.USER],
    id: user.id,
    externalId: user.oktaId,
    userName: user.email,
    name: {
      givenName: user.firstName,
      familyName: user.lastName,
      formatted: `${user.firstName} ${user.lastName}`
    },
    emails: [{
      value: user.email,
      primary: true,
      type: 'work'
    }],
    phoneNumbers: user.phone ? [{
      value: user.phone,
      type: 'mobile'
    }] : [],
    active: user.isActive,
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString()
    }
  };
}

export class ScimUserService {
  // GET /scim/v2/Users - List users with filtering
  async list(params: {
    filter?: string;
    startIndex?: number;
    count?: number;
  }): Promise<ScimListResponse<any>> {
    const startIndex = params.startIndex || 1;
    const count = Math.min(params.count || 100, 200);

    // Base query: exclude break-glass accounts (per user decision)
    let users = await prisma.user.findMany({
      where: {
        isBreakGlassAccount: false,
        syncedFromOkta: true  // Only return Okta-provisioned users
      },
      skip: startIndex - 1,
      take: count,
      orderBy: { createdAt: 'asc' }
    });

    // Apply SCIM filter if provided
    if (params.filter) {
      try {
        const filterAst = parseScimFilter(params.filter);
        users = users.filter(user => this.matchesFilter(user, filterAst));
      } catch (error) {
        // Log but don't fail - return unfiltered results
        console.warn('SCIM filter parse error:', error);
      }
    }

    const totalResults = await prisma.user.count({
      where: {
        isBreakGlassAccount: false,
        syncedFromOkta: true
      }
    });

    return {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map(toScimUser)
    };
  }

  // GET /scim/v2/Users/:id
  async get(id: string) {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    // Don't expose break-glass accounts
    if (!user || user.isBreakGlassAccount) {
      return null;
    }

    return toScimUser(user);
  }

  // POST /scim/v2/Users - Create user
  async create(data: any) {
    const parsed = ScimUserSchema.parse(data);

    const email = parsed.emails?.[0]?.value || parsed.userName;

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existing) {
      // Return existing user (idempotent)
      return { user: toScimUser(existing), created: false };
    }

    const user = await prisma.user.create({
      data: {
        oktaId: parsed.externalId,
        email: email.toLowerCase(),
        firstName: parsed.name?.givenName || '',
        lastName: parsed.name?.familyName || '',
        phone: parsed.phoneNumbers?.[0]?.value,
        isActive: parsed.active !== false,
        syncedFromOkta: true,
        isBreakGlassAccount: false
      }
    });

    await auditService.log({
      action: 'user.provisioned',
      userId: user.id,
      metadata: {
        source: 'scim',
        oktaId: parsed.externalId,
        email: user.email
      }
    });

    return { user: toScimUser(user), created: true };
  }

  // PUT /scim/v2/Users/:id - Full update
  async update(id: string, data: any) {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user || user.isBreakGlassAccount) {
      return null;
    }

    const parsed = ScimUserSchema.parse(data);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        oktaId: parsed.externalId || user.oktaId,
        email: (parsed.emails?.[0]?.value || parsed.userName).toLowerCase(),
        firstName: parsed.name?.givenName || user.firstName,
        lastName: parsed.name?.familyName || user.lastName,
        phone: parsed.phoneNumbers?.[0]?.value || user.phone,
        isActive: parsed.active !== false,
        deactivatedAt: parsed.active === false ? new Date() : null
      }
    });

    await auditService.log({
      action: 'user.updated',
      userId: user.id,
      metadata: { source: 'scim' }
    });

    return toScimUser(updated);
  }

  // PATCH /scim/v2/Users/:id - Partial update (including deactivation)
  async patch(id: string, operations: any[]) {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user || user.isBreakGlassAccount) {
      return null;
    }

    // Process each operation
    const updateData: any = {};

    for (const op of operations) {
      if (op.op === 'replace') {
        if (op.path === 'active' && op.value === false) {
          // Soft delete (per user decision)
          updateData.isActive = false;
          updateData.deactivatedAt = new Date();

          await auditService.log({
            action: 'user.deprovisioned',
            userId: user.id,
            severity: 'HIGH',
            metadata: {
              source: 'scim',
              reason: 'okta_deactivation'
            }
          });

          // Also invalidate sessions and refresh tokens
          await prisma.session.deleteMany({
            where: {
              sess: {
                path: ['passport', 'user'],
                equals: user.id
              }
            }
          });

          await prisma.refreshToken.deleteMany({
            where: { userId: user.id }
          });

        } else if (op.path === 'active' && op.value === true) {
          updateData.isActive = true;
          updateData.deactivatedAt = null;

          await auditService.log({
            action: 'user.reactivated',
            userId: user.id,
            metadata: { source: 'scim' }
          });
        }

        // Handle other attribute updates
        if (op.path === 'name.givenName') {
          updateData.firstName = op.value;
        }
        if (op.path === 'name.familyName') {
          updateData.lastName = op.value;
        }
        if (op.path === 'emails[type eq "work"].value') {
          updateData.email = op.value.toLowerCase();
        }
      }
    }

    if (Object.keys(updateData).length > 0) {
      const updated = await prisma.user.update({
        where: { id },
        data: updateData
      });
      return toScimUser(updated);
    }

    return toScimUser(user);
  }

  // Helper: Match user against SCIM filter AST
  private matchesFilter(user: any, filterAst: any): boolean {
    // Basic filter support for common Okta queries
    if (filterAst.op === 'eq') {
      if (filterAst.attrPath === 'userName') {
        return user.email.toLowerCase() === filterAst.compValue.toLowerCase();
      }
      if (filterAst.attrPath === 'externalId') {
        return user.oktaId === filterAst.compValue;
      }
    }
    // Add more filter operations as needed
    return true; // Default: include
  }
}

export const scimUserService = new ScimUserService();
