import express from 'express';
import passport from 'passport';
import crypto from 'crypto';
import { loginRateLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/auth.js';
import { auditService } from '../services/audit.service.js';

const authRouter = express.Router();

// Initiate Okta login
authRouter.get('/login', passport.authenticate('okta'));

// Okta callback
authRouter.get('/callback',
  passport.authenticate('okta', {
    failureRedirect: '/api/auth/login-failed',
    failureMessage: true
  }),
  (req, res): void => {
    // Successful authentication
    // Redirect to frontend dashboard (or return JSON for API clients)
    const returnTo = (req.session as any)?.returnTo || '/dashboard';
    delete (req.session as any)?.returnTo;
    res.redirect(returnTo);
  }
);

// Login failed handler
authRouter.get('/login-failed', (req, res): void => {
  res.status(401).json({
    error: 'Authentication failed',
    message: (req.session as any)?.messages?.[0] || 'Unable to authenticate with Okta'
  });
});

// Logout
authRouter.post('/logout', requireAuth, async (req, res): Promise<void> => {
  const userId = (req.user as any).id;

  await auditService.log({
    action: 'auth.logout',
    userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  req.logout((err: any): void => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }

    req.session.destroy((err: any): void => {
      if (err) {
        res.status(500).json({ error: 'Session destruction failed' });
        return;
      }
      res.clearCookie('oncall.sid');
      res.json({ success: true });
    });
  });
});

// Get current user
authRouter.get('/me', requireAuth, (req, res): void => {
  const user = req.user as any;
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    platformRole: user.platformRole,
    teams: user.teamMembers.map((m: any) => ({
      id: m.team.id,
      name: m.team.name,
      role: m.role
    }))
  });
});

// Check auth status (doesn't require auth)
authRouter.get('/status', (req, res): void => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      id: (req.user as any).id,
      email: (req.user as any).email
    } : null
  });
});

/**
 * Emergency login endpoint (break-glass only)
 *
 * Security notes:
 * - Break-glass route is ONLY for emergencies when Okta is unavailable
 * - All break-glass logins logged with HIGH severity
 * - Rate limiting prevents brute force
 * - Generic error messages prevent account enumeration
 */
authRouter.post('/emergency',
  loginRateLimiter,
  (req, res, next): void => {
    passport.authenticate('local', (err: any, user: any, _info: any): void => {
      if (err) {
        res.status(500).json({ error: 'Authentication error' });
        return;
      }

      if (!user) {
        // Generic error message to not reveal account existence
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
        return;
      }

      req.logIn(user, (err: any): void => {
        if (err) {
          res.status(500).json({ error: 'Session creation failed' });
          return;
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            platformRole: user.platformRole,
            isBreakGlassAccount: true
          },
          warning: 'You are using emergency break-glass access. Normal authentication via Okta is recommended.'
        });
      });
    })(req, res, next);
  }
);

// WebAuthn placeholder endpoints (full implementation deferred)
// These endpoints provide mock responses for biometric authentication UI
authRouter.post('/webauthn/register-challenge', (_req, res) => {
  // In production: Generate and store challenge
  res.json({
    challenge: Buffer.from(crypto.randomUUID()).toString('base64'),
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    rpName: 'PageFree',
  });
});

authRouter.post('/webauthn/register', (_req, res) => {
  // In production: Verify and store credential
  res.json({ success: true });
});

authRouter.get('/webauthn/login-challenge', (_req, res) => {
  // In production: Generate challenge, look up user credentials
  res.json({
    challenge: Buffer.from(crypto.randomUUID()).toString('base64'),
    rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
    allowCredentials: [],
  });
});

authRouter.post('/webauthn/login', (_req, res) => {
  // In production: Verify assertion
  res.json({ success: true });
});

authRouter.get('/webauthn/credentials', (_req, res) => {
  // In production: Return user's registered credentials
  res.json({ credentials: [] });
});

export { authRouter };
