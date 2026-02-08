import { prisma } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';
import {
  type ComponentStatus,
  STATUS_SEVERITY_ORDER,
  INCIDENT_PRIORITY_TO_STATUS,
} from '../types/statusPage.js';
import { statusNotificationService } from './statusNotification.service.js';
import { socketService } from './socket.service.js';

// Cache constants
const STATUS_CACHE_PREFIX = 'status:component:';
const STATUS_CACHE_TTL = 300; // 5 minutes

class StatusComputationService {
  private get redis() {
    return getRedisClient();
  }

  /**
   * Get cached status or compute fresh.
   */
  async getStatus(componentId: string): Promise<ComponentStatus> {
    // Check cache first
    const cached = await this.redis.get(`${STATUS_CACHE_PREFIX}${componentId}`);
    if (cached && this.isValidStatus(cached)) {
      return cached as ComponentStatus;
    }

    // Compute and cache
    const status = await this.computeStatus(componentId);
    await this.setCachedStatus(componentId, status);
    return status;
  }

  /**
   * Compute status from source of truth (incidents and maintenance windows).
   */
  async computeStatus(componentId: string): Promise<ComponentStatus> {
    const component = await prisma.statusPageComponent.findUnique({
      where: { id: componentId },
      include: {
        maintenanceWindows: {
          where: { status: 'IN_PROGRESS' },
        },
      },
    });

    if (!component) {
      return 'OPERATIONAL';
    }

    // Check for active maintenance
    const hasActiveMaintenance = component.maintenanceWindows.length > 0;

    // Build where clause for active incidents
    const whereClause: any = {
      status: { in: ['OPEN', 'ACKNOWLEDGED'] },
    };

    if (component.teamId) {
      whereClause.teamId = component.teamId;
    }

    // Find active incidents
    const activeIncidents = await prisma.incident.findMany({
      where: whereClause,
      include: {
        alerts: {
          take: 1,
          select: { source: true },
        },
      },
    });

    // Filter by service identifier if specified
    let matchingIncidents = activeIncidents;
    if (component.serviceIdentifier) {
      matchingIncidents = activeIncidents.filter(
        (inc) => inc.alerts[0]?.source === component.serviceIdentifier
      );
    }

    // Compute worst status using severity order
    let worstStatus: ComponentStatus = 'OPERATIONAL';

    for (const incident of matchingIncidents) {
      const incidentStatus =
        INCIDENT_PRIORITY_TO_STATUS[incident.priority] || 'OPERATIONAL';

      if (
        STATUS_SEVERITY_ORDER.indexOf(incidentStatus) <
        STATUS_SEVERITY_ORDER.indexOf(worstStatus)
      ) {
        worstStatus = incidentStatus;
      }
    }

    // Maintenance shows if no worse status
    if (hasActiveMaintenance && worstStatus === 'OPERATIONAL') {
      return 'UNDER_MAINTENANCE';
    }

    return worstStatus;
  }

  /**
   * Set cached status in Redis and update database.
   */
  async setCachedStatus(
    componentId: string,
    status: ComponentStatus
  ): Promise<void> {
    await Promise.all([
      this.redis.setex(`${STATUS_CACHE_PREFIX}${componentId}`, STATUS_CACHE_TTL, status),
      prisma.statusPageComponent.update({
        where: { id: componentId },
        data: {
          currentStatus: status,
          statusUpdatedAt: new Date(),
        },
      }),
    ]);
  }

  /**
   * Invalidate cache for component.
   */
  async invalidateStatus(componentId: string): Promise<void> {
    await this.redis.del(`${STATUS_CACHE_PREFIX}${componentId}`);
  }

  /**
   * Recompute status for all components affected by an incident.
   * Called when incident state changes.
   */
  async recomputeForIncident(incidentId: string): Promise<void> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        alerts: {
          take: 1,
          select: { source: true },
        },
      },
    });

    if (!incident) {
      return;
    }

    // Find all components that might be affected
    // Components with teamId matching incident.teamId AND (serviceIdentifier is null OR matches alert source)
    const alertSource = incident.alerts[0]?.source;

    // Build OR clauses conditionally
    const orClauses: { teamId: string; serviceIdentifier: string | null }[] = [
      { teamId: incident.teamId, serviceIdentifier: null },
    ];

    // Only add service identifier match if alert has a source
    if (alertSource) {
      orClauses.push({ teamId: incident.teamId, serviceIdentifier: alertSource });
    }

    const components = await prisma.statusPageComponent.findMany({
      where: {
        OR: orClauses,
      },
      include: {
        statusPage: {
          select: { id: true },
        },
      },
    });

    for (const component of components) {
      const oldStatus = component.currentStatus as ComponentStatus;
      const newStatus = await this.computeStatus(component.id);

      if (oldStatus !== newStatus) {
        // Update cache and database
        await this.setCachedStatus(component.id, newStatus);

        logger.info(
          {
            componentId: component.id,
            oldStatus,
            newStatus,
            incidentId,
            statusPageId: component.statusPage.id,
          },
          'Component status changed due to incident'
        );

        // Notify subscribers (async, best-effort)
        try {
          await statusNotificationService.notifyStatusChange({
            statusPageId: component.statusPage.id,
            componentId: component.id,
            componentName: component.name,
            previousStatus: oldStatus,
            newStatus: newStatus,
            incidentId
          });
        } catch (err) {
          logger.warn({ error: (err as Error).message, componentId: component.id }, 'Failed to notify subscribers');
        }

        // Broadcast via WebSocket for real-time UI (best-effort)
        try {
          socketService.broadcast('status:changed', {
            statusPageId: component.statusPage.id,
            componentId: component.id,
            componentName: component.name,
            status: newStatus,
            incidentId,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          logger.warn({ error: (err as Error).message }, 'Failed to broadcast status change');
        }
      }
    }
  }

  /**
   * Warm cache on application startup.
   * Per research pitfall #2: prevents stale status after restart.
   */
  async warmCache(): Promise<void> {
    const components = await prisma.statusPageComponent.findMany({
      include: {
        statusPage: {
          select: { id: true },
        },
      },
    });

    logger.info({ count: components.length }, 'Warming status cache');

    for (const component of components) {
      const status = await this.computeStatus(component.id);
      await this.setCachedStatus(component.id, status);
    }

    logger.info('Status cache warmed');
  }

  /**
   * Compute overall status from an array of component statuses.
   * Returns the worst status.
   */
  computeOverallStatus(componentStatuses: ComponentStatus[]): ComponentStatus {
    if (componentStatuses.length === 0) {
      return 'OPERATIONAL';
    }

    let worstStatus: ComponentStatus = 'OPERATIONAL';

    for (const status of componentStatuses) {
      if (
        STATUS_SEVERITY_ORDER.indexOf(status) <
        STATUS_SEVERITY_ORDER.indexOf(worstStatus)
      ) {
        worstStatus = status;
      }
    }

    return worstStatus;
  }

  /**
   * Validate that a string is a valid ComponentStatus.
   */
  private isValidStatus(status: string): status is ComponentStatus {
    return STATUS_SEVERITY_ORDER.includes(status as ComponentStatus);
  }
}

export const statusComputationService = new StatusComputationService();
