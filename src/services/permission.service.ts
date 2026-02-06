import { PrismaClient, TeamRole } from '@prisma/client';
import { AuthenticatedUser, PermissionResult } from '../types/auth.js';

// Team role hierarchy for permission checks
const TEAM_ROLE_HIERARCHY: Record<TeamRole, number> = {
  OBSERVER: 1,
  RESPONDER: 2,
  TEAM_ADMIN: 3
};

/**
 * RBAC Model (per user decisions in 01-CONTEXT.md):
 *
 * Platform Roles:
 *   - PLATFORM_ADMIN: Complete control across all teams
 *   - USER: Regular user, permissions determined by team membership
 *
 * Team Roles (per-team):
 *   - TEAM_ADMIN: Full team control (add/remove users, configure schedules, etc.)
 *   - RESPONDER: Can acknowledge and resolve incidents
 *   - OBSERVER: Read-only for stakeholders, managers, support staff
 *
 * Key behaviors:
 *   - Users can be on multiple teams with different roles per team
 *   - Full visibility: all teams can see other teams' incidents/schedules
 *   - Audit logs: team admins see their team, platform admins see all
 */
export class PermissionService {
  // @ts-expect-error - prisma reserved for future database permission checks
  constructor(private readonly _prisma: PrismaClient) {}

  /**
   * Check if user is a platform admin
   */
  isPlatformAdmin(user: AuthenticatedUser): boolean {
    return user.platformRole === 'PLATFORM_ADMIN';
  }

  /**
   * Get user's role on a specific team
   */
  getTeamRole(user: AuthenticatedUser, teamId: string): TeamRole | null {
    const membership = user.teamMembers.find(m => m.teamId === teamId);
    return membership?.role || null;
  }

  /**
   * Check if user has at least the specified role on a team
   */
  hasMinimumTeamRole(user: AuthenticatedUser, teamId: string, minRole: TeamRole): boolean {
    if (this.isPlatformAdmin(user)) return true;

    const role = this.getTeamRole(user, teamId);
    if (!role) return false;

    return TEAM_ROLE_HIERARCHY[role] >= TEAM_ROLE_HIERARCHY[minRole];
  }

  /**
   * Check if user can manage a team (settings, members, configuration)
   */
  canManageTeam(user: AuthenticatedUser, teamId: string): PermissionResult {
    // Platform admins can manage all teams
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    // Team admins can manage their team
    const role = this.getTeamRole(user, teamId);
    if (role === 'TEAM_ADMIN') {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only team admins can manage team settings'
    };
  }

  /**
   * Check if user can view a team
   * Per user decision: "Full visibility - all teams can see other teams' incidents"
   */
  canViewTeam(_user: AuthenticatedUser, _teamId: string): PermissionResult {
    // Any authenticated user can view any team
    return { allowed: true };
  }

  /**
   * Check if user can respond to incidents on a team (acknowledge, resolve)
   */
  canRespondToIncident(user: AuthenticatedUser, teamId: string): PermissionResult {
    // Platform admins can respond to anything
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    // Team members with TEAM_ADMIN or RESPONDER role can respond
    const role = this.getTeamRole(user, teamId);
    if (role === 'TEAM_ADMIN' || role === 'RESPONDER') {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only team responders and admins can respond to incidents'
    };
  }

  /**
   * Check if user can view audit logs
   */
  canViewAuditLogs(user: AuthenticatedUser, teamId?: string): PermissionResult {
    // Platform admins see all audit logs
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    // If teamId provided, check if user is team admin for that team
    if (teamId) {
      const role = this.getTeamRole(user, teamId);
      if (role === 'TEAM_ADMIN') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Only team admins can view team audit logs'
      };
    }

    // No teamId provided and not platform admin
    return {
      allowed: false,
      reason: 'Only platform admins can view all audit logs'
    };
  }

  /**
   * Check if user can invite users to the platform
   * Per user decision: invite goes through Okta, only platform admins
   */
  canInviteUsers(user: AuthenticatedUser): PermissionResult {
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only platform admins can invite users'
    };
  }

  /**
   * Check if user can manage team members (add, remove, change roles)
   */
  canManageTeamMembers(user: AuthenticatedUser, teamId: string): PermissionResult {
    // Platform admins can manage all teams
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    // Team admins can manage their team
    const role = this.getTeamRole(user, teamId);
    if (role === 'TEAM_ADMIN') {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only team admins can manage team members'
    };
  }

  /**
   * Check if user can create teams
   * Per user decision: "Request-based (users request new teams, platform admin approves)"
   */
  canCreateTeam(user: AuthenticatedUser): PermissionResult {
    if (this.isPlatformAdmin(user)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only platform admins can create teams directly'
    };
  }
}

// Export singleton instance
import { prisma } from '../config/database.js';
export const permissionService = new PermissionService(prisma);
