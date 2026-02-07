import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define environment variable schema with Zod
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Okta Configuration
  OKTA_DOMAIN: z.string().url(),
  OKTA_CLIENT_ID: z.string().min(1),
  OKTA_CLIENT_SECRET: z.string().min(1),
  OKTA_ISSUER: z.string().url(),

  // SCIM Configuration
  SCIM_BEARER_TOKEN: z.string().min(32, 'SCIM token must be at least 32 characters'),

  // Okta Webhooks
  OKTA_WEBHOOK_SECRET: z.string().min(32, 'Webhook secret must be at least 32 characters'),

  // Application Secrets
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),

  // AWS SES for email
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SES_FROM_EMAIL: z.string().email().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Twilio for SMS and Voice
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // AWS SNS for Push Notifications
  SNS_PLATFORM_APP_ARN_IOS: z.string().optional(),
  SNS_PLATFORM_APP_ARN_ANDROID: z.string().optional(),

  // API Base URL (for webhook callbacks)
  API_BASE_URL: z.string().url().optional(),

  // Calendar Integration (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),

  // Microsoft Teams (optional)
  TEAMS_APP_ID: z.string().optional(),
  TEAMS_APP_SECRET: z.string().optional(),
  TEAMS_TENANT_ID: z.string().optional(),

  // Slack (optional)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  FRONTEND_URL: z.string().url().optional(),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

// Export validated environment variables
export const env = parseEnv();

// Export types for TypeScript
export type Environment = z.infer<typeof envSchema>;

// Calendar integration helpers
export const isGoogleCalendarConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const isMicrosoftCalendarConfigured = () =>
  Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID);
