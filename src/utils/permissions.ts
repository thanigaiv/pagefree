import { AuthenticatedUser } from '../types/auth.js';

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

/**
 * Get all team IDs where user has TEAM_ADMIN role
 * Platform admins return empty array (they have access to all teams)
 */
export function getAdminTeamIds(user: AuthenticatedUser): string[] {
  if (user.platformRole === 'PLATFORM_ADMIN') {
    return []; // Platform admin sees all, no filter needed
  }

  return user.teamMembers
    .filter(m => m.role === 'TEAM_ADMIN')
    .map(m => m.teamId);
}

/**
 * Check if user can access specific team's audit logs
 * Platform admins can always access, team admins can access their team's logs
 */
export function canAccessTeamAuditLogs(user: AuthenticatedUser, teamId: string): boolean {
  if (user.platformRole === 'PLATFORM_ADMIN') return true;

  const membership = user.teamMembers.find(m => m.teamId === teamId);
  return membership?.role === 'TEAM_ADMIN';
}
