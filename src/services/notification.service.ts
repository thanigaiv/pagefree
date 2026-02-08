import { SESClient, SendEmailCommand, SESClientConfig } from '@aws-sdk/client-ses';
import twilio from 'twilio';
import { env } from '../config/env.js';

export class NotificationService {
  private sesClient: SESClient;
  private twilioClient: any;

  constructor() {
    // Initialize AWS SES - use default credential chain if explicit creds not provided
    const sesConfig: SESClientConfig = {
      region: env.AWS_REGION
    };

    // Only add explicit credentials if both are provided
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      sesConfig.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      };
    }

    this.sesClient = new SESClient(sesConfig);

    // Initialize Twilio
    this.twilioClient = twilio(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN
    );
  }

  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      const command = new SendEmailCommand({
        Source: env.AWS_SES_FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: body },
            Html: { Data: body } // Send same content as HTML
          }
        }
      });

      await this.sesClient.send(command);
      return true;
    } catch (error) {
      console.error('Email send failed:', error);
      return false;
    }
  }

  async sendSMS(to: string, body: string): Promise<boolean> {
    try {
      await this.twilioClient.messages.create({
        from: env.TWILIO_PHONE_NUMBER,
        to,
        body
      });
      return true;
    } catch (error) {
      console.error('SMS send failed:', error);
      return false;
    }
  }

  // Format verification email
  buildVerificationEmail(code: string): { subject: string; body: string } {
    return {
      subject: 'PageFree - Email Verification Code',
      body: `
Your verification code is: ${code}

This code will expire in 15 minutes.

If you did not request this code, please ignore this email.

-- PageFree
      `.trim()
    };
  }

  // Format verification SMS
  buildVerificationSMS(code: string): string {
    return `PageFree verification code: ${code}. Expires in 15 minutes.`;
  }
}

export const notificationService = new NotificationService();
