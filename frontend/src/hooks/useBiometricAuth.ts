import { useState, useEffect, useCallback } from 'react';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  hasBiometricCredential,
} from '@/lib/webauthn';
import { toast } from 'sonner';

interface UseBiometricAuthReturn {
  isSupported: boolean;
  isAvailable: boolean;
  isRegistered: boolean;
  isLoading: boolean;
  register: () => Promise<boolean>;
  checkStatus: () => Promise<void>;
}

export function useBiometricAuth(): UseBiometricAuthReturn {
  const [isSupported] = useState(() => isWebAuthnSupported());
  const [isAvailable, setIsAvailable] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!isSupported) return;

    setIsLoading(true);
    try {
      const available = await isPlatformAuthenticatorAvailable();
      setIsAvailable(available);

      if (available) {
        const registered = await hasBiometricCredential();
        setIsRegistered(registered);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const register = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !isAvailable) {
      toast.error('Biometric authentication not available');
      return false;
    }

    setIsLoading(true);
    try {
      // Get current user info (would come from auth context in production)
      const userResponse = await fetch('/api/auth/me', { credentials: 'include' });
      if (!userResponse.ok) {
        toast.error('Please log in first');
        return false;
      }

      const { user } = await userResponse.json();

      const success = await registerBiometric(user.id, user.email);

      if (success) {
        setIsRegistered(true);
        toast.success('Biometric authentication enabled');
        return true;
      } else {
        toast.error('Failed to enable biometric authentication');
        return false;
      }
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isAvailable]);

  return {
    isSupported,
    isAvailable,
    isRegistered,
    isLoading,
    register,
    checkStatus,
  };
}
