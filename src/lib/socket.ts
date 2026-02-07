import { Server, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket.js';
import { logger } from '../config/logger.js';

export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: TypedIO | null = null;

export function initializeSocket(httpServer: HttpServer): TypedIO {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true,
    },
    // Require auth token
    allowEIO3: false,
  });

  io.use(async (socket, next) => {
    try {
      // Extract token from auth callback
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // For now, validate session ID exists
      // In production, verify session from connect-pg-simple
      // Store user context on socket
      (socket as any).userId = token; // Simplified - actual impl would verify
      (socket as any).authenticated = true;

      next();
    } catch (error) {
      logger.error({ error }, 'Socket authentication failed');
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    const userId = (socket as any).userId;
    logger.info({ socketId: socket.id, userId }, 'Client connected');

    socket.emit('authenticated');

    // Handle subscription to incident updates
    socket.on('subscribe:incidents', (filters) => {
      const room = filters.teamId ? `team:${filters.teamId}` : 'incidents:all';
      socket.join(room);
      logger.debug({ socketId: socket.id, room }, 'Client subscribed to incidents');
    });

    socket.on('unsubscribe:incidents', () => {
      // Leave all incident rooms
      socket.rooms.forEach((room) => {
        if (room.startsWith('team:') || room === 'incidents:all') {
          socket.leave(room);
        }
      });
    });

    socket.on('ping', () => {
      // Heartbeat - no response needed
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Client disconnected');
    });
  });

  logger.info('Socket.io server initialized');
  return io;
}

export function getIO(): TypedIO {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

export { io };
