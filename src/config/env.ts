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

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
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
