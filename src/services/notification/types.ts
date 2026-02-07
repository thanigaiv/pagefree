// Channel delivery result from provider
export interface ChannelDeliveryResult {
  success: boolean;
  providerId?: string;  // External message ID from provider
  error?: string;
  deliveredAt?: Date;
  estimatedDelivery?: Date;  // For async channels
}

// Notification payload sent to channels
export interface NotificationPayload {
  incidentId: string;
  userId: string;
  title: string;
  body: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  service: string;
  teamName: string;
  alertCount: number;
  escalationLevel?: number;
  dashboardUrl: string;
  triggeredAt: Date;
}

// Actions available for interactive notifications
export interface NotificationAction {
  id: string;
  label: string;
  style?: 'primary' | 'danger' | 'default';
}

// Channel interface - all channels implement this
export interface NotificationChannel {
  name: string;
  send(payload: NotificationPayload): Promise<ChannelDeliveryResult>;
  supportsInteractivity(): boolean;
  getProviderStatus?(): Promise<{ healthy: boolean; latencyMs?: number }>;
}

// Delivery status enum matching database
export type DeliveryStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

// Channel escalation configuration (per user decision)
export interface ChannelEscalationConfig {
  primary: string[];      // Try in parallel (push, email, slack)
  secondary: string[];    // Try if primary fails (sms)
  fallback: string[];     // Last resort (voice)
}

export const DEFAULT_CHANNEL_ESCALATION: ChannelEscalationConfig = {
  primary: ['email', 'slack', 'push'],
  secondary: ['sms'],
  fallback: ['voice']
};
