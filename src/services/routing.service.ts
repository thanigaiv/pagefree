import { prisma } from '../config/database.js';
import { onCallService } from './oncall.service.js';
import { logger } from '../config/logger.js';

export interface RoutingResult {
  teamId: string;
  escalationPolicyId: string;
  assignedUserId: string | null;
}

class RoutingService {
  /**
   * Route alert to appropriate team based on metadata.
   * Returns team, escalation policy, and initial assignee.
   */
  async routeAlertToTeam(alert: any): Promise<RoutingResult> {
    // 1. Determine team from alert metadata
    const team = await this.determineTeamFromAlert(alert);

    if (!team) {
      throw new Error(`No team found for alert routing (alertId: ${alert.id})`);
    }

    // 2. Get team's default escalation policy
    const policy = await prisma.escalationPolicy.findFirst({
      where: { teamId: team.id, isDefault: true, isActive: true },
      include: { levels: { orderBy: { levelNumber: 'asc' } } }
    });

    if (!policy || policy.levels.length === 0) {
      throw new Error(`Team ${team.name} has no active escalation policy`);
    }

    // 3. Determine first target from level 1
    const firstLevel = policy.levels[0];
    const assignedUserId = await this.resolveEscalationTarget(firstLevel, team.id);

    logger.info(
      { alertId: alert.id, teamId: team.id, policyId: policy.id, assignedUserId },
      'Alert routed to team'
    );

    return {
      teamId: team.id,
      escalationPolicyId: policy.id,
      assignedUserId
    };
  }

  /**
   * Determine team from alert metadata (service name, integration default, etc.)
   */
  private async determineTeamFromAlert(alert: any): Promise<any | null> {
    const metadata = alert.metadata as any;

    // Try service name from metadata
    const serviceName = metadata?.service || metadata?.service_name || metadata?.serviceName;

    if (serviceName) {
      // Find team with matching technical tag
      const teamTag = await prisma.teamTag.findFirst({
        where: {
          tagType: 'TECHNICAL',
          tagValue: serviceName
        },
        include: { team: true }
      });

      if (teamTag) {
        logger.debug({ serviceName, teamId: teamTag.team.id }, 'Routed by service tag');
        return teamTag.team;
      }
    }

    // Fallback: integration default team (not implemented yet)
    // Integration model doesn't have defaultTeamId field in current schema
    // For now, return null to throw routing error
    logger.warn({ alertId: alert.id }, 'No team found for alert');
    return null;
  }

  /**
   * Resolve escalation target to a specific user ID.
   * Returns null if no user available (creates incident without assignment).
   */
  async resolveEscalationTarget(
    level: any,
    teamId: string
  ): Promise<string | null> {
    if (level.targetType === 'user') {
      // Direct user assignment
      const user = await prisma.user.findUnique({
        where: { id: level.targetId, isActive: true }
      });
      return user?.id || null;
    }

    if (level.targetType === 'schedule') {
      // Use Phase 3 on-call lookup
      const onCall = await onCallService.getCurrentOnCall({
        scheduleId: level.targetId
      });

      if (onCall?.user) {
        // Verify user is still active team member
        const membership = await prisma.teamMember.findFirst({
          where: {
            userId: onCall.user.id,
            teamId,
            role: { in: ['RESPONDER', 'TEAM_ADMIN'] }
          }
        });

        if (membership) {
          return onCall.user.id;
        }
      }
      return null;
    }

    if (level.targetType === 'entire_team') {
      // Get all team responders, return first available
      const members = await prisma.teamMember.findMany({
        where: {
          teamId,
          role: { in: ['RESPONDER', 'TEAM_ADMIN'] },
          user: { isActive: true }
        },
        include: { user: true },
        orderBy: { joinedAt: 'asc' }
      });

      return members[0]?.userId || null;
    }

    return null;
  }
}

export const routingService = new RoutingService();
