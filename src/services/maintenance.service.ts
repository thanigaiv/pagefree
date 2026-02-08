import { prisma } from '../config/database.js';
import * as rruleModule from 'rrule';
const { RRule } = rruleModule;
import {
  scheduleMaintenanceJobs,
  cancelMaintenanceJobs
} from '../queues/maintenance.queue.js';
import { logger } from '../config/logger.js';
import type { CreateMaintenanceWindowInput, MaintenanceStatus } from '../types/statusPage.js';
import { statusComputationService } from './statusComputation.service.js';
import { statusNotificationService } from './statusNotification.service.js';
import { socketService } from './socket.service.js';

/**
 * MaintenanceService handles scheduling and management of maintenance windows.
 * Integrates with BullMQ for scheduled start/end actions.
 */
class MaintenanceService {
  /**
   * Create a new maintenance window with scheduled jobs.
   */
  async create(
    statusPageId: string,
    createdById: string,
    data: CreateMaintenanceWindowInput
  ) {
    // Validate times
    if (data.endTime <= data.startTime) {
      throw new Error('End time must be after start time');
    }

    // Validate componentIds belong to this status page
    if (data.componentIds.length > 0) {
      const components = await prisma.statusPageComponent.findMany({
        where: {
          id: { in: data.componentIds },
          statusPageId
        }
      });

      if (components.length !== data.componentIds.length) {
        throw new Error('Some component IDs do not belong to this status page');
      }
    }

    // Create maintenance window with component relations
    const maintenance = await prisma.maintenanceWindow.create({
      data: {
        statusPageId,
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        autoUpdateStatus: data.autoUpdateStatus,
        notifySubscribers: data.notifySubscribers,
        recurrenceRule: data.recurrenceRule,
        status: 'SCHEDULED',
        createdById,
        components: {
          connect: data.componentIds.map((id) => ({ id }))
        }
      },
      include: {
        components: true
      }
    });

    // Schedule jobs if auto-update or notify is enabled
    if (data.autoUpdateStatus || data.notifySubscribers) {
      await scheduleMaintenanceJobs(maintenance);
    }

    logger.info(
      { maintenanceId: maintenance.id, statusPageId, componentCount: data.componentIds.length },
      'Created maintenance window'
    );

    return maintenance;
  }

  /**
   * Update a maintenance window. Reschedules jobs if times changed.
   */
  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      startTime: Date;
      endTime: Date;
      autoUpdateStatus: boolean;
      notifySubscribers: boolean;
    }>
  ) {
    const current = await prisma.maintenanceWindow.findUnique({
      where: { id }
    });

    if (!current) {
      throw new Error('Maintenance window not found');
    }

    // Validate times if being updated
    const startTime = data.startTime || current.startTime;
    const endTime = data.endTime || current.endTime;
    if (endTime <= startTime) {
      throw new Error('End time must be after start time');
    }

    const maintenance = await prisma.maintenanceWindow.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        autoUpdateStatus: data.autoUpdateStatus,
        notifySubscribers: data.notifySubscribers
      },
      include: {
        components: true
      }
    });

    // Reschedule jobs if times changed and still SCHEDULED
    const timesChanged =
      data.startTime?.getTime() !== current.startTime.getTime() ||
      data.endTime?.getTime() !== current.endTime.getTime();

    if (timesChanged && current.status === 'SCHEDULED') {
      await cancelMaintenanceJobs(id);
      if (maintenance.autoUpdateStatus || maintenance.notifySubscribers) {
        await scheduleMaintenanceJobs(maintenance);
      }
      logger.info({ maintenanceId: id }, 'Rescheduled maintenance jobs after time update');
    }

    return maintenance;
  }

  /**
   * Cancel a scheduled maintenance window.
   */
  async cancel(id: string): Promise<void> {
    await prisma.maintenanceWindow.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    await cancelMaintenanceJobs(id);

    logger.info({ maintenanceId: id }, 'Cancelled maintenance window');
  }

  /**
   * Delete a maintenance window completely.
   */
  async delete(id: string): Promise<void> {
    await cancelMaintenanceJobs(id);

    await prisma.maintenanceWindow.delete({
      where: { id }
    });

    logger.info({ maintenanceId: id }, 'Deleted maintenance window');
  }

  /**
   * Start a maintenance window. Called by worker when start time reached.
   */
  async startMaintenance(id: string): Promise<void> {
    const maintenance = await prisma.maintenanceWindow.findUnique({
      where: { id },
      include: { components: true }
    });

    if (!maintenance) {
      logger.warn({ maintenanceId: id }, 'Maintenance window not found for start');
      return;
    }

    if (maintenance.status !== 'SCHEDULED') {
      logger.warn(
        { maintenanceId: id, status: maintenance.status },
        'Maintenance not in SCHEDULED status, skipping start'
      );
      return;
    }

    await prisma.maintenanceWindow.update({
      where: { id },
      data: { status: 'IN_PROGRESS' }
    });

    // If autoUpdateStatus, update affected component statuses
    if (maintenance.autoUpdateStatus) {
      await this.updateComponentStatuses(
        maintenance.components.map((c) => c.id),
        'UNDER_MAINTENANCE'
      );

      // Invalidate cache and broadcast for each component
      for (const component of maintenance.components) {
        await statusComputationService.invalidateStatus(component.id);

        // Broadcast via WebSocket for real-time UI
        try {
          socketService.broadcast('status:changed', {
            statusPageId: maintenance.statusPageId,
            componentId: component.id,
            componentName: component.name,
            status: 'UNDER_MAINTENANCE',
            maintenanceId: id,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          logger.warn({ error: (err as Error).message }, 'Failed to broadcast maintenance start');
        }
      }
    }

    // Notify subscribers that maintenance has started (best-effort)
    try {
      await statusNotificationService.notifyMaintenanceStarted(id);
    } catch (err) {
      logger.warn({ error: (err as Error).message, maintenanceId: id }, 'Failed to notify maintenance started');
    }

    logger.info(
      { maintenanceId: id, componentCount: maintenance.components.length },
      'Started maintenance window'
    );
  }

  /**
   * Complete a maintenance window. Called by worker when end time reached.
   */
  async completeMaintenance(id: string): Promise<void> {
    const maintenance = await prisma.maintenanceWindow.findUnique({
      where: { id },
      include: { components: true }
    });

    if (!maintenance) {
      logger.warn({ maintenanceId: id }, 'Maintenance window not found for completion');
      return;
    }

    if (maintenance.status !== 'IN_PROGRESS' && maintenance.status !== 'SCHEDULED') {
      logger.warn(
        { maintenanceId: id, status: maintenance.status },
        'Maintenance not in expected status, skipping completion'
      );
      return;
    }

    await prisma.maintenanceWindow.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });

    // If autoUpdateStatus, recompute affected component statuses
    if (maintenance.autoUpdateStatus) {
      // Recompute status for each affected component (may have active incidents)
      for (const component of maintenance.components) {
        await statusComputationService.invalidateStatus(component.id);
        const newStatus = await statusComputationService.getStatus(component.id);

        // Broadcast via WebSocket for real-time UI
        try {
          socketService.broadcast('status:changed', {
            statusPageId: maintenance.statusPageId,
            componentId: component.id,
            componentName: component.name,
            status: newStatus,
            maintenanceId: id,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          logger.warn({ error: (err as Error).message }, 'Failed to broadcast maintenance complete');
        }
      }
    }

    // Notify subscribers that maintenance has completed (best-effort)
    try {
      await statusNotificationService.notifyMaintenanceCompleted(id);
    } catch (err) {
      logger.warn({ error: (err as Error).message, maintenanceId: id }, 'Failed to notify maintenance completed');
    }

    logger.info(
      { maintenanceId: id, componentCount: maintenance.components.length },
      'Completed maintenance window'
    );
  }

  /**
   * Get active maintenance windows affecting a specific component.
   */
  async getActiveForComponent(componentId: string) {
    return prisma.maintenanceWindow.findMany({
      where: {
        components: {
          some: { id: componentId }
        },
        status: 'IN_PROGRESS'
      },
      orderBy: { startTime: 'asc' }
    });
  }

  /**
   * List maintenance windows for a status page.
   */
  async listByStatusPage(
    statusPageId: string,
    options?: {
      status?: MaintenanceStatus;
      upcoming?: boolean;
      limit?: number;
    }
  ) {
    // Build where clause dynamically
    const where: {
      statusPageId: string;
      status?: string | { in: string[] };
      startTime?: { gte: Date };
    } = {
      statusPageId
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.upcoming) {
      where.startTime = { gte: new Date() };
      where.status = { in: ['SCHEDULED', 'IN_PROGRESS'] };
    }

    return prisma.maintenanceWindow.findMany({
      where,
      include: {
        components: {
          select: { id: true, name: true }
        }
      },
      orderBy: { startTime: 'asc' },
      take: options?.limit
    });
  }

  /**
   * Check if a recurring maintenance window is currently active.
   */
  isMaintenanceActive(
    window: { startTime: Date; endTime: Date; recurrenceRule: string | null },
    now: Date = new Date()
  ): boolean {
    if (!window.recurrenceRule) {
      // Simple case: just check time range
      return now >= window.startTime && now <= window.endTime;
    }

    // Recurring: use rrule to find occurrences
    try {
      const rule = RRule.fromString(window.recurrenceRule);
      const duration = window.endTime.getTime() - window.startTime.getTime();

      // Find occurrences that might contain 'now'
      const occurrences = rule.between(
        new Date(now.getTime() - duration),
        now,
        true
      );

      for (const start of occurrences) {
        const end = new Date(start.getTime() + duration);
        if (now >= start && now <= end) {
          return true;
        }
      }
    } catch (error) {
      logger.error({ error, recurrenceRule: window.recurrenceRule }, 'Failed to parse recurrence rule');
    }

    return false;
  }

  /**
   * Get a maintenance window by ID.
   */
  async getById(id: string) {
    return prisma.maintenanceWindow.findUnique({
      where: { id },
      include: {
        components: true,
        statusPage: {
          select: { id: true, name: true, teamId: true }
        }
      }
    });
  }

  /**
   * Update component statuses during maintenance start/end.
   * This is a simplified version - statusComputation service will handle complex cases.
   */
  private async updateComponentStatuses(
    componentIds: string[],
    status: string
  ): Promise<void> {
    await prisma.statusPageComponent.updateMany({
      where: { id: { in: componentIds } },
      data: {
        currentStatus: status,
        statusUpdatedAt: new Date()
      }
    });

    logger.debug(
      { componentIds, status },
      'Updated component statuses for maintenance'
    );
  }
}

export const maintenanceService = new MaintenanceService();
