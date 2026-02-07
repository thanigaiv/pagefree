/**
 * Webhook action executor for workflow automation
 *
 * Supports HTTP POST/PUT/PATCH with multiple authentication methods:
 * - Bearer token
 * - Basic auth (username/password)
 * - OAuth 2.0 client credentials flow
 * - Custom headers
 */

import { interpolateTemplate, type TemplateContext } from '../workflow/template.service.js';
import { logger } from '../../config/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Webhook authentication configuration
 */
export interface WebhookAuth {
  type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
  token?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Webhook action configuration
 */
export interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body: string;
  auth: WebhookAuth;
}

/**
 * Result of webhook execution
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration: number;
}

// ============================================================================
// OAuth2 Token Cache
// ============================================================================

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Simple in-memory cache for OAuth2 tokens (1 minute TTL)
const tokenCache = new Map<string, CachedToken>();
const TOKEN_CACHE_TTL_MS = 60_000;

/**
 * Get OAuth2 access token using client credentials flow.
 * Caches token briefly to avoid repeated requests.
 */
async function getOAuth2Token(auth: WebhookAuth): Promise<string> {
  if (!auth.tokenUrl || !auth.clientId || !auth.clientSecret) {
    throw new Error('OAuth2 requires tokenUrl, clientId, and clientSecret');
  }

  const cacheKey = `${auth.tokenUrl}:${auth.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // Request new token
  const response = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      client_secret: auth.clientSecret
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OAuth token request failed: ${response.status} - ${errorBody}`);
  }

  const data = await response.json() as { access_token: string; expires_in?: number };
  const token = data.access_token;

  // Cache token (use expires_in if available, otherwise default TTL)
  const expiresIn = data.expires_in ? data.expires_in * 1000 : TOKEN_CACHE_TTL_MS;
  const expiresAt = Date.now() + Math.min(expiresIn - 5000, TOKEN_CACHE_TTL_MS); // 5s buffer

  tokenCache.set(cacheKey, { token, expiresAt });

  return token;
}

/**
 * Add authentication headers based on auth configuration.
 */
async function addAuthHeaders(
  headers: Record<string, string>,
  auth: WebhookAuth
): Promise<void> {
  switch (auth.type) {
    case 'bearer':
      if (!auth.token) {
        throw new Error('Bearer auth requires token');
      }
      headers['Authorization'] = `Bearer ${auth.token}`;
      break;

    case 'basic':
      if (!auth.username || !auth.password) {
        throw new Error('Basic auth requires username and password');
      }
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      break;

    case 'oauth2':
      const token = await getOAuth2Token(auth);
      headers['Authorization'] = `Bearer ${token}`;
      break;

    case 'custom':
      if (auth.customHeaders) {
        Object.assign(headers, auth.customHeaders);
      }
      break;

    case 'none':
      // No auth headers needed
      break;
  }
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute a webhook action with template interpolation.
 *
 * @param config - Webhook configuration with URL, method, headers, body, auth
 * @param context - Template context for variable interpolation
 * @param timeout - Request timeout in milliseconds (default: 30 seconds)
 * @returns Result with success status, HTTP response details, and duration
 *
 * @example
 * const result = await executeWebhook(
 *   {
 *     url: "https://api.example.com/incidents/{{incident.id}}",
 *     method: "POST",
 *     headers: { "X-Team": "{{team.name}}" },
 *     body: '{"title": "{{incident.title}}"}',
 *     auth: { type: "bearer", token: "secret" }
 *   },
 *   context
 * );
 */
export async function executeWebhook(
  config: WebhookConfig,
  context: TemplateContext,
  timeout: number = 30_000
): Promise<WebhookResult> {
  const startTime = Date.now();

  try {
    // Interpolate templates in URL, body, and headers
    const url = interpolateTemplate(config.url, context);
    const body = interpolateTemplate(config.body, context);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Interpolate header values
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = interpolateTemplate(value, context);
    }

    // Add authentication headers
    await addAuthHeaders(headers, config.auth);

    // Execute request with AbortController timeout (per research pitfall #4)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method: config.method,
        headers,
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const responseBody = await response.text();
    const duration = Date.now() - startTime;

    logger.info(
      {
        url,
        method: config.method,
        statusCode: response.status,
        duration
      },
      'Webhook executed'
    );

    return {
      success: response.ok,
      statusCode: response.status,
      // Truncate response body for storage (per research recommendation)
      responseBody: responseBody.substring(0, 1000),
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it was a timeout
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const finalError = isTimeout ? `Request timeout after ${timeout}ms` : errorMessage;

    logger.error(
      {
        url: config.url,
        method: config.method,
        error: finalError,
        duration
      },
      'Webhook execution failed'
    );

    return {
      success: false,
      error: finalError,
      duration
    };
  }
}

/**
 * Retry wrapper for webhook execution with exponential backoff.
 *
 * @param config - Webhook configuration
 * @param context - Template context
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay between retries in ms (default: 1000)
 * @returns Final result after all attempts
 */
export async function executeWebhookWithRetry(
  config: WebhookConfig,
  context: TemplateContext,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<WebhookResult> {
  let lastResult: WebhookResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await executeWebhook(config, context);

    if (lastResult.success) {
      return lastResult;
    }

    // Check if error is retryable (5xx, timeout, network errors)
    const isRetryable =
      !lastResult.statusCode ||
      lastResult.statusCode >= 500 ||
      lastResult.error?.includes('timeout');

    if (!isRetryable || attempt === maxAttempts) {
      break;
    }

    // Exponential backoff: 1s, 2s, 4s, etc.
    const delay = initialDelayMs * Math.pow(2, attempt - 1);
    logger.info(
      {
        attempt,
        maxAttempts,
        delay,
        url: config.url
      },
      'Retrying webhook after failure'
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return lastResult!;
}
