import { getIO } from '../lib/socket.js';
import type {
  IncidentBroadcast,
  IncidentAckData,
  IncidentResolveData,
  IncidentReassignData,
  IncidentNoteData,
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
}

export const socketService = new SocketService();
