import { prisma } from '../config/database.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { statusNotificationQueue } from '../queues/statusNotification.queue.js';
import { statusSubscriberService } from './statusSubscriber.service.js';
import type { StatusChangeNotification, ComponentStatus } from '../types/statusPage.js';

// Debounce cache constants
const DEBOUNCE_PREFIX = 'status:debounce:';
const DEBOUNCE_TTL = 300; // 5 minutes

/**
 * Service for dispatching status change notifications to subscribers.
 * Implements debounce logic to prevent notification spam during incident flapping.
 */
class StatusNotificationService {
  private get redis() {
    return getRedisClient();
  }

  /**
   * Notify subscribers of a status change for a component.
   * Implements debounce to prevent notification spam during flapping.
   *
   * @param notification - Status change notification details
   */
  async notifyStatusChange(notification: StatusChangeNotification): Promise<void> {
    const {
      statusPageId,
      componentId,
      componentName,
      previousStatus,
      newStatus,
      incidentId,
      message,
    } = notification;

    // Check debounce - skip if status changed back within 5 minutes
    const shouldNotify = await this.checkDebounce(componentId, newStatus);
    if (!shouldNotify) {
      logger.info(
        { componentId, previousStatus, newStatus },
        'Skipping notification - debounce active (status flapping detected)'
      );
      return;
    }

    // Determine notification types from status change
    const notifyTypes = this.getNotifyTypesForChange(previousStatus, newStatus);

    if (notifyTypes.length === 0) {
      logger.debug(
        { previousStatus, newStatus },
        'No notification types for this status change'
      );
      return;
    }

    // Get status page name
    const statusPage = await prisma.statusPage.findUnique({
      where: { id: statusPageId },
      select: { name: true },
    });

    const statusPageName = statusPage?.name ?? 'Status Page';

    // Get subscribers for each notification type and queue notifications
    let totalQueued = 0;

    for (const notifyType of notifyTypes) {
      const subscribers = await statusSubscriberService.getActiveSubscribersForNotification(
        statusPageId,
        componentId,
        notifyType
      );

      for (const subscriber of subscribers) {
        await statusNotificationQueue.add('status-change', {
          type: 'status_change',
          subscriberId: subscriber.id,
          channel: subscriber.channel,
          destination: subscriber.destination,
          data: {
            statusPageId,
            statusPageName,
            componentName,
            previousStatus,
            newStatus,
            message,
          },
        });
        totalQueued++;
      }
    }

    // Update debounce cache
    await this.setDebounce(componentId, newStatus);

    logger.info(
      {
        statusPageId,
        componentId,
        componentName,
        previousStatus,
        newStatus,
        incidentId,
        notifyTypes,
        subscribersNotified: totalQueued,
      },
      'Queued status change notifications'
    );
  }

  /**
   * Notify subscribers that a maintenance window has been scheduled.
   *
   * @param maintenanceId - ID of the maintenance window
   */
  async notifyMaintenanceScheduled(maintenanceId: string): Promise<void> {
    const maintenance = await prisma.maintenanceWindow.findUnique({
      where: { id: maintenanceId },
      include: {
        statusPage: { select: { id: true, name: true } },
        components: { select: { id: true, name: true } },
      },
    });

    if (!maintenance) {
      logger.warn({ maintenanceId }, 'Maintenance not found for notification');
      return;
    }

    if (!maintenance.notifySubscribers) {
      return;
    }

    const componentIds = maintenance.components.map((c) => c.id);

    // Get subscribers who want maintenance notifications
    const subscribers = await this.getSubscribersForMaintenance(
      maintenance.statusPage.id,
      componentIds
    );

    for (const subscriber of subscribers) {
      await statusNotificationQueue.add('maintenance-scheduled', {
        type: 'maintenance',
        subscriberId: subscriber.id,
        channel: subscriber.channel,
        destination: subscriber.destination,
        data: {
          statusPageId: maintenance.statusPage.id,
          statusPageName: maintenance.statusPage.name,
          maintenanceTitle: maintenance.title,
          maintenanceStartTime: maintenance.startTime.toISOString(),
          maintenanceEndTime: maintenance.endTime.toISOString(),
          message: `Scheduled maintenance: ${maintenance.description || 'See details'}`,
        },
      });
    }

    logger.info(
      { maintenanceId, subscribersNotified: subscribers.length },
      'Queued maintenance scheduled notifications'
    );
  }

  /**
   * Notify subscribers that a maintenance window has started.
   *
   * @param maintenanceId - ID of the maintenance window
   */
  async notifyMaintenanceStarted(maintenanceId: string): Promise<void> {
    const maintenance = await prisma.maintenanceWindow.findUnique({
      where: { id: maintenanceId },
      include: {
        statusPage: { select: { id: true, name: true } },
        components: { select: { id: true, name: true } },
      },
    });

    if (!maintenance) {
      logger.warn({ maintenanceId }, 'Maintenance not found for notification');
      return;
    }

    if (!maintenance.notifySubscribers) {
      return;
    }

    const componentIds = maintenance.components.map((c) => c.id);

    const subscribers = await this.getSubscribersForMaintenance(
      maintenance.statusPage.id,
      componentIds
    );

    for (const subscriber of subscribers) {
      await statusNotificationQueue.add('maintenance-started', {
        type: 'maintenance',
        subscriberId: subscriber.id,
        channel: subscriber.channel,
        destination: subscriber.destination,
        data: {
          statusPageId: maintenance.statusPage.id,
          statusPageName: maintenance.statusPage.name,
          maintenanceTitle: maintenance.title,
          maintenanceStartTime: maintenance.startTime.toISOString(),
          maintenanceEndTime: maintenance.endTime.toISOString(),
          message: `Maintenance has started: ${maintenance.description || 'In progress'}`,
        },
      });
    }

    logger.info(
      { maintenanceId, subscribersNotified: subscribers.length },
      'Queued maintenance started notifications'
    );
  }

  /**
   * Notify subscribers that a maintenance window has completed.
   *
   * @param maintenanceId - ID of the maintenance window
   */
  async notifyMaintenanceCompleted(maintenanceId: string): Promise<void> {
    const maintenance = await prisma.maintenanceWindow.findUnique({
      where: { id: maintenanceId },
      include: {
        statusPage: { select: { id: true, name: true } },
        components: { select: { id: true, name: true } },
      },
    });

    if (!maintenance) {
      logger.warn({ maintenanceId }, 'Maintenance not found for notification');
      return;
    }

    if (!maintenance.notifySubscribers) {
      return;
    }

    const componentIds = maintenance.components.map((c) => c.id);

    const subscribers = await this.getSubscribersForMaintenance(
      maintenance.statusPage.id,
      componentIds
    );

    for (const subscriber of subscribers) {
      await statusNotificationQueue.add('maintenance-completed', {
        type: 'maintenance',
        subscriberId: subscriber.id,
        channel: subscriber.channel,
        destination: subscriber.destination,
        data: {
          statusPageId: maintenance.statusPage.id,
          statusPageName: maintenance.statusPage.name,
          maintenanceTitle: maintenance.title,
          maintenanceStartTime: maintenance.startTime.toISOString(),
          maintenanceEndTime: maintenance.endTime.toISOString(),
          message: 'Maintenance has been completed.',
        },
      });
    }

    logger.info(
      { maintenanceId, subscribersNotified: subscribers.length },
      'Queued maintenance completed notifications'
    );
  }

  /**
   * Determine notification types based on status transition.
   * Per research: resolved, degraded, outage, maintenance
   */
  getNotifyTypesForChange(
    previousStatus: ComponentStatus,
    currentStatus: ComponentStatus
  ): string[] {
    const types: string[] = [];

    // Resolved: any status returning to OPERATIONAL
    if (currentStatus === 'OPERATIONAL' && previousStatus !== 'OPERATIONAL') {
      types.push('resolved');
    }

    // Degraded: transition to degraded performance
    if (currentStatus === 'DEGRADED_PERFORMANCE') {
      types.push('degraded');
    }

    // Outage: transition to partial or major outage
    if (
      currentStatus === 'PARTIAL_OUTAGE' ||
      currentStatus === 'MAJOR_OUTAGE'
    ) {
      types.push('outage');
    }

    // Maintenance: transition to under maintenance
    if (currentStatus === 'UNDER_MAINTENANCE') {
      types.push('maintenance');
    }

    return types;
  }

  /**
   * Check if notification should be sent (debounce logic).
   * Per research pitfall #1: prevent notification spam during flapping.
   *
   * Returns false if status changed back to this same status within 5 minutes.
   */
  private async checkDebounce(
    componentId: string,
    newStatus: ComponentStatus
  ): Promise<boolean> {
    const key = `${DEBOUNCE_PREFIX}${componentId}`;
    const lastStatus = await this.redis.get(key);

    // If no recent status change, allow notification
    if (!lastStatus) {
      return true;
    }

    // If changing back to the same status within debounce window, skip
    // This indicates flapping (e.g., OPERATIONAL -> OUTAGE -> OPERATIONAL quickly)
    if (lastStatus === newStatus) {
      return false;
    }

    return true;
  }

  /**
   * Set debounce cache after sending notification.
   */
  private async setDebounce(
    componentId: string,
    status: ComponentStatus
  ): Promise<void> {
    const key = `${DEBOUNCE_PREFIX}${componentId}`;
    await this.redis.setex(key, DEBOUNCE_TTL, status);
  }

  /**
   * Get subscribers for maintenance notifications.
   */
  private async getSubscribersForMaintenance(
    statusPageId: string,
    componentIds: string[]
  ) {
    // Get all active, verified subscribers who want maintenance notifications
    const subscribers = await prisma.statusSubscriber.findMany({
      where: {
        statusPageId,
        isActive: true,
        isVerified: true,
        notifyOn: { has: 'maintenance' },
      },
    });

    // Filter by component if specified
    return subscribers.filter((subscriber) => {
      // Empty componentIds means all components
      if (subscriber.componentIds.length === 0) {
        return true;
      }

      // Check if subscriber cares about any affected component
      return subscriber.componentIds.some((id) => componentIds.includes(id));
    });
  }
}

export const statusNotificationService = new StatusNotificationService();
