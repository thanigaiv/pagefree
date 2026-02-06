import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/database.js';
import { auditService } from '../../services/audit.service.js';
import { recordFailedLogin } from '../../middleware/rateLimiter.js';

export function configureLocalStrategy() {
  passport.use('local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true // Get access to req for IP/user-agent
  }, async (req, email, password, done) => {
    const ip = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    try {
      // CRITICAL: Only allow break-glass accounts
      const user = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          isBreakGlassAccount: true,
          isActive: true
        },
        include: {
          teamMembers: {
            where: { team: { isActive: true } },
            include: { team: { select: { id: true, name: true, isActive: true } } }
          }
        }
      });

      if (!user) {
        await recordFailedLogin(email, ip);
        await auditService.log({
          action: 'auth.breakglass.failed',
          severity: 'HIGH',
          metadata: {
            email,
            reason: 'account_not_found_or_not_breakglass'
          },
          ipAddress: ip,
          userAgent
        });
        return done(null, false, { message: 'Invalid credentials' });
      }

      if (!user.passwordHash) {
        await recordFailedLogin(email, ip);
        await auditService.log({
          action: 'auth.breakglass.failed',
          userId: user.id,
          severity: 'HIGH',
          metadata: { reason: 'no_password_set' },
          ipAddress: ip,
          userAgent
        });
        return done(null, false, { message: 'Invalid credentials' });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);

      if (!isValid) {
        await recordFailedLogin(email, ip);
        await auditService.log({
          action: 'auth.breakglass.failed',
          userId: user.id,
          severity: 'HIGH',
          metadata: { reason: 'invalid_password' },
          ipAddress: ip,
          userAgent
        });
        return done(null, false, { message: 'Invalid credentials' });
      }

      // SUCCESS - Log with HIGH severity (break-glass is sensitive)
      await auditService.log({
        action: 'auth.breakglass.success',
        userId: user.id,
        severity: 'HIGH',
        metadata: {
          email: user.email,
          note: 'Break-glass emergency login used'
        },
        ipAddress: ip,
        userAgent
      });

      return done(null, user);
    } catch (error) {
      await auditService.log({
        action: 'auth.breakglass.error',
        severity: 'HIGH',
        metadata: { error: String(error) },
        ipAddress: ip,
        userAgent
      });
      return done(error);
    }
  }));
}
