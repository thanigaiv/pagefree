import { getIO } from '../lib/socket.js';
import type {
  IncidentBroadcast,
  IncidentAckData,
  IncidentResolveData,
  IncidentReassignData,
  IncidentNoteData,
  StatusChangeData,
  ServerToClientEvents,
} from '../types/socket.js';
import { logger } from '../config/logger.js';

class SocketService {
  // Broadcast new incident created
  broadcastIncidentCreated(incident: IncidentBroadcast): void {
    try {
      const io = getIO();

      // Broadcast to team room and all-incidents room
      io.to(`team:${incident.teamId}`).emit('incident:created', incident);
      io.to('incidents:all').emit('incident:created', incident);

      logger.debug(
        { incidentId: incident.id, teamId: incident.teamId },
        'Broadcasted incident:created'
      );
    } catch (error) {
      // Socket not initialized - log but don't fail
      logger.warn({ error }, 'Failed to broadcast incident:created');
    }
  }

  // Broadcast incident updated (general update)
  broadcastIncidentUpdated(incident: IncidentBroadcast): void {
    try {
      const io = getIO();
      io.to(`team:${incident.teamId}`).emit('incident:updated', incident);
      io.to('incidents:all').emit('incident:updated', incident);
    } catch (error) {
      logger.warn({ error }, 'Failed to broadcast incident:updated');
    }
  }

  // Broadcast incident acknowledged
  broadcastIncidentAcknowledged(data: IncidentAckData, teamId: string): void {
    try {
      const io = getIO();
      io.to(`team:${teamId}`).emit('incident:acknowledged', data);
      io.to('incidents:all').emit('incident:acknowledged', data);

      logger.debug(
        { incidentId: data.incidentId, userId: data.userId },
        'Broadcasted incident:acknowledged'
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to broadcast incident:acknowledged');
    }
  }

  // Broadcast incident resolved
  broadcastIncidentResolved(data: IncidentResolveData, teamId: string): void {
    try {
      const io = getIO();
      io.to(`team:${teamId}`).emit('incident:resolved', data);
      io.to('incidents:all').emit('incident:resolved', data);
    } catch (error) {
      logger.warn({ error }, 'Failed to broadcast incident:resolved');
    }
  }

  // Broadcast incident reassigned
  broadcastIncidentReassigned(data: IncidentReassignData, teamId: string): void {
    try {
      const io = getIO();
      io.to(`team:${teamId}`).emit('incident:reassigned', data);
      io.to('incidents:all').emit('incident:reassigned', data);
    } catch (error) {
      logger.warn({ error }, 'Failed to broadcast incident:reassigned');
    }
  }

  // Broadcast note added
  broadcastNoteAdded(data: IncidentNoteData, teamId: string): void {
    try {
      const io = getIO();
      io.to(`team:${teamId}`).emit('incident:note_added', data);
      io.to('incidents:all').emit('incident:note_added', data);
    } catch (error) {
      logger.warn({ error }, 'Failed to broadcast incident:note_added');
    }
  }

  // Broadcast status change for status page components
  broadcastStatusChange(data: StatusChangeData): void {
    try {
      const io = getIO();
      io.emit('status:changed', data);

      logger.debug(
        { statusPageId: data.statusPageId, componentId: data.componentId },
        'Broadcasted status:changed'
      );
    } catch (error) {
      // Socket not initialized - log but don't fail
      logger.warn({ error }, 'Failed to broadcast status:changed');
    }
  }

  // Generic broadcast to all connected clients (for any valid server event)
  broadcast(event: keyof ServerToClientEvents, data: unknown): void {
    try {
      const io = getIO();
      // Type assertion needed because emit expects specific event data types
      (io as any).emit(event, data);

      logger.debug(
        { event },
        `Broadcasted ${event}`
      );
    } catch (error) {
      // Socket not initialized - log but don't fail
      logger.warn({ error, event }, `Failed to broadcast ${event}`);
    }
  }
}

export const socketService = new SocketService();
