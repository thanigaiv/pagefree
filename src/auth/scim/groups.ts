import { prisma } from '../../config/database.js';
import { auditService } from '../../services/audit.service.js';
import { ScimGroupSchema, SCIM_SCHEMAS, ScimListResponse } from './schemas.js';

// Convert internal Team to SCIM Group representation
function toScimGroup(team: any, includeMembers = false) {
  const group: any = {
    schemas: [SCIM_SCHEMAS.GROUP],
    id: team.id,
    externalId: team.oktaGroupId,
    displayName: team.name,
    meta: {
      resourceType: 'Group',
      created: team.createdAt.toISOString(),
      lastModified: team.updatedAt.toISOString()
    }
  };

  if (includeMembers && team.members) {
    group.members = team.members.map((m: any) => ({
      value: m.user.id,
      display: m.user.email
    }));
  }

  return group;
}

export class ScimGroupService {
  // GET /scim/v2/Groups - List groups
  async list(params: {
    filter?: string;
    startIndex?: number;
    count?: number;
  }): Promise<ScimListResponse<any>> {
    const startIndex = params.startIndex || 1;
    const count = Math.min(params.count || 100, 200);

    // Only return Okta-synced teams
    const teams = await prisma.team.findMany({
      where: {
        syncedFromOkta: true,
        isActive: true
      },
      skip: startIndex - 1,
      take: count,
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    const totalResults = await prisma.team.count({
      where: {
        syncedFromOkta: true,
        isActive: true
      }
    });

    return {
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
      totalResults,
      startIndex,
      itemsPerPage: teams.length,
      Resources: teams.map(t => toScimGroup(t, true))
    };
  }

  // GET /scim/v2/Groups/:id
  async get(id: string) {
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    if (!team) {
      return null;
    }

    return toScimGroup(team, true);
  }

  // POST /scim/v2/Groups - Create group (team)
  async create(data: any) {
    const parsed = ScimGroupSchema.parse(data);

    // Check if group already exists by oktaGroupId
    if (parsed.externalId) {
      const existing = await prisma.team.findUnique({
        where: { oktaGroupId: parsed.externalId }
      });

      if (existing) {
        return { team: toScimGroup(existing), created: false };
      }
    }

    const team = await prisma.team.create({
      data: {
        name: parsed.displayName,
        oktaGroupId: parsed.externalId,
        syncedFromOkta: true,
        isActive: true
      }
    });

    // Add members if provided
    if (parsed.members && parsed.members.length > 0) {
      for (const member of parsed.members) {
        const user = await prisma.user.findUnique({
          where: { id: member.value }
        });

        if (user) {
          await prisma.teamMember.create({
            data: {
              userId: user.id,
              teamId: team.id,
              role: 'RESPONDER' // Default role from SCIM
            }
          });
        }
      }
    }

    await auditService.log({
      action: 'team.provisioned',
      teamId: team.id,
      metadata: {
        source: 'scim',
        oktaGroupId: parsed.externalId,
        name: team.name
      }
    });

    const created = await prisma.team.findUnique({
      where: { id: team.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    return { team: toScimGroup(created, true), created: true };
  }

  // PATCH /scim/v2/Groups/:id - Update group membership
  async patch(id: string, operations: any[]) {
    const team = await prisma.team.findUnique({
      where: { id }
    });

    if (!team) {
      return null;
    }

    for (const op of operations) {
      // Handle member add/remove
      if (op.path === 'members') {
        if (op.op === 'add' && op.value) {
          for (const member of op.value) {
            const user = await prisma.user.findUnique({
              where: { id: member.value }
            });

            if (user) {
              await prisma.teamMember.upsert({
                where: {
                  userId_teamId: { userId: user.id, teamId: team.id }
                },
                create: {
                  userId: user.id,
                  teamId: team.id,
                  role: 'RESPONDER'
                },
                update: {} // No-op if exists
              });

              await auditService.log({
                action: 'team.member.added',
                teamId: team.id,
                userId: user.id,
                metadata: { source: 'scim' }
              });
            }
          }
        }

        if (op.op === 'remove' && op.value) {
          for (const member of op.value) {
            await prisma.teamMember.deleteMany({
              where: {
                teamId: team.id,
                userId: member.value
              }
            });

            await auditService.log({
              action: 'team.member.removed',
              teamId: team.id,
              metadata: {
                source: 'scim',
                removedUserId: member.value
              }
            });
          }
        }
      }

      // Handle displayName update
      if (op.path === 'displayName' && op.op === 'replace') {
        await prisma.team.update({
          where: { id },
          data: { name: op.value }
        });
      }
    }

    const updated = await prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });

    return toScimGroup(updated, true);
  }

  // DELETE /scim/v2/Groups/:id - Archive group
  async delete(id: string) {
    const team = await prisma.team.findUnique({
      where: { id }
    });

    if (!team) {
      return false;
    }

    // Archive instead of hard delete (per user decision)
    await prisma.team.update({
      where: { id },
      data: {
        isActive: false,
        archivedAt: new Date()
      }
    });

    await auditService.log({
      action: 'team.archived',
      teamId: team.id,
      metadata: { source: 'scim' }
    });

    return true;
  }
}

export const scimGroupService = new ScimGroupService();
