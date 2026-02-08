import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Get Redis client for rate limiting
const redisClient = getRedisClient();

// Redis-backed rate limiters for distributed rate limiting across server instances

/**
 * Webhook tier: 1000 req/min per IP
 * High volume to accommodate monitoring tools like Prometheus, Datadog, etc.
 * Key: IP address (webhooks don't have user auth)
 */
const webhookLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'ratelimit:webhook',
  points: 1000,
  duration: 60,
});

/**
 * API tier: 500 req/min per authenticated user
 * Standard rate for authenticated API access
 * Key: User ID for authenticated requests, IP for anonymous
 */
const apiLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'ratelimit:api',
  points: 500,
  duration: 60,
});

/**
 * Public tier: 100 req/min per IP
 * Conservative rate for unauthenticated public endpoints
 * Key: IP address
 */
const publicLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'ratelimit:public',
  points: 100,
  duration: 60,
});

// In-memory rate limiter for break-glass login (kept as emergency fallback)
// Using memory because:
// 1. Break-glass is emergency-only, low volume
// 2. Simpler than Redis/Postgres for this use case
// 3. If server restarts, rate limits reset (acceptable for emergency access)

const breakGlassLimiter = new RateLimiterMemory({
  keyPrefix: 'breakglass',
  points: 5,           // 5 attempts
  duration: 60 * 15,   // per 15 minutes
  blockDuration: 60 * 60 // Block for 1 hour after exceeding
});

// More strict limiter for failed attempts specifically
const failedLoginLimiter = new RateLimiterMemory({
  keyPrefix: 'failed_login',
  points: 3,           // 3 failed attempts
  duration: 60 * 5,    // per 5 minutes
  blockDuration: 60 * 30 // Block for 30 minutes
});

/**
 * Set standard rate limit headers on response
 */
function setRateLimitHeaders(res: Response, rateLimiterRes: RateLimiterRes, limit: number): void {
  res.set({
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + Math.ceil(rateLimiterRes.msBeforeNext / 1000))
  });
}

/**
 * Handle rate limit exceeded - logs to audit, returns 429 with proper headers
 */
async function handleRateLimitExceeded(
  req: Request,
  res: Response,
  rateLimiterRes: RateLimiterRes,
  tier: string,
  limit: number
): Promise<void> {
  const secs = Math.ceil(rateLimiterRes.msBeforeNext / 1000) || 1;
  const user = (req as any).user;

  await auditService.log({
    action: 'rate_limit.exceeded',
    severity: 'WARN',
    userId: user?.id,
    metadata: {
      tier,
      ip: req.ip,
      path: req.path,
      retryAfter: secs
    },
    ipAddress: req.ip
  });

  res.set({
    'Retry-After': String(secs),
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + secs)
  });

  res.status(429).json({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded',
    retryAfter: secs
  });
}

/**
 * Webhook rate limiter middleware: 1000 req/min per IP
 * Applied to /webhooks/alerts/* routes
 */
export function webhookRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';

  webhookLimiter.consume(key)
    .then((rateLimiterRes) => {
      setRateLimitHeaders(res, rateLimiterRes, 1000);
      next();
    })
    .catch((rateLimiterRes) => {
      if (rateLimiterRes instanceof Error) {
        // Redis error - log warning and allow request (graceful degradation)
        logger.warn({ error: rateLimiterRes }, 'Webhook rate limiter Redis error, allowing request');
        next();
        return;
      }
      handleRateLimitExceeded(req, res, rateLimiterRes, 'webhook', 1000);
    });
}

/**
 * API rate limiter middleware: 500 req/min per user (or IP if anonymous)
 * Applied to /api/* routes
 */
export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  const key = user?.id || req.ip || 'unknown';

  apiLimiter.consume(key)
    .then((rateLimiterRes) => {
      setRateLimitHeaders(res, rateLimiterRes, 500);
      next();
    })
    .catch((rateLimiterRes) => {
      if (rateLimiterRes instanceof Error) {
        // Redis error - log warning and allow request (graceful degradation)
        logger.warn({ error: rateLimiterRes }, 'API rate limiter Redis error, allowing request');
        next();
        return;
      }
      handleRateLimitExceeded(req, res, rateLimiterRes, 'api', 500);
    });
}

/**
 * Public rate limiter middleware: 100 req/min per IP
 * Applied to /status/*, /health, and other public endpoints
 */
export function publicRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';

  publicLimiter.consume(key)
    .then((rateLimiterRes) => {
      setRateLimitHeaders(res, rateLimiterRes, 100);
      next();
    })
    .catch((rateLimiterRes) => {
      if (rateLimiterRes instanceof Error) {
        // Redis error - log warning and allow request (graceful degradation)
        logger.warn({ error: rateLimiterRes }, 'Public rate limiter Redis error, allowing request');
        next();
        return;
      }
      handleRateLimitExceeded(req, res, rateLimiterRes, 'public', 100);
    });
}

/**
 * Login rate limiter middleware for break-glass/emergency login
 * Memory-based (acceptable since emergency-only, low volume)
 */
export async function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  // Use combination of email + IP for rate limit key
  const email = req.body.email || 'unknown';
  const ip = req.ip || 'unknown';
  const key = `${email}_${ip}`;

  try {
    await breakGlassLimiter.consume(key);
    next();
  } catch (rejRes) {
    const rateLimiterRes = rejRes as RateLimiterRes;
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

    await auditService.log({
      action: 'auth.rate_limit.exceeded',
      metadata: {
        email,
        ip,
        blockedForSeconds: secs,
        endpoint: 'emergency_login'
      },
      ipAddress: ip,
      severity: 'WARN'
    });

    res.set('Retry-After', String(secs));
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Please try again later',
      retryAfter: secs
    });
  }
}

// Call this after failed login attempt to track failures separately
export async function recordFailedLogin(email: string, ip: string) {
  const key = `${email}_${ip}`;
  try {
    await failedLoginLimiter.consume(key);
  } catch {
    // Already rate limited, this is expected
  }
}

// Check if user is blocked due to failed attempts
export async function isBlockedFromLogin(email: string, ip: string): Promise<boolean> {
  const key = `${email}_${ip}`;
  try {
    const res = await failedLoginLimiter.get(key);
    return res !== null && res.remainingPoints <= 0;
  } catch {
    return false;
  }
}
