import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Fingerprint, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

export function BiometricSettings() {
  const {
    isSupported,
    isAvailable,
    isRegistered,
    isLoading,
    register,
  } = useBiometricAuth();

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-5 w-5" />
        <span>Biometric authentication is not supported on this device</span>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-5 w-5" />
        <div>
          <p>No biometric authenticator found</p>
          <p className="text-sm">
            Set up Face ID, Touch ID, or Windows Hello to use this feature
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isRegistered ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <Fingerprint className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <Label className="text-base font-medium">
            Biometric Unlock
          </Label>
          <p className="text-sm text-muted-foreground">
            {isRegistered
              ? 'Use Face ID, Touch ID, or fingerprint to unlock'
              : 'Quick access with biometric authentication'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isRegistered ? (
        <Switch checked disabled />
      ) : (
        <Button size="sm" onClick={register}>
          Enable
        </Button>
      )}
    </div>
  );
}
