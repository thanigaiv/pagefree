import { Server, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { unsign } from 'cookie-signature';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { auditService } from '../services/audit.service.js';

export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: TypedIO | null = null;

// Session check interval in ms (5 minutes)
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000;
// Session refresh threshold (5 minutes before expiry)
const SESSION_REFRESH_THRESHOLD = 5 * 60 * 1000;

interface SessionData {
  sid: string;
  sess: {
    passport?: {
      user?: string;
    };
    cookie?: {
      expires?: string;
      maxAge?: number;
    };
  };
  expire: Date;
}

/**
 * Parse and verify session ID from signed cookie
 * Format: s%3A{actualId}.{signature}
 */
function parseSessionId(signedValue: string): string | null {
  try {
    // URL decode the value
    const decoded = decodeURIComponent(signedValue);

    // Remove 's:' prefix if present
    const withoutPrefix = decoded.startsWith('s:') ? decoded.slice(2) : decoded;

    // Verify signature using cookie-signature
    const sessionId = unsign(withoutPrefix, env.SESSION_SECRET);

    if (!sessionId) {
      return null;
    }

    return sessionId;
  } catch (error) {
    logger.debug({ error }, 'Failed to parse session ID');
    return null;
  }
}

/**
 * Extract session ID from handshake
 * Tries auth.sessionId first, then cookie header
 */
function extractSessionId(socket: Socket): string | null {
  // Try auth payload first
  const authSessionId = socket.handshake.auth?.sessionId;
  if (authSessionId) {
    return parseSessionId(authSessionId);
  }

  // Try cookie header
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    // Parse cookies
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    // Look for our session cookie (oncall.sid)
    const sessionCookie = cookies['oncall.sid'];
    if (sessionCookie) {
      return parseSessionId(sessionCookie);
    }
  }

  return null;
}

/**
 * Query session from PostgreSQL session store
 */
async function getSession(sessionId: string): Promise<SessionData | null> {
  try {
    const result = await prisma.$queryRaw<SessionData[]>`
      SELECT sid, sess, expire FROM "Session" WHERE sid = ${sessionId}
    `;

    if (result.length === 0) {
      return null;
    }

    return result[0];
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to query session');
    return null;
  }
}

/**
 * Validate session exists and is not expired
 */
function validateSession(session: SessionData): { valid: boolean; reason?: string; userId?: string } {
  // Check expiration
  if (new Date() > new Date(session.expire)) {
    return { valid: false, reason: 'Session expired' };
  }

  // Extract user ID from passport session data
  const userId = session.sess?.passport?.user;
  if (!userId) {
    return { valid: false, reason: 'No user in session' };
  }

  return { valid: true, userId };
}

/**
 * Refresh session expiration if close to expiry
 */
async function refreshSessionIfNeeded(sessionId: string, session: SessionData): Promise<void> {
  const expireTime = new Date(session.expire).getTime();
  const now = Date.now();

  // If within 5 minutes of expiry, extend the session
  if (expireTime - now < SESSION_REFRESH_THRESHOLD) {
    const newExpire = new Date(now + 24 * 60 * 60 * 1000); // Extend by 24 hours

    try {
      await prisma.$executeRaw`
        UPDATE "Session" SET expire = ${newExpire} WHERE sid = ${sessionId}
      `;
      logger.debug({ sessionId }, 'Session refreshed');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to refresh session');
    }
  }
}

/**
 * Set up periodic session validation for active socket
 */
function setupSessionMonitor(socket: TypedSocket, sessionId: string): NodeJS.Timeout {
  const interval = setInterval(async () => {
    const session = await getSession(sessionId);

    if (!session) {
      logger.info({ socketId: socket.id, sessionId }, 'Session no longer exists, disconnecting');
      socket.emit('session_expired');
      socket.disconnect(true);
      return;
    }

    const validation = validateSession(session);

    if (!validation.valid) {
      logger.info({ socketId: socket.id, sessionId, reason: validation.reason }, 'Session invalid, disconnecting');
      socket.emit('session_expired');
      socket.disconnect(true);
      return;
    }

    // Refresh session if close to expiry
    await refreshSessionIfNeeded(sessionId, session);
  }, SESSION_CHECK_INTERVAL);

  return interval;
}

/**
 * Get client IP from socket handshake
 */
function getClientIP(socket: Socket): string | undefined {
  return socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0].trim()
    || socket.handshake.address;
}

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
    const clientIP = getClientIP(socket);
    const userAgent = socket.handshake.headers['user-agent'];

    try {
      // Extract session ID from handshake
      const sessionId = extractSessionId(socket);

      if (!sessionId) {
        // Log auth failure
        await auditService.log({
          action: 'socket.auth_failed',
          metadata: {
            reason: 'No session ID provided',
            socketId: socket.id
          },
          severity: 'WARN',
          ipAddress: clientIP,
          userAgent,
        });
        return next(new Error('Authentication required'));
      }

      // Query session from PostgreSQL
      const session = await getSession(sessionId);

      if (!session) {
        // Log auth failure
        await auditService.log({
          action: 'socket.auth_failed',
          metadata: {
            reason: 'Session not found',
            socketId: socket.id
          },
          severity: 'WARN',
          ipAddress: clientIP,
          userAgent,
        });
        return next(new Error('Session expired'));
      }

      // Validate session
      const validation = validateSession(session);

      if (!validation.valid) {
        // Log auth failure
        await auditService.log({
          action: 'socket.auth_failed',
          metadata: {
            reason: validation.reason,
            socketId: socket.id
          },
          severity: 'WARN',
          ipAddress: clientIP,
          userAgent,
        });
        return next(new Error(validation.reason === 'Session expired' ? 'Session expired' : 'Invalid session'));
      }

      // Attach validated user to socket
      (socket as any).userId = validation.userId;
      (socket as any).sessionId = sessionId;
      (socket as any).authenticated = true;

      // Log successful auth
      await auditService.log({
        action: 'socket.authenticated',
        userId: validation.userId,
        metadata: {
          socketId: socket.id
        },
        severity: 'INFO',
        ipAddress: clientIP,
        userAgent,
      });

      next();
    } catch (error) {
      logger.error({ error }, 'Socket authentication failed');

      // Log auth error
      await auditService.log({
        action: 'socket.auth_failed',
        metadata: {
          reason: 'Internal error',
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id
        },
        severity: 'HIGH',
        ipAddress: clientIP,
        userAgent,
      });

      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    const userId = (socket as any).userId;
    const sessionId = (socket as any).sessionId;
    logger.info({ socketId: socket.id, userId }, 'Client connected');

    // Set up periodic session validation
    const sessionMonitor = setupSessionMonitor(socket, sessionId);

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

    // Socket-level error handler
    socket.on('error', (error) => {
      logger.error({ socketId: socket.id, error: error.message }, 'Socket error');
    });

    socket.on('disconnect', (reason) => {
      // Clear session monitor
      clearInterval(sessionMonitor);

      logger.info({
        socketId: socket.id,
        userId,
        sessionId,
        reason
      }, 'Client disconnected');
    });
  });

  logger.info('Socket.io server initialized with session validation');
  return io;
}

export function getIO(): TypedIO {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

export { io };
