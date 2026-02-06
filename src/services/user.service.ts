import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';

export class UserService {
  // Get user profile with all related data
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        teamMembers: {
          where: { team: { isActive: true } },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                description: true
              }
            }
          }
        },
        notificationPreferences: true,
        devices: {
          select: {
            id: true,
            platform: true,
            deviceName: true,
            lastSeenAt: true
          }
        }
      }
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      platformRole: user.platformRole,
      syncedFromOkta: user.syncedFromOkta,
      // Verification status
      verification: {
        email: user.emailVerified,
        phone: user.phoneVerified,
        push: user.pushEnabled
      },
      // Teams with roles
      teams: user.teamMembers.map(m => ({
        id: m.team.id,
        name: m.team.name,
        description: m.team.description,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      // Notification preferences
      notificationPreferences: user.notificationPreferences.map(p => ({
        channel: p.channel,
        enabled: p.enabled,
        priority: p.priority
      })),
      // Registered devices
      devices: user.devices,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  // List all active users (for admin views)
  async listUsers(params: {
    teamId?: string;
    role?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (!params.includeInactive) {
      where.isActive = true;
    }

    if (params.teamId) {
      where.teamMembers = {
        some: { teamId: params.teamId }
      };
    }

    if (params.role) {
      where.platformRole = params.role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          pushEnabled: true,
          createdAt: true,
          teamMembers: {
            include: {
              team: { select: { id: true, name: true } }
            }
          }
        },
        skip: params.offset || 0,
        take: params.limit || 50,
        orderBy: { lastName: 'asc' }
      }),
      prisma.user.count({ where })
    ]);

    return { users, total };
  }

  // Update platform role (admin only)
  async updateRole(userId: string, newRole: 'PLATFORM_ADMIN' | 'USER', adminUserId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { platformRole: newRole }
    });

    await auditService.log({
      action: 'user.role.updated',
      userId: adminUserId,
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        newRole,
        targetUser: user.email
      }
    });

    return user;
  }
}

export const userService = new UserService();
