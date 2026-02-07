import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff, Loader2, AlertTriangle } from 'lucide-react';

export function PushSettings() {
  const {
    isSupported,
    isSubscribed,
    permission,
    isLoading,
    toggle,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-5 w-5" />
        <span>Push notifications are not supported on this browser</span>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <BellOff className="h-5 w-5" />
        <div>
          <p>Push notifications are blocked</p>
          <p className="text-sm">
            Enable notifications in your browser settings to receive alerts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-green-500" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <Label htmlFor="push-toggle" className="text-base font-medium">
            Push Notifications
          </Label>
          <p className="text-sm text-muted-foreground">
            {isSubscribed
              ? 'You will receive alerts for new incidents'
              : 'Enable to receive alerts when offline'}
          </p>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Switch
          id="push-toggle"
          checked={isSubscribed}
          onCheckedChange={toggle}
        />
      )}
    </div>
  );
}
