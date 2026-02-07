import { prisma } from '../config/database.js';
import { scheduleEscalation } from '../queues/escalation.queue.js';
import { dispatchNotification } from './notification/index.js';
import { routingService } from './routing.service.js';
import { auditService } from './audit.service.js';
import { logger } from '../config/logger.js';

class EscalationService {
  // Start escalation for a new incident
  async startEscalation(incidentId: string): Promise<void> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        escalationPolicy: {
          include: { levels: { orderBy: { levelNumber: 'asc' } } }
        }
      }
    });

    if (!incident || !incident.escalationPolicy) {
      logger.error({ incidentId }, 'Cannot start escalation - incident or policy not found');
      return;
    }

    const firstLevel = incident.escalationPolicy.levels[0];
    if (!firstLevel) {
      logger.error({ incidentId }, 'Escalation policy has no levels');
      return;
    }

    // Schedule first escalation
    const bullJobId = await scheduleEscalation(
      incidentId,
      0, // Current level 0, will escalate to level 1
      1, // First repeat
      firstLevel.timeoutMinutes
    );

    // Track the job
    await prisma.escalationJob.create({
      data: {
        incidentId,
        bullJobId,
        scheduledLevel: 1,
        scheduledFor: new Date(Date.now() + firstLevel.timeoutMinutes * 60 * 1000)
      }
    });

    // Dispatch initial notification to assigned user
    if (incident.assignedUserId) {
      try {
        await dispatchNotification(
          incidentId,
          incident.assignedUserId,
          'new_incident',
          { escalationLevel: 1 }
        );
      } catch (notificationError) {
        // Log but don't fail escalation - notification is best-effort
        logger.error(
          { error: notificationError, incidentId, userId: incident.assignedUserId, escalationLevel: 1 },
          'Failed to dispatch notification'
        );
      }
    }

    logger.info(
      { incidentId, scheduledLevel: 1, timeoutMinutes: firstLevel.timeoutMinutes },
      'Escalation started'
    );
  }

  // Process an escalation (called by worker)
  async processEscalation(
    incidentId: string,
    toLevel: number,
    repeatNumber: number
  ): Promise<void> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        escalationPolicy: {
          include: { levels: { orderBy: { levelNumber: 'asc' } } }
        }
      }
    });

    // CRITICAL: Check incident is still open
    if (!incident || incident.status !== 'OPEN') {
      logger.info(
        { incidentId, status: incident?.status },
        'Escalation skipped - incident no longer open'
      );
      return;
    }

    // Check if already at higher level (stale job)
    if (incident.currentLevel >= toLevel && incident.currentRepeat >= repeatNumber) {
      logger.info(
        { incidentId, currentLevel: incident.currentLevel, toLevel },
        'Escalation skipped - already at higher level'
      );
      return;
    }

    const policy = incident.escalationPolicy!;
    const nextLevel = policy.levels.find(l => l.levelNumber === toLevel);

    // Check if we need to repeat or we're done
    if (!nextLevel) {
      // No more levels - check if we should repeat
      if (repeatNumber < policy.repeatCount) {
        // Repeat from level 1
        logger.info(
          { incidentId, repeatNumber, repeatCount: policy.repeatCount },
          'Restarting escalation policy from level 1'
        );
        await this.escalateToLevel(incident, policy.levels[0], repeatNumber + 1);
        return;
      }

      // Policy exhausted - log and stop
      logger.warn(
        { incidentId, repeatCount: policy.repeatCount },
        'Escalation policy exhausted - no more levels or repeats'
      );

      await auditService.log({
        action: 'incident.escalation.exhausted',
        teamId: incident.teamId,
        resourceType: 'incident',
        resourceId: incidentId,
        severity: 'HIGH',
        metadata: { repeatCount: policy.repeatCount, levelCount: policy.levels.length }
      });

      return;
    }

    // Escalate to next level
    await this.escalateToLevel(incident, nextLevel, repeatNumber);
  }

  private async escalateToLevel(
    incident: any,
    level: any,
    repeatNumber: number
  ): Promise<void> {
    // Resolve target user for this level
    const newAssignee = await routingService.resolveEscalationTarget(
      level,
      incident.teamId
    );

    // Update incident
    await prisma.incident.update({
      where: { id: incident.id },
      data: {
        currentLevel: level.levelNumber,
        currentRepeat: repeatNumber,
        assignedUserId: newAssignee,
        lastEscalatedAt: new Date()
      }
    });

    // Audit log
    await auditService.log({
      action: 'incident.escalated',
      teamId: incident.teamId,
      resourceType: 'incident',
      resourceId: incident.id,
      severity: 'HIGH',
      metadata: {
        toLevel: level.levelNumber,
        repeatNumber,
        targetType: level.targetType,
        newAssignee
      }
    });

    // Notify new assignee
    if (newAssignee) {
      try {
        await dispatchNotification(
          incident.id,
          newAssignee,
          'escalation',
          { escalationLevel: level.levelNumber }
        );
      } catch (notificationError) {
        // Log but don't fail escalation - notification is best-effort
        logger.error(
          { error: notificationError, incidentId: incident.id, userId: newAssignee, escalationLevel: level.levelNumber },
          'Failed to dispatch escalation notification'
        );
      }
    }

    logger.info(
      { incidentId: incident.id, level: level.levelNumber, repeatNumber, newAssignee },
      'Incident escalated'
    );

    // Schedule next escalation
    const policy = incident.escalationPolicy;
    const nextLevelNumber = level.levelNumber + 1;
    const nextLevel = policy.levels.find((l: any) => l.levelNumber === nextLevelNumber);

    if (nextLevel) {
      // Schedule escalation to next level
      const bullJobId = await scheduleEscalation(
        incident.id,
        level.levelNumber,
        repeatNumber,
        nextLevel.timeoutMinutes
      );

      await prisma.escalationJob.create({
        data: {
          incidentId: incident.id,
          bullJobId,
          scheduledLevel: nextLevelNumber,
          scheduledFor: new Date(Date.now() + nextLevel.timeoutMinutes * 60 * 1000)
        }
      });
    } else if (repeatNumber < policy.repeatCount) {
      // No more levels, but can repeat - schedule repeat
      const firstLevel = policy.levels[0];
      const bullJobId = await scheduleEscalation(
        incident.id,
        level.levelNumber,
        repeatNumber,
        firstLevel.timeoutMinutes
      );

      await prisma.escalationJob.create({
        data: {
          incidentId: incident.id,
          bullJobId,
          scheduledLevel: 1,
          scheduledFor: new Date(Date.now() + firstLevel.timeoutMinutes * 60 * 1000)
        }
      });
    }
    // else: policy exhausted, don't schedule more
  }

  // Reconcile stale escalations on server startup
  async reconcileStaleEscalations(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const staleIncidents = await prisma.incident.findMany({
      where: {
        status: 'OPEN',
        lastEscalatedAt: { lt: oneHourAgo },
        escalationJobs: {
          none: { completed: false }
        }
      },
      include: {
        escalationPolicy: {
          include: { levels: { orderBy: { levelNumber: 'asc' } } }
        }
      }
    });

    let rescheduled = 0;

    for (const incident of staleIncidents) {
      if (!incident.escalationPolicy) continue;

      const nextLevelNumber = incident.currentLevel + 1;
      const nextLevel = incident.escalationPolicy.levels.find(
        l => l.levelNumber === nextLevelNumber
      );

      if (nextLevel || incident.currentRepeat < incident.escalationPolicy.repeatCount) {
        // Reschedule immediately (0 timeout - overdue)
        const bullJobId = await scheduleEscalation(
          incident.id,
          incident.currentLevel,
          incident.currentRepeat,
          0 // Immediate
        );

        await prisma.escalationJob.create({
          data: {
            incidentId: incident.id,
            bullJobId,
            scheduledLevel: nextLevel?.levelNumber || 1,
            scheduledFor: new Date()
          }
        });

        logger.warn(
          { incidentId: incident.id, currentLevel: incident.currentLevel },
          'Rescheduled stale escalation'
        );

        rescheduled++;
      }
    }

    if (rescheduled > 0) {
      logger.info({ rescheduled }, 'Reconciled stale escalations on startup');
    }

    return rescheduled;
  }
}

export const escalationService = new EscalationService();
