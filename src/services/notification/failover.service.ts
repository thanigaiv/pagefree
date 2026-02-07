import twilio from 'twilio';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { ChannelDeliveryResult } from './types.js';

// Provider status tracking
interface ProviderStatus {
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenUntil?: Date;
}

// Circuit breaker configuration
const CIRCUIT_CONFIG = {
  failureThreshold: 3,       // Open circuit after 3 consecutive failures
  resetTimeoutMs: 60000,     // Try primary again after 1 minute
  healthCheckIntervalMs: 30000  // Check health every 30 seconds
};

class FailoverService {
  private twilioClient: ReturnType<typeof twilio>;
  private snsClient: SNSClient;

  // Provider health status
  private providerStatus: {
    twilio: ProviderStatus;
    sns: ProviderStatus;
  };

  constructor() {
    this.twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

    const snsConfig: any = { region: env.AWS_REGION };
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      snsConfig.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      };
    }
    this.snsClient = new SNSClient(snsConfig);

    // Initialize provider status
    this.providerStatus = {
      twilio: { healthy: true, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false },
      sns: { healthy: true, lastCheck: new Date(), consecutiveFailures: 0, circuitOpen: false }
    };

    // Start background health checks
    this.startHealthChecks();
  }

  // Send SMS with automatic failover (per user decision: Twilio primary, AWS SNS fallback)
  async sendSMSWithFailover(to: string, body: string): Promise<ChannelDeliveryResult> {
    // Try Twilio first (if circuit not open)
    if (!this.isCircuitOpen('twilio')) {
      try {
        const result = await this.sendViaTwilio(to, body);
        if (result.success) {
          this.recordSuccess('twilio');
          return result;
        }
      } catch (error) {
        this.recordFailure('twilio', error);
        logger.warn({ error, provider: 'twilio' }, 'Twilio SMS failed, trying SNS failover');
      }
    } else {
      logger.info('Twilio circuit open, using SNS failover');
    }

    // Failover to AWS SNS
    if (!this.isCircuitOpen('sns')) {
      try {
        const result = await this.sendViaSNS(to, body);
        if (result.success) {
          this.recordSuccess('sns');
          return { ...result, providerId: `sns:${result.providerId}` };
        }
      } catch (error) {
        this.recordFailure('sns', error);
        logger.error({ error, provider: 'sns' }, 'SNS SMS failover also failed');
        // Both providers failed, will return error below
      }
    }

    // Both providers failed
    return {
      success: false,
      error: 'All SMS providers failed (Twilio and AWS SNS)'
    };
  }

  // Send via Twilio
  private async sendViaTwilio(to: string, body: string): Promise<ChannelDeliveryResult> {
    const messageOptions: any = {
      from: env.TWILIO_PHONE_NUMBER,
      to,
      body
    };

    // Add status callback if API base URL is configured
    if (env.API_BASE_URL) {
      messageOptions.statusCallback = `${env.API_BASE_URL}/webhooks/twilio/sms/status`;
    }

    const message = await this.twilioClient.messages.create(messageOptions);

    return {
      success: true,
      providerId: message.sid,
      deliveredAt: new Date()
    };
  }

  // Send via AWS SNS
  private async sendViaSNS(to: string, body: string): Promise<ChannelDeliveryResult> {
    // SNS requires E.164 format
    const e164Phone = to.startsWith('+') ? to : `+${to}`;

    const result = await this.snsClient.send(new PublishCommand({
      PhoneNumber: e164Phone,
      Message: body,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'  // High deliverability
        },
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: env.AWS_SNS_SMS_SENDER_ID
        }
      }
    }));

    return {
      success: true,
      providerId: result.MessageId,
      deliveredAt: new Date()
    };
  }

  // Check if circuit breaker is open for provider
  private isCircuitOpen(provider: 'twilio' | 'sns'): boolean {
    const status = this.providerStatus[provider];

    if (!status.circuitOpen) {
      return false;
    }

    // Check if reset timeout has passed
    if (status.circuitOpenUntil && new Date() > status.circuitOpenUntil) {
      // Half-open: allow one request to test
      logger.info({ provider }, 'Circuit breaker half-open, testing provider');
      return false;
    }

    return true;
  }

  // Record successful request
  private recordSuccess(provider: 'twilio' | 'sns'): void {
    const status = this.providerStatus[provider];
    status.healthy = true;
    status.consecutiveFailures = 0;
    status.circuitOpen = false;
    status.circuitOpenUntil = undefined;
  }

  // Record failed request
  private recordFailure(provider: 'twilio' | 'sns', _error: unknown): void {
    const status = this.providerStatus[provider];
    status.consecutiveFailures++;

    if (status.consecutiveFailures >= CIRCUIT_CONFIG.failureThreshold) {
      status.circuitOpen = true;
      status.circuitOpenUntil = new Date(Date.now() + CIRCUIT_CONFIG.resetTimeoutMs);
      status.healthy = false;

      logger.warn(
        { provider, failures: status.consecutiveFailures, resetAt: status.circuitOpenUntil },
        'Circuit breaker opened due to consecutive failures'
      );
    }
  }

  // Background health checks
  private startHealthChecks(): void {
    setInterval(async () => {
      await this.checkTwilioHealth();
      await this.checkSNSHealth();
    }, CIRCUIT_CONFIG.healthCheckIntervalMs);
  }

  private async checkTwilioHealth(): Promise<void> {
    try {
      // Simple API call to check connectivity
      if (env.TWILIO_ACCOUNT_SID) {
        await this.twilioClient.api.accounts(env.TWILIO_ACCOUNT_SID).fetch();
      }
      this.providerStatus.twilio.healthy = true;
      this.providerStatus.twilio.lastCheck = new Date();
    } catch (error) {
      logger.warn({ error }, 'Twilio health check failed');
      this.providerStatus.twilio.healthy = false;
    }
  }

  private async checkSNSHealth(): Promise<void> {
    // SNS doesn't have a simple ping endpoint, so we just check client config
    // A failed send will trigger circuit breaker
    this.providerStatus.sns.lastCheck = new Date();
  }

  // Get current provider status (for monitoring)
  getProviderStatus(): typeof this.providerStatus {
    return this.providerStatus;
  }
}

// Singleton instance
export const failoverService = new FailoverService();

// Convenience functions
export const sendSMSWithFailover = failoverService.sendSMSWithFailover.bind(failoverService);
