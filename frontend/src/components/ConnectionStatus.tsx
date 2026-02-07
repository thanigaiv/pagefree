import type { ConnectionState } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { WifiOff, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  state: ConnectionState;
  reconnectAttempt?: number;
}

export function ConnectionStatus({ state, reconnectAttempt }: ConnectionStatusProps) {
  // Don't show anything when connected (per discretion recommendation)
  if (state === 'connected') return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 py-2 px-4 text-sm text-center z-50',
        state === 'connecting' && 'bg-yellow-100 text-yellow-800',
        state === 'disconnected' && 'bg-yellow-100 text-yellow-800',
        state === 'error' && 'bg-red-100 text-red-800'
      )}
    >
      <div className="flex items-center justify-center gap-2">
        {state === 'connecting' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              Reconnecting...
              {reconnectAttempt ? ` (attempt ${reconnectAttempt})` : ''}
            </span>
          </>
        )}
        {state === 'disconnected' && (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Connection lost. Reconnecting...</span>
          </>
        )}
        {state === 'error' && (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Connection failed. Please refresh the page.</span>
          </>
        )}
      </div>
    </div>
  );
}
