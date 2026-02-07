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
    switch (level.targetType) {
      case 'user':
        return this.resolveDirectUser(level.targetId);

      case 'schedule':
        return this.resolveScheduleUser(level.targetId, teamId);

      case 'entire_team':
        return this.resolveTeamUser(teamId);

      default:
        return null;
    }
  }

  /**
   * Resolve direct user assignment.
   */
  private async resolveDirectUser(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId, isActive: true }
    });
    return user?.id || null;
  }

  /**
   * Resolve on-call user from schedule.
   */
  private async resolveScheduleUser(scheduleId: string, teamId: string): Promise<string | null> {
    const onCall = await onCallService.getCurrentOnCall({ scheduleId });

    if (!onCall?.user) {
      return null;
    }

    // Verify user is active team member with appropriate role
    const membership = await prisma.teamMember.findFirst({
      where: {
        userId: onCall.user.id,
        teamId,
        role: { in: ['RESPONDER', 'TEAM_ADMIN'] }
      }
    });

    return membership ? onCall.user.id : null;
  }

  /**
   * Resolve first available team member.
   */
  private async resolveTeamUser(teamId: string): Promise<string | null> {
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
}

export const routingService = new RoutingService();
