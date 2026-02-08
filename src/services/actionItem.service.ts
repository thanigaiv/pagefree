import { prisma } from '../config/database.js';
import { auditService } from './audit.service.js';
import { logger } from '../config/logger.js';
import {
  ACTION_ITEM_TRANSITIONS,
  type ActionItemStatus,
  type CreateActionItemInput,
  type UpdateActionItemInput
} from '../types/postmortem.js';

class ActionItemService {
  async create(postmortemId: string, data: CreateActionItemInput, userId: string) {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id: postmortemId },
      select: { id: true, teamId: true }
    });

    if (!postmortem) {
      throw new Error('Postmortem not found');
    }

    const actionItem = await prisma.actionItem.create({
      data: {
        postmortemId,
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        assigneeId: data.assigneeId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status: 'OPEN'
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    await auditService.log({
      action: 'postmortem.action_item.created',
      userId,
      teamId: postmortem.teamId,
      resourceType: 'action_item',
      resourceId: actionItem.id,
      severity: 'INFO',
      metadata: { postmortemId, title: data.title, assigneeId: data.assigneeId }
    });

    logger.info({ actionItemId: actionItem.id, postmortemId, userId }, 'Action item created');
    return actionItem;
  }

  async getById(id: string) {
    const actionItem = await prisma.actionItem.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } }
      }
    });
    return actionItem;
  }

  async listByPostmortem(postmortemId: string) {
    const actionItems = await prisma.actionItem.findMany({
      where: { postmortemId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { createdAt: 'asc' }
      ]
    });
    return actionItems;
  }

  async listByAssignee(assigneeId: string, status?: ActionItemStatus) {
    const actionItems = await prisma.actionItem.findMany({
      where: {
        assigneeId,
        ...(status ? { status } : {})
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        postmortem: { select: { id: true, title: true, teamId: true } }
      },
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' },
        { priority: 'desc' }
      ]
    });
    return actionItems;
  }

  async update(id: string, data: UpdateActionItemInput, userId: string) {
    const existing = await prisma.actionItem.findUnique({
      where: { id },
      include: { postmortem: { select: { teamId: true } } }
    });

    if (!existing) {
      throw new Error('Action item not found');
    }

    // Validate status transition
    if (data.status && data.status !== existing.status) {
      const validTransitions = ACTION_ITEM_TRANSITIONS[existing.status as ActionItemStatus];
      if (!validTransitions.includes(data.status)) {
        throw new Error(`Invalid status transition: cannot change from ${existing.status} to ${data.status}`);
      }
    }

    const updateData: Record<string, unknown> = { ...data };

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    // Set completedAt when transitioning to COMPLETED
    if (data.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      updateData.completedAt = new Date();
    }
    // Clear completedAt when reopening
    if (data.status && data.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
      updateData.completedAt = null;
    }

    const actionItem = await prisma.actionItem.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    await auditService.log({
      action: 'postmortem.action_item.updated',
      userId,
      teamId: existing.postmortem.teamId,
      resourceType: 'action_item',
      resourceId: id,
      severity: 'INFO',
      metadata: {
        postmortemId: existing.postmortemId,
        changes: Object.keys(data),
        previousStatus: existing.status,
        newStatus: data.status
      }
    });

    logger.info({ actionItemId: id, userId, changes: Object.keys(data) }, 'Action item updated');
    return actionItem;
  }

  async updateStatus(id: string, status: ActionItemStatus, userId: string) {
    return this.update(id, { status }, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const actionItem = await prisma.actionItem.findUnique({
      where: { id },
      include: { postmortem: { select: { teamId: true } } }
    });

    if (!actionItem) {
      throw new Error('Action item not found');
    }

    await prisma.actionItem.delete({ where: { id } });

    await auditService.log({
      action: 'postmortem.action_item.deleted',
      userId,
      teamId: actionItem.postmortem.teamId,
      resourceType: 'action_item',
      resourceId: id,
      severity: 'WARN',
      metadata: { postmortemId: actionItem.postmortemId, title: actionItem.title }
    });

    logger.info({ actionItemId: id, userId }, 'Action item deleted');
  }
}

export const actionItemService = new ActionItemService();
