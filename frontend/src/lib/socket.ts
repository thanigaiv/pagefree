import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types/socket';

// Socket.io client singleton
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL || 'http://localhost:3000',
  {
    autoConnect: false, // Connect manually after auth check
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    withCredentials: true, // Send cookies with WebSocket handshake
  }
);

// Session expiration callback - can be set by the app
let onSessionExpired: (() => void) | null = null;

/**
 * Set callback for session expiration
 * Typically used to redirect to login page
 */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

/**
 * Handle session expiration - notify app and disconnect
 */
function handleSessionExpired() {
  console.warn('Session expired - disconnecting socket');
  socket.disconnect();

  if (onSessionExpired) {
    onSessionExpired();
  }
}

// Set up event handlers
socket.on('session_expired', handleSessionExpired);

socket.on('auth_error', (message) => {
  console.error('Socket auth error:', message);
  socket.disconnect();

  // If auth failed due to session, treat as session expired
  if (message.includes('expired') || message.includes('Authentication')) {
    if (onSessionExpired) {
      onSessionExpired();
    }
  }
});

socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message);

  // If error indicates auth issue, redirect to login
  if (
    error.message.includes('Authentication') ||
    error.message.includes('expired') ||
    error.message.includes('Invalid session')
  ) {
    socket.disconnect();
    if (onSessionExpired) {
      onSessionExpired();
    }
  }
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}
