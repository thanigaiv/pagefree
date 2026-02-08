import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { logger } from '../config/logger.js';
import type {
  CreatePostmortemInput,
  UpdatePostmortemInput,
  Postmortem,
  PostmortemTimelineEvent
} from '../types/postmortem.js';

class PostmortemService {
  async create(data: CreatePostmortemInput, userId: string): Promise<Postmortem> {
    const postmortem = await prisma.postmortem.create({
      data: {
        title: data.title,
        content: data.content || '',
        incidentIds: data.incidentIds,
        teamId: data.teamId,
        createdById: userId,
        status: 'DRAFT'
      },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    await auditService.log({
      action: 'postmortem.created',
      userId,
      teamId: data.teamId,
      resourceType: 'postmortem',
      resourceId: postmortem.id,
      severity: 'INFO',
      metadata: {
        title: data.title,
        incidentCount: data.incidentIds.length
      }
    });

    logger.info({ postmortemId: postmortem.id, userId }, 'Postmortem created');
    return postmortem as unknown as Postmortem;
  }

  async getById(id: string): Promise<Postmortem | null> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        actionItems: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } }
          },
          orderBy: [
            { status: 'asc' },
            { priority: 'desc' },
            { createdAt: 'asc' }
          ]
        }
      }
    });
    return postmortem as unknown as Postmortem | null;
  }

  async list(filters?: { teamId?: string }): Promise<Postmortem[]> {
    const postmortems = await prisma.postmortem.findMany({
      where: filters?.teamId ? { teamId: filters.teamId } : undefined,
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        actionItems: {
          select: { id: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return postmortems as unknown as Postmortem[];
  }

  async update(id: string, data: UpdatePostmortemInput, userId: string): Promise<Postmortem> {
    const existing = await prisma.postmortem.findUnique({
      where: { id },
      select: { status: true, teamId: true }
    });

    if (!existing) {
      throw new Error('Postmortem not found');
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      updateData.publishedAt = new Date();
    }

    const postmortem = await prisma.postmortem.update({
      where: { id },
      data: updateData,
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    await auditService.log({
      action: 'postmortem.updated',
      userId,
      teamId: postmortem.teamId,
      resourceType: 'postmortem',
      resourceId: id,
      severity: 'INFO',
      metadata: { changes: Object.keys(data), newStatus: data.status }
    });

    logger.info({ postmortemId: id, userId }, 'Postmortem updated');
    return postmortem as unknown as Postmortem;
  }

  async delete(id: string, userId: string): Promise<void> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id },
      select: { teamId: true, title: true }
    });

    if (!postmortem) {
      throw new Error('Postmortem not found');
    }

    await prisma.postmortem.delete({ where: { id } });

    await auditService.log({
      action: 'postmortem.deleted',
      userId,
      teamId: postmortem.teamId,
      resourceType: 'postmortem',
      resourceId: id,
      severity: 'WARN',
      metadata: { title: postmortem.title }
    });

    logger.info({ postmortemId: id, userId }, 'Postmortem deleted');
  }

  async getTimeline(incidentIds: string[]): Promise<PostmortemTimelineEvent[]> {
    if (incidentIds.length === 0) {
      return [];
    }

    const events = await prisma.auditEvent.findMany({
      where: {
        resourceType: 'incident',
        resourceId: { in: incidentIds }
      },
      orderBy: { timestamp: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    return events.map(event => ({
      id: event.id,
      action: event.action,
      timestamp: event.timestamp.toISOString(),
      userId: event.userId,
      user: event.user,
      metadata: event.metadata as Record<string, unknown>,
      incidentId: event.resourceId!
    }));
  }

  async publish(id: string, userId: string): Promise<Postmortem> {
    return this.update(id, { status: 'PUBLISHED' }, userId);
  }
}

export const postmortemService = new PostmortemService();
