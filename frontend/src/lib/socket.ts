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
    auth: (cb) => {
      // Send session cookie for auth
      // In production, could also send JWT token
      cb({ token: 'session' });
    },
    withCredentials: true,
  }
);

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
