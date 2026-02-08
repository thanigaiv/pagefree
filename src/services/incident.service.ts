import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { cancelEscalation } from '../queues/escalation.queue.js';
import { auditService } from './audit.service.js';
import { socketService } from './socket.service.js';
import { logger } from '../config/logger.js';
import { onIncidentStateChanged } from './workflow/workflow-integration.js';
import { statusComputationService } from './statusComputation.service.js';

interface IncidentFilter {
  teamId?: string;
  status?: string | string[];
  assignedUserId?: string;
  priority?: string;
  startDate?: Date;
  endDate?: Date;
}

interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

class IncidentService {
  // Get incident by ID with related data
  async getById(id: string): Promise<any> {
    return prisma.incident.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        escalationPolicy: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        alerts: {
          select: {
            id: true,
            title: true,
            severity: true,
            triggeredAt: true,
            externalId: true
          },
          orderBy: { triggeredAt: 'desc' }
        },
        escalationJobs: {
          where: { completed: false },
          select: { id: true, scheduledLevel: true, scheduledFor: true }
        }
      }
    });
  }

  // List incidents with filters and pagination
  async list(filters: IncidentFilter, options: PaginationOptions = {}): Promise<{
    incidents: any[];
    nextCursor: string | null;
  }> {
    const { limit = 50, cursor } = options;

    const where: any = {};

    if (filters.teamId) {
      where.teamId = filters.teamId;
    }

    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status }
        : filters.status;
    }

    if (filters.assignedUserId) {
      where.assignedUserId = filters.assignedUserId;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate && { gte: filters.startDate }),
        ...(filters.endDate && { lte: filters.endDate })
      };
    }

    const incidents = await prisma.incident.findMany({
      where,
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor }
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        team: { select: { id: true, name: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { alerts: true } }
      }
    });

    return {
      incidents,
      nextCursor: incidents.length === limit ? incidents[incidents.length - 1].id : null
    };
  }

  // Acknowledge incident - stops escalation
  async acknowledge(
    incidentId: string,
    userId: string,
    metadata?: { note?: string }
  ): Promise<any> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { escalationJobs: { where: { completed: false } } }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    if (incident.status !== 'OPEN') {
      throw new Error(`Cannot acknowledge incident in ${incident.status} status`);
    }

    // Update incident status
    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        assignedUserId: userId // Assign to acknowledger
      }
    });

    // Cancel all pending escalation jobs
    for (const job of incident.escalationJobs) {
      await cancelEscalation(job.bullJobId);
      await prisma.escalationJob.update({
        where: { id: job.id },
        data: { completed: true, cancelledAt: new Date() }
      });
    }

    // Audit log
    await auditService.log({
      action: 'incident.acknowledged',
      userId,
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO',
      metadata: {
        previousStatus: incident.status,
        escalationsCancelled: incident.escalationJobs.length,
        ...metadata
      }
    });

    // Broadcast acknowledgment via WebSocket
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true }
    });

    if (user) {
      socketService.broadcastIncidentAcknowledged(
        {
          incidentId,
          userId,
          user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
          acknowledgedAt: updated.acknowledgedAt!.toISOString(),
        },
        incident.teamId
      );
    }

    logger.info(
      { incidentId, userId, escalationsCancelled: incident.escalationJobs.length },
      'Incident acknowledged'
    );

    // Trigger workflows for state change (don't fail acknowledge on workflow error)
    try {
      await onIncidentStateChanged(
        {
          id: updated.id,
          priority: updated.priority,
          status: updated.status,
          teamId: updated.teamId,
          createdAt: updated.createdAt
        },
        'OPEN',
        'ACKNOWLEDGED'
      );
    } catch (workflowError) {
      logger.error(
        { error: workflowError, incidentId },
        'Failed to trigger workflows on acknowledge'
      );
    }

    // Trigger status page recomputation (async, don't block)
    statusComputationService.recomputeForIncident(incidentId).catch(err => {
      logger.warn({ error: (err as Error).message, incidentId }, 'Failed to recompute status for incident');
    });

    return updated;
  }

  // Resolve incident
  async resolve(
    incidentId: string,
    userId: string,
    metadata: { resolutionNote?: string }
  ): Promise<any> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { escalationJobs: { where: { completed: false } } }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    if (!['OPEN', 'ACKNOWLEDGED'].includes(incident.status)) {
      throw new Error(`Cannot resolve incident in ${incident.status} status`);
    }

    // Update incident status
    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date()
      }
    });

    // Cancel any remaining escalation jobs
    for (const job of incident.escalationJobs) {
      await cancelEscalation(job.bullJobId);
      await prisma.escalationJob.update({
        where: { id: job.id },
        data: { completed: true, cancelledAt: new Date() }
      });
    }

    // Audit log
    await auditService.log({
      action: 'incident.resolved',
      userId,
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO',
      metadata: {
        previousStatus: incident.status,
        resolutionNote: metadata.resolutionNote,
        durationMs: updated.resolvedAt!.getTime() - incident.createdAt.getTime()
      }
    });

    // Broadcast resolution via WebSocket
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true }
    });

    if (user) {
      socketService.broadcastIncidentResolved(
        {
          incidentId,
          userId,
          user: { id: user.id, firstName: user.firstName, lastName: user.lastName },
          resolvedAt: updated.resolvedAt!.toISOString(),
          resolutionNote: metadata.resolutionNote,
        },
        incident.teamId
      );
    }

    logger.info(
      { incidentId, userId, durationMs: updated.resolvedAt!.getTime() - incident.createdAt.getTime() },
      'Incident resolved'
    );

    // Trigger workflows for state change (don't fail resolve on workflow error)
    try {
      await onIncidentStateChanged(
        {
          id: updated.id,
          priority: updated.priority,
          status: updated.status,
          teamId: updated.teamId,
          createdAt: updated.createdAt
        },
        incident.status,
        'RESOLVED'
      );
    } catch (workflowError) {
      logger.error(
        { error: workflowError, incidentId },
        'Failed to trigger workflows on resolve'
      );
    }

    // Trigger status page recomputation (async, don't block)
    statusComputationService.recomputeForIncident(incidentId).catch(err => {
      logger.warn({ error: (err as Error).message, incidentId }, 'Failed to recompute status for incident');
    });

    return updated;
  }

  // Close incident (final state)
  async close(incidentId: string, userId: string): Promise<any> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    if (incident.status !== 'RESOLVED') {
      throw new Error('Only resolved incidents can be closed');
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'CLOSED',
        closedAt: new Date()
      }
    });

    await auditService.log({
      action: 'incident.closed',
      userId,
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO'
    });

    // Trigger workflows for state change (don't fail close on workflow error)
    try {
      await onIncidentStateChanged(
        {
          id: updated.id,
          priority: updated.priority,
          status: updated.status,
          teamId: updated.teamId,
          createdAt: updated.createdAt
        },
        'RESOLVED',
        'CLOSED'
      );
    } catch (workflowError) {
      logger.error(
        { error: workflowError, incidentId },
        'Failed to trigger workflows on close'
      );
    }

    // Trigger status page recomputation (async, don't block)
    statusComputationService.recomputeForIncident(incidentId).catch(err => {
      logger.warn({ error: (err as Error).message, incidentId }, 'Failed to recompute status for incident');
    });

    return updated;
  }

  // Reassign incident to different user (ROUTE-04)
  async reassign(
    incidentId: string,
    newUserId: string,
    byUserId: string,
    reason?: string
  ): Promise<any> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    if (!['OPEN', 'ACKNOWLEDGED'].includes(incident.status)) {
      throw new Error(`Cannot reassign incident in ${incident.status} status`);
    }

    // Verify new user is active team member
    const membership = await prisma.teamMember.findFirst({
      where: {
        userId: newUserId,
        teamId: incident.teamId,
        role: { in: ['RESPONDER', 'TEAM_ADMIN'] },
        user: { isActive: true }
      }
    });

    if (!membership) {
      throw new Error('New assignee must be an active team responder');
    }

    const previousAssignee = incident.assignedUserId;

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: { assignedUserId: newUserId }
    });

    await auditService.log({
      action: 'incident.reassigned',
      userId: byUserId,
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO',
      metadata: {
        previousAssignee,
        newAssignee: newUserId,
        reason
      }
    });

    // Broadcast reassignment via WebSocket
    const newUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { id: true, firstName: true, lastName: true }
    });

    if (newUser) {
      socketService.broadcastIncidentReassigned(
        {
          incidentId,
          fromUserId: previousAssignee,
          toUserId: newUserId,
          toUser: newUser,
          reason,
        },
        incident.teamId
      );
    }

    logger.info(
      { incidentId, previousAssignee, newAssignee: newUserId, byUserId },
      'Incident reassigned'
    );

    return updated;
  }

  // Add note to incident timeline (for INC-05 in Phase 6)
  async addNote(
    incidentId: string,
    userId: string,
    note: string
  ): Promise<void> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId }
    });

    if (!incident) {
      throw new Error('Incident not found');
    }

    // Store note as audit event (timeline is built from audit events)
    await auditService.log({
      action: 'incident.note.added',
      userId,
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incidentId,
      severity: 'INFO',
      metadata: { note }
    });

    // Broadcast note added via WebSocket
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true }
    });

    if (user) {
      socketService.broadcastNoteAdded(
        {
          incidentId,
          note: {
            id: crypto.randomUUID(),
            content: note,
            userId,
            user,
            createdAt: new Date().toISOString(),
          },
        },
        incident.teamId
      );
    }

    logger.debug({ incidentId, userId }, 'Note added to incident');
  }

  // Get incident timeline (audit events for this incident)
  async getTimeline(incidentId: string): Promise<any[]> {
    return prisma.auditEvent.findMany({
      where: {
        resourceType: 'incident',
        resourceId: incidentId
      },
      orderBy: { timestamp: 'asc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    });
  }
}

export const incidentService = new IncidentService();
