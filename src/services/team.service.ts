import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { CreateTeamInput, UpdateTeamInput, TeamMemberInput, TeamWithMembers } from '../types/team.js';
import { TeamRole, TagType } from '@prisma/client';

export class TeamService {
  // Create new team (platform admin only)
  async create(input: CreateTeamInput, createdByUserId: string): Promise<TeamWithMembers> {
    const team = await prisma.team.create({
      data: {
        name: input.name,
        description: input.description,
        slackChannel: input.slackChannel,
        syncedFromOkta: false,
        isActive: true,
        tags: input.tags ? {
          create: input.tags.map((t: { type: TagType; value: string }) => ({
            tagType: t.type,
            tagValue: t.value
          }))
        } : undefined
      },
      include: {
        tags: true,
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true }
            }
          }
        }
      }
    });

    await auditService.log({
      action: 'team.created',
      userId: createdByUserId,
      teamId: team.id,
      metadata: {
        name: team.name,
        source: 'platform'
      }
    });

    return this.formatTeam(team);
  }

  // Get team by ID
  async get(teamId: string): Promise<TeamWithMembers | null> {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        tags: true,
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, isActive: true }
            }
          },
          where: { user: { isActive: true } } // Only active users
        }
      }
    });

    if (!team) return null;
    return this.formatTeam(team);
  }

  // List all teams (full visibility per user decision)
  async list(params: {
    includeArchived?: boolean;
    tagType?: string;
    tagValue?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (!params.includeArchived) {
      where.isActive = true;
    }

    if (params.tagType || params.tagValue) {
      where.tags = {
        some: {
          ...(params.tagType && { tagType: params.tagType }),
          ...(params.tagValue && { tagValue: params.tagValue })
        }
      };
    }

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        include: {
          tags: true,
          members: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true, isActive: true }
              }
            },
            where: { user: { isActive: true } }
          },
          _count: { select: { members: true } }
        },
        skip: params.offset || 0,
        take: params.limit || 50,
        orderBy: { name: 'asc' }
      }),
      prisma.team.count({ where })
    ]);

    return {
      teams: teams.map(t => this.formatTeam(t)),
      total
    };
  }

  // Update team (team admin or platform admin)
  async update(teamId: string, input: UpdateTeamInput, updatedByUserId: string): Promise<TeamWithMembers | null> {
    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: input.name,
        description: input.description,
        slackChannel: input.slackChannel,
        maintenanceMode: input.maintenanceMode,
        notificationDefaults: input.notificationDefaults,
        escalationDefaults: input.escalationDefaults
      },
      include: {
        tags: true,
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, isActive: true }
            }
          }
        }
      }
    });

    await auditService.log({
      action: 'team.updated',
      userId: updatedByUserId,
      teamId: team.id,
      metadata: {
        changes: Object.keys(input).filter(k => input[k as keyof UpdateTeamInput] !== undefined)
      }
    });

    return this.formatTeam(team);
  }

  // Archive team (soft delete)
  async archive(teamId: string, archivedByUserId: string): Promise<boolean> {
    await prisma.team.update({
      where: { id: teamId },
      data: {
        isActive: false,
        archivedAt: new Date()
      }
    });

    await auditService.log({
      action: 'team.archived',
      userId: archivedByUserId,
      teamId,
      severity: 'HIGH',
      metadata: { reason: 'manual_archive' }
    });

    return true;
  }

  // Add member to team
  async addMember(teamId: string, input: TeamMemberInput, addedByUserId: string) {
    // Check if user is already a member
    const existing = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId: input.userId, teamId }
      }
    });

    if (existing) {
      throw new Error('User is already a member of this team');
    }

    const member = await prisma.teamMember.create({
      data: {
        userId: input.userId,
        teamId,
        role: input.role
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    await auditService.log({
      action: 'team.member.added',
      userId: addedByUserId,
      teamId,
      metadata: {
        addedUserId: input.userId,
        role: input.role
      }
    });

    return {
      userId: member.userId,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      joinedAt: member.joinedAt
    };
  }

  // Update member role
  async updateMemberRole(teamId: string, userId: string, newRole: TeamRole, updatedByUserId: string) {
    const member = await prisma.teamMember.update({
      where: {
        userId_teamId: { userId, teamId }
      },
      data: { role: newRole },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });

    await auditService.log({
      action: 'team.member.role_changed',
      userId: updatedByUserId,
      teamId,
      metadata: {
        targetUserId: userId,
        newRole
      }
    });

    return {
      userId: member.userId,
      email: member.user.email,
      role: member.role
    };
  }

  // Remove member from team
  async removeMember(teamId: string, userId: string, removedByUserId: string, selfRemoval = false) {
    await prisma.teamMember.delete({
      where: {
        userId_teamId: { userId, teamId }
      }
    });

    await auditService.log({
      action: selfRemoval ? 'team.member.self_removed' : 'team.member.removed',
      userId: removedByUserId,
      teamId,
      metadata: {
        removedUserId: userId,
        selfRemoval
      }
    });

    return true;
  }

  // Update team tags
  async updateTags(teamId: string, tags: { type: string; value: string }[], updatedByUserId: string) {
    // Delete existing tags and recreate
    await prisma.teamTag.deleteMany({
      where: { teamId }
    });

    await prisma.teamTag.createMany({
      data: tags.map((t: { type: string; value: string }) => ({
        teamId,
        tagType: t.type as TagType,
        tagValue: t.value
      }))
    });

    await auditService.log({
      action: 'team.tags.updated',
      userId: updatedByUserId,
      teamId,
      metadata: { tags }
    });

    return true;
  }

  // Get team health metrics (per user decision: visible to all)
  async getHealthMetrics(teamId: string) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: { user: { isActive: true } },
          include: {
            user: {
              select: { emailVerified: true, phoneVerified: true, pushEnabled: true }
            }
          }
        }
      }
    });

    if (!team) return null;

    const responders = team.members.filter(m =>
      m.role === 'TEAM_ADMIN' || m.role === 'RESPONDER'
    );

    const fullyVerifiedResponders = responders.filter(m =>
      m.user.emailVerified && m.user.phoneVerified && m.user.pushEnabled
    );

    // Warnings per user decision: "warn if <3 responders or no admin"
    const warnings: string[] = [];
    if (responders.length < 3) {
      warnings.push('Team has fewer than 3 responders');
    }
    if (!team.members.some(m => m.role === 'TEAM_ADMIN')) {
      warnings.push('Team has no admin');
    }
    if (fullyVerifiedResponders.length < responders.length) {
      warnings.push(`${responders.length - fullyVerifiedResponders.length} responder(s) have unverified contact methods`);
    }

    return {
      memberCount: team.members.length,
      responderCount: responders.length,
      fullyVerifiedResponderCount: fullyVerifiedResponders.length,
      hasAdmin: team.members.some(m => m.role === 'TEAM_ADMIN'),
      maintenanceMode: team.maintenanceMode,
      warnings
    };
  }

  // Format team for API response
  private formatTeam(team: any): TeamWithMembers {
    const members = team.members || [];
    const responders = members.filter((m: { role: TeamRole }) =>
      m.role === 'TEAM_ADMIN' || m.role === 'RESPONDER'
    );

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      isActive: team.isActive,
      syncedFromOkta: team.syncedFromOkta,
      slackChannel: team.slackChannel,
      maintenanceMode: team.maintenanceMode,
      tags: (team.tags || []).map((t: { tagType: TagType; tagValue: string }) => ({
        type: t.tagType,
        value: t.tagValue
      })),
      members: members.map((m: { user: { id: string; email: string; firstName: string; lastName: string }; role: TeamRole; joinedAt: Date }) => ({
        userId: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      memberCount: members.length,
      responderCount: responders.length,
      hasAdmin: members.some((m: { role: TeamRole }) => m.role === 'TEAM_ADMIN'),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    };
  }
}

export const teamService = new TeamService();
