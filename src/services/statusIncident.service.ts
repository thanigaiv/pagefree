import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { Prisma } from '@prisma/client';
import type {
  StatusIncidentStatus,
  StatusIncidentSeverity,
  StatusUpdate
} from '../types/statusPage.js';

/**
 * StatusIncidentService manages public-facing incident information on status pages.
 * Status incidents can be standalone or linked to platform incidents.
 */
class StatusIncidentService {
  /**
   * Create a new status incident.
   */
  async create(
    statusPageId: string,
    data: {
      title: string;
      message?: string;
      severity: StatusIncidentSeverity;
      affectedComponentIds?: string[];
      incidentId?: string; // Optional link to platform incident
    }
  ) {
    const initialUpdate: StatusUpdate = {
      timestamp: new Date().toISOString(),
      status: 'INVESTIGATING',
      message: data.message || 'We are currently investigating this issue.'
    };

    const statusIncident = await prisma.statusIncident.create({
      data: {
        statusPageId,
        title: data.title,
        message: data.message,
        severity: data.severity,
        status: 'INVESTIGATING',
        affectedComponentIds: data.affectedComponentIds || [],
        incidentId: data.incidentId,
        updates: [initialUpdate] as unknown as Prisma.InputJsonValue
      }
    });

    logger.info(
      { statusIncidentId: statusIncident.id, statusPageId, title: data.title },
      'Created status incident'
    );

    return statusIncident;
  }

  /**
   * Add an update to a status incident.
   */
  async addUpdate(
    id: string,
    update: {
      status: StatusIncidentStatus;
      message: string;
    }
  ) {
    const current = await prisma.statusIncident.findUnique({
      where: { id }
    });

    if (!current) {
      throw new Error('Status incident not found');
    }

    // Get current updates array (stored as JSON)
    const currentUpdates = (current.updates as unknown as StatusUpdate[]) || [];

    // Create new update entry
    const newUpdate: StatusUpdate = {
      timestamp: new Date().toISOString(),
      status: update.status,
      message: update.message
    };

    // Append new update
    const updates = [...currentUpdates, newUpdate];

    // Determine if we should set resolvedAt
    const resolvedAt =
      update.status === 'RESOLVED' && !current.resolvedAt
        ? new Date()
        : current.resolvedAt;

    const statusIncident = await prisma.statusIncident.update({
      where: { id },
      data: {
        status: update.status,
        updates: updates as unknown as Prisma.InputJsonValue,
        resolvedAt
      }
    });

    logger.info(
      { statusIncidentId: id, status: update.status },
      'Added status incident update'
    );

    return statusIncident;
  }

  /**
   * Resolve a status incident with an optional final message.
   */
  async resolve(id: string, message?: string): Promise<void> {
    await this.addUpdate(id, {
      status: 'RESOLVED',
      message: message || 'This incident has been resolved.'
    });

    logger.info({ statusIncidentId: id }, 'Resolved status incident');
  }

  /**
   * Link a status incident to a platform incident.
   * Used for auto-created status incidents from platform incidents.
   */
  async linkToIncident(id: string, incidentId: string): Promise<void> {
    await prisma.statusIncident.update({
      where: { id },
      data: { incidentId }
    });

    logger.info(
      { statusIncidentId: id, incidentId },
      'Linked status incident to platform incident'
    );
  }

  /**
   * List status incidents for a status page.
   */
  async listByStatusPage(
    statusPageId: string,
    options?: {
      status?: StatusIncidentStatus | StatusIncidentStatus[];
      limit?: number;
      includeResolved?: boolean;
    }
  ) {
    const where: {
      statusPageId: string;
      status?: string | { in: string[] };
    } = {
      statusPageId
    };

    if (options?.status) {
      if (Array.isArray(options.status)) {
        where.status = { in: options.status };
      } else {
        where.status = options.status;
      }
    } else if (!options?.includeResolved) {
      // Default: exclude resolved unless explicitly requested
      where.status = { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] };
    }

    return prisma.statusIncident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit
    });
  }

  /**
   * Get status incident history for a status page.
   * Returns resolved incidents within the specified number of days.
   */
  async getHistory(
    statusPageId: string,
    days: number = 7
  ) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return prisma.statusIncident.findMany({
      where: {
        statusPageId,
        status: 'RESOLVED',
        resolvedAt: { gte: since }
      },
      orderBy: { resolvedAt: 'desc' },
      take: 50
    });
  }

  /**
   * Get a status incident by ID.
   */
  async getById(id: string) {
    return prisma.statusIncident.findUnique({
      where: { id },
      include: {
        statusPage: {
          select: { id: true, name: true, teamId: true }
        },
        incident: {
          select: { id: true, status: true, priority: true, fingerprint: true }
        }
      }
    });
  }

  /**
   * Update status incident metadata (title, message, severity).
   */
  async updateMetadata(
    id: string,
    data: {
      title?: string;
      message?: string;
      severity?: StatusIncidentSeverity;
      affectedComponentIds?: string[];
    }
  ) {
    const statusIncident = await prisma.statusIncident.update({
      where: { id },
      data: {
        title: data.title,
        message: data.message,
        severity: data.severity,
        affectedComponentIds: data.affectedComponentIds
      }
    });

    logger.info({ statusIncidentId: id }, 'Updated status incident metadata');

    return statusIncident;
  }

  /**
   * Delete a status incident.
   * Only allowed for unresolved incidents.
   */
  async delete(id: string): Promise<void> {
    const incident = await prisma.statusIncident.findUnique({
      where: { id }
    });

    if (!incident) {
      throw new Error('Status incident not found');
    }

    if (incident.resolvedAt) {
      throw new Error('Cannot delete resolved status incidents');
    }

    await prisma.statusIncident.delete({
      where: { id }
    });

    logger.info({ statusIncidentId: id }, 'Deleted status incident');
  }

  /**
   * Find active (unresolved) status incidents for a platform incident.
   */
  async findByPlatformIncident(incidentId: string) {
    return prisma.statusIncident.findMany({
      where: {
        incidentId,
        resolvedAt: null
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const statusIncidentService = new StatusIncidentService();
