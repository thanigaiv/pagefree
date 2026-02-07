import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket, connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

export type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export function useWebSocket() {
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    // Connect on mount
    setConnectionState('connecting');
    connectSocket();

    // Connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnectionState('connected');
      setReconnectAttempt(0);

      // Subscribe to all incidents
      socket.emit('subscribe:incidents', {});
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionState('disconnected');

      if (reason === 'io server disconnect') {
        // Server kicked us, try to reconnect
        socket.connect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionState('error');
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionState('connecting');
      setReconnectAttempt(attempt);
    });

    socket.io.on('reconnect', () => {
      toast.success('Connection restored');
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionState('error');
      toast.error('Connection failed. Please refresh the page.');
    });

    // Incident event handlers - update TanStack Query cache
    socket.on('incident:created', (incident) => {
      // Invalidate list to refetch with new incident
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.info(`New incident: ${incident.title || incident.fingerprint}`);
    });

    socket.on('incident:acknowledged', (data) => {
      // Update specific incident in cache
      queryClient.invalidateQueries({ queryKey: ['incidents', data.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });

      // Show toast for multi-user awareness (per user decision)
      toast.success(
        `${data.user.firstName} ${data.user.lastName} acknowledged incident`
      );
    });

    socket.on('incident:resolved', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents', data.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });

      toast.success(
        `${data.user.firstName} ${data.user.lastName} resolved incident`
      );
    });

    socket.on('incident:reassigned', (data) => {
      queryClient.invalidateQueries({ queryKey: ['incidents', data.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });

      toast.info(
        `Incident reassigned to ${data.toUser.firstName} ${data.toUser.lastName}`
      );
    });

    socket.on('incident:note_added', (data) => {
      queryClient.invalidateQueries({
        queryKey: ['incidents', data.incidentId, 'timeline'],
      });

      toast.info(`${data.note.user.firstName} added a note`);
    });

    socket.on('incident:updated', (incident) => {
      queryClient.invalidateQueries({ queryKey: ['incidents', incident.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    });

    // Cleanup
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('incident:created');
      socket.off('incident:acknowledged');
      socket.off('incident:resolved');
      socket.off('incident:reassigned');
      socket.off('incident:note_added');
      socket.off('incident:updated');
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect');
      socket.io.off('reconnect_failed');
      socket.disconnect();
    };
  }, [queryClient]);

  return { connectionState, reconnectAttempt };
}
