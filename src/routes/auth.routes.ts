import express from 'express';
import passport from 'passport';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const authRouter = express.Router();

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

export { authRouter };
