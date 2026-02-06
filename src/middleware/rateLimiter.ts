import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service.js';

// In-memory rate limiter for break-glass login
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
