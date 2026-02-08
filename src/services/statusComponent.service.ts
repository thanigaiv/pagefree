import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { ComponentStatus } from '../types/statusPage.js';

interface CreateComponentData {
  name: string;
  description?: string;
  teamId?: string;
  serviceIdentifier?: string;
}

interface UpdateComponentData {
  name?: string;
  description?: string;
  teamId?: string;
  serviceIdentifier?: string;
}

class StatusComponentService {
  /**
   * Create a new component for a status page.
   * Automatically assigns displayOrder as max + 1.
   */
  async create(statusPageId: string, data: CreateComponentData): Promise<any> {
    // Get max displayOrder for the page
    const maxOrder = await prisma.statusPageComponent.aggregate({
      where: { statusPageId },
      _max: { displayOrder: true },
    });

    const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    // Validate team exists if provided
    if (data.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: data.teamId },
        select: { id: true },
      });
      if (!team) {
        throw new Error('Team not found');
      }
    }

    const component = await prisma.statusPageComponent.create({
      data: {
        statusPageId,
        name: data.name,
        description: data.description,
        teamId: data.teamId,
        serviceIdentifier: data.serviceIdentifier,
        displayOrder,
      },
    });

    logger.info(
      { componentId: component.id, statusPageId, displayOrder },
      'Status component created'
    );

    return component;
  }

  /**
   * Update a component.
   */
  async update(id: string, data: UpdateComponentData): Promise<any> {
    // Validate team exists if changing
    if (data.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: data.teamId },
        select: { id: true },
      });
      if (!team) {
        throw new Error('Team not found');
      }
    }

    const updated = await prisma.statusPageComponent.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        teamId: data.teamId,
        serviceIdentifier: data.serviceIdentifier,
      },
    });

    logger.info({ componentId: id }, 'Status component updated');

    return updated;
  }

  /**
   * Delete a component.
   */
  async delete(id: string): Promise<void> {
    await prisma.statusPageComponent.delete({
      where: { id },
    });

    logger.info({ componentId: id }, 'Status component deleted');
  }

  /**
   * Reorder components within a status page.
   * Updates displayOrder for each component based on array position.
   * Uses transaction for atomicity.
   */
  async reorder(statusPageId: string, componentIds: string[]): Promise<void> {
    // Verify all components belong to the status page
    const existing = await prisma.statusPageComponent.findMany({
      where: { statusPageId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((c) => c.id));
    const invalidIds = componentIds.filter((id) => !existingIds.has(id));

    if (invalidIds.length > 0) {
      throw new Error(`Invalid component IDs: ${invalidIds.join(', ')}`);
    }

    // Update display order in transaction
    await prisma.$transaction(
      componentIds.map((id, index) =>
        prisma.statusPageComponent.update({
          where: { id },
          data: { displayOrder: index },
        })
      )
    );

    logger.info(
      { statusPageId, componentCount: componentIds.length },
      'Components reordered'
    );
  }

  /**
   * Get all components for a status page.
   */
  async getByStatusPage(statusPageId: string): Promise<any[]> {
    return prisma.statusPageComponent.findMany({
      where: { statusPageId },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        displayOrder: true,
        teamId: true,
        serviceIdentifier: true,
        currentStatus: true,
        statusUpdatedAt: true,
      },
    });
  }

  /**
   * Update component status.
   * Called by statusComputation service when status changes.
   */
  async updateStatus(componentId: string, status: ComponentStatus): Promise<void> {
    await prisma.statusPageComponent.update({
      where: { id: componentId },
      data: {
        currentStatus: status,
        statusUpdatedAt: new Date(),
      },
    });

    logger.debug({ componentId, status }, 'Component status updated');
  }

  /**
   * Get a component by ID.
   */
  async getById(id: string): Promise<any | null> {
    return prisma.statusPageComponent.findUnique({
      where: { id },
      include: {
        statusPage: {
          select: { id: true, name: true, teamId: true },
        },
      },
    });
  }
}

export const statusComponentService = new StatusComponentService();
