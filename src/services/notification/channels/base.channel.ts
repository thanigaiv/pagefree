import type { NotificationChannel, NotificationPayload, ChannelDeliveryResult } from '../types.js';
import { logger } from '../../../config/logger.js';

export abstract class BaseChannel implements NotificationChannel {
  abstract name: string;
  abstract send(payload: NotificationPayload): Promise<ChannelDeliveryResult>;
  abstract supportsInteractivity(): boolean;

  // Common error handling wrapper
  protected async withErrorHandling(
    operation: () => Promise<ChannelDeliveryResult>,
    context: { incidentId: string; userId: string }
  ): Promise<ChannelDeliveryResult> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          channel: this.name,
          incidentId: context.incidentId,
          userId: context.userId,
          error: errorMessage
        },
        `${this.name} channel delivery failed`
      );
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Format timestamp for display
  protected formatTimestamp(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  // Truncate text to max length with ellipsis
  protected truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}
