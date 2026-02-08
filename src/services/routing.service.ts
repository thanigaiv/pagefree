import { prisma } from '../config/database.js';
import { onCallService } from './oncall.service.js';
import { logger } from '../config/logger.js';
import { serviceService } from './service.service.js';
import type { ServiceWithTeam } from '../types/service.js';

export interface RoutingResult {
  teamId: string;
  escalationPolicyId: string;
  assignedUserId: string | null;
  serviceId?: string; // Present when routed via service (ROUTE-03)
}

class RoutingService {
  /**
   * Route alert to appropriate team based on metadata.
   * Priority: 1) routing_key -> service, 2) integration default service, 3) TeamTag fallback
   * Returns team, escalation policy, initial assignee, and optionally serviceId.
   */
  async routeAlertToTeam(
    alert: any,
    integration?: { defaultServiceId?: string | null }
  ): Promise<RoutingResult> {
    const metadata = alert.metadata as any;

    // 1. Try routing_key from alert metadata (ROUTE-01)
    const routingKey = metadata?.routing_key || metadata?.routingKey;
    if (routingKey) {
      const service = await serviceService.getByRoutingKey(routingKey);
      // Filter to only ACTIVE or DEPRECATED services (skip ARCHIVED per research pitfall)
      if (service && service.status !== 'ARCHIVED') {
        logger.debug(
          { alertId: alert.id, routingKey, serviceId: service.id },
          'Routing via service routing_key'
        );
        return this.routeViaService(service, alert.id);
      }
      logger.warn(
        { alertId: alert.id, routingKey },
        'No active service found for routing_key'
      );
    }

    // 2. Try integration default service (ROUTE-04)
    if (integration?.defaultServiceId) {
      const service = await serviceService.get(integration.defaultServiceId);
      if (service && service.status !== 'ARCHIVED') {
        logger.debug(
          { alertId: alert.id, defaultServiceId: integration.defaultServiceId, serviceId: service.id },
          'Routing via integration default service'
        );
        return this.routeViaService(service, alert.id);
      }
      logger.warn(
        { alertId: alert.id, defaultServiceId: integration.defaultServiceId },
        'Integration default service not found or archived'
      );
    }

    // 3. Fallback to TeamTag routing (ROUTE-02)
    const team = await this.determineTeamFromAlert(alert);

    if (!team) {
      throw new Error(`No team found for alert routing (alertId: ${alert.id})`);
    }

    // Get team's default escalation policy
    const policy = await prisma.escalationPolicy.findFirst({
      where: { teamId: team.id, isDefault: true, isActive: true },
      include: { levels: { orderBy: { levelNumber: 'asc' } } }
    });

    if (!policy || policy.levels.length === 0) {
      throw new Error(`Team ${team.name} has no active escalation policy`);
    }

    // Determine first target from level 1
    const firstLevel = policy.levels[0];
    const assignedUserId = await this.resolveEscalationTarget(firstLevel, team.id);

    logger.info(
      { alertId: alert.id, teamId: team.id, policyId: policy.id, assignedUserId },
      'Alert routed to team via TeamTag fallback'
    );

    return {
      teamId: team.id,
      escalationPolicyId: policy.id,
      assignedUserId
    };
  }

  /**
   * Route via service - uses service's team and optionally its escalation policy (ROUTE-05)
   */
  private async routeViaService(service: ServiceWithTeam, alertId: string): Promise<RoutingResult> {
    const teamId = service.teamId;

    // Determine escalation policy: service-specific if set and active, else team default
    let policy = null;

    if (service.escalationPolicyId) {
      // Check if service's escalation policy exists and is active
      policy = await prisma.escalationPolicy.findFirst({
        where: { id: service.escalationPolicyId, isActive: true },
        include: { levels: { orderBy: { levelNumber: 'asc' } } }
      });

      if (!policy) {
        logger.warn(
          { serviceId: service.id, escalationPolicyId: service.escalationPolicyId },
          'Service escalation policy not found or inactive, falling back to team default'
        );
      }
    }

    // Fall back to team default if no service policy
    if (!policy) {
      policy = await prisma.escalationPolicy.findFirst({
        where: { teamId, isDefault: true, isActive: true },
        include: { levels: { orderBy: { levelNumber: 'asc' } } }
      });
    }

    if (!policy || policy.levels.length === 0) {
      throw new Error(`No active escalation policy for service ${service.name} or its team`);
    }

    // Resolve first escalation target
    const firstLevel = policy.levels[0];
    const assignedUserId = await this.resolveEscalationTarget(firstLevel, teamId);

    logger.info(
      { alertId, teamId, serviceId: service.id, policyId: policy.id, assignedUserId },
      'Alert routed via service'
    );

    return {
      teamId,
      escalationPolicyId: policy.id,
      assignedUserId,
      serviceId: service.id
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
