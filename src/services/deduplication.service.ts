import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { routingService } from './routing.service.js';
import { socketService } from './socket.service.js';
import { logger } from '../config/logger.js';
import { onIncidentCreated } from './workflow/workflow-integration.js';

export interface DeduplicationResult {
  incident: any;
  isDuplicate: boolean;
}

class DeduplicationService {
  private readonly MAX_RETRIES = 3;

  /**
   * Deduplicate alert and create or update incident.
   * Uses Serializable isolation to prevent race conditions.
   *
   * @param alertId - Alert to process
   * @param fingerprint - Content fingerprint for deduplication
   * @param alert - Full alert object for routing
   * @param windowMinutes - Deduplication window (default 15 min)
   * @param integration - Optional integration for service routing fallback
   * @returns Incident and duplicate flag
   */
  async deduplicateAndCreateIncident(
    alertId: string,
    fingerprint: string,
    alert: any,
    windowMinutes: number = 15,
    integration?: { defaultServiceId?: string | null }
  ): Promise<DeduplicationResult> {
    // Retry loop for serialization failures
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.executeTransaction(alertId, fingerprint, alert, windowMinutes, integration);

        // Broadcast new incident creation via WebSocket (only for new incidents, not duplicates)
        if (!result.isDuplicate) {
          // Fetch full incident data with relations for broadcast
          const fullIncident = await prisma.incident.findUnique({
            where: { id: result.incident.id },
            include: {
              team: { select: { id: true, name: true } },
              assignedUser: { select: { id: true, firstName: true, lastName: true } },
              service: { select: { id: true, name: true, routingKey: true } }
            }
          });

          if (fullIncident) {
            socketService.broadcastIncidentCreated({
              id: fullIncident.id,
              fingerprint: fullIncident.fingerprint,
              status: fullIncident.status,
              priority: fullIncident.priority,
              title: alert.title || alert.description || fullIncident.fingerprint,
              teamId: fullIncident.teamId,
              team: fullIncident.team,
              assignedUserId: fullIncident.assignedUserId ?? undefined,
              assignedUser: fullIncident.assignedUser ?? undefined,
              serviceId: fullIncident.serviceId ?? undefined,
              service: fullIncident.service ?? undefined,
              createdAt: fullIncident.createdAt.toISOString(),
            });

            // Trigger workflows for incident creation (don't fail incident creation on workflow error)
            try {
              await onIncidentCreated({
                id: fullIncident.id,
                priority: fullIncident.priority,
                status: fullIncident.status,
                teamId: fullIncident.teamId,
                createdAt: fullIncident.createdAt,
                metadata: alert.metadata
              });
            } catch (workflowError) {
              logger.error(
                { error: workflowError, incidentId: fullIncident.id },
                'Failed to trigger workflows on incident creation'
              );
            }
          }
        }

        return result;
      } catch (error: any) {
        if (error.code === 'P2034' && attempt < this.MAX_RETRIES) {
          // Serialization failure, retry with exponential backoff
          const delay = Math.pow(2, attempt) * 100;
          logger.warn(
            { attempt, delay, fingerprint },
            'Serialization conflict, retrying...'
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Deduplication failed after max retries');
  }

  /**
   * Execute deduplication within Serializable transaction.
   */
  private async executeTransaction(
    alertId: string,
    fingerprint: string,
    alert: any,
    windowMinutes: number,
    integration?: { defaultServiceId?: string | null }
  ): Promise<DeduplicationResult> {
    return await prisma.$transaction(
      async (tx) => {
        const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

        // Check for existing incident with same fingerprint in window
        const existing = await tx.incident.findFirst({
          where: {
            fingerprint,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
            createdAt: { gte: windowStart }
          }
        });

        if (existing) {
          // Link alert to existing incident, increment count
          await tx.alert.update({
            where: { id: alertId },
            data: { incidentId: existing.id }
          });

          const updated = await tx.incident.update({
            where: { id: existing.id },
            data: { alertCount: { increment: 1 } }
          });

          logger.info(
            { incidentId: existing.id, alertId, alertCount: updated.alertCount },
            'Alert grouped to existing incident'
          );

          return { incident: updated, isDuplicate: true };
        }

        // Route to team and get on-call user (with integration for service fallback)
        const routing = await routingService.routeAlertToTeam(alert, integration);

        // Create new incident with serviceId if routed via service (ROUTE-03)
        const incident = await tx.incident.create({
          data: {
            fingerprint,
            status: 'OPEN',
            priority: alert.severity,
            teamId: routing.teamId,
            escalationPolicyId: routing.escalationPolicyId,
            assignedUserId: routing.assignedUserId,
            serviceId: routing.serviceId,
            currentLevel: 1,
            currentRepeat: 1,
            alertCount: 1
          }
        });

        // Link alert
        await tx.alert.update({
          where: { id: alertId },
          data: { incidentId: incident.id }
        });

        logger.info(
          { incidentId: incident.id, alertId, teamId: routing.teamId },
          'New incident created from alert'
        );

        return { incident, isDuplicate: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
}

export const deduplicationService = new DeduplicationService();
