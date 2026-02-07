import { useState, useEffect, useRef, useCallback } from 'react';
import {
  initPWAInstallCapture,
  canInstallPWA,
  promptPWAInstall,
  isInstalledPWA,
  isOffline,
  onOnlineStatusChange,
} from '@/lib/pwa';
import { toast } from 'sonner';

interface UsePWAReturn {
  canInstall: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  showInstallPrompt: () => Promise<boolean>;
  promptAfterAcknowledge: () => void;
}

export function usePWA(): UsePWAReturn {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(!isOffline());
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    // Initialize install capture
    initPWAInstallCapture();

    // Check initial state
    setIsInstalled(isInstalledPWA());

    // Listen for install prompt availability
    const checkInstall = () => setCanInstall(canInstallPWA());

    // Check periodically (beforeinstallprompt is async)
    const interval = setInterval(checkInstall, 1000);
    setTimeout(() => clearInterval(interval), 10000); // Stop after 10s

    // Listen for online/offline
    const unsubscribe = onOnlineStatusChange((online) => {
      setIsOnline(online);
      if (!online) {
        toast.warning('You are offline. Viewing cached data.');
      } else {
        toast.success('Back online');
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const showInstallPrompt = useCallback(async () => {
    const installed = await promptPWAInstall();
    if (installed) {
      setIsInstalled(true);
      setCanInstall(false);
      toast.success('App installed! Access from your home screen.');
    }
    return installed;
  }, []);

  // Per user decision: prompt after first acknowledgment
  const promptAfterAcknowledge = useCallback(() => {
    if (hasPromptedRef.current || !canInstall || isInstalled) {
      return;
    }

    hasPromptedRef.current = true;

    // Delay slightly so user sees acknowledgment success first
    setTimeout(() => {
      showInstallPrompt();
    }, 1500);
  }, [canInstall, isInstalled, showInstallPrompt]);

  return {
    canInstall,
    isInstalled,
    isOnline,
    showInstallPrompt,
    promptAfterAcknowledge,
  };
}
