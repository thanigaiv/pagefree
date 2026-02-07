// Minimal PWA hook stub for mobile gestures (Plan 06-08)
// Full implementation in Plan 06-07

import { useState, useCallback } from 'react';

interface UsePWAReturn {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  showInstallPrompt: () => Promise<boolean>;
  promptAfterAcknowledge: () => void;
}

export function usePWA(): UsePWAReturn {
  const [isOnline] = useState(true);

  const showInstallPrompt = useCallback(async () => {
    console.log('PWA install prompt - full implementation in Plan 06-07');
    return false;
  }, []);

  const promptAfterAcknowledge = useCallback(() => {
    console.log('PWA prompt after acknowledge - full implementation in Plan 06-07');
  }, []);

  return {
    canInstall: false,
    isInstalled: false,
    isOnline,
    showInstallPrompt,
    promptAfterAcknowledge,
  };
}
