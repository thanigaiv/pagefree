import passport from 'passport';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';
import { prisma } from '../../config/database.js';
import { auditService } from '../../services/audit.service.js';
import { env } from '../../config/env.js';

export function configureOktaStrategy() {
  passport.use('okta', new OpenIDConnectStrategy({
    issuer: env.OKTA_ISSUER,
    authorizationURL: `${env.OKTA_DOMAIN}/oauth2/v1/authorize`,
    tokenURL: `${env.OKTA_DOMAIN}/oauth2/v1/token`,
    userInfoURL: `${env.OKTA_DOMAIN}/oauth2/v1/userinfo`,
    clientID: env.OKTA_CLIENT_ID,
    clientSecret: env.OKTA_CLIENT_SECRET,
    callbackURL: '/auth/callback',
    scope: ['openid', 'profile', 'email']
  }, async (_issuer: any, profile: any, done: any) => {
    try {
      // Find user by Okta ID (set via SCIM) or email
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { oktaId: profile.id },
            { email: profile.emails?.[0]?.value }
          ]
        },
        include: {
          teamMembers: {
            include: { team: { select: { id: true, name: true, isActive: true } } }
          }
        }
      });

      if (!user) {
        // User not provisioned via SCIM yet - create minimal record
        // SCIM will update with full details later
        user = await prisma.user.create({
          data: {
            oktaId: profile.id,
            email: profile.emails?.[0]?.value || '',
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || '',
            syncedFromOkta: true
          },
          include: {
            teamMembers: {
              include: { team: { select: { id: true, name: true, isActive: true } } }
            }
          }
        });

        await auditService.log({
          action: 'user.created.okta_login',
          userId: user.id,
          metadata: { oktaId: profile.id, email: user.email }
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return done(null, false, { message: 'Account is deactivated' });
      }

      // Log successful authentication
      await auditService.log({
        action: 'auth.login.okta',
        userId: user.id,
        severity: 'INFO'
      });

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));

  // Serialize user ID to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session - MUST include teamMembers for RBAC
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          teamMembers: {
            where: { team: { isActive: true } }, // Only active teams
            include: { team: { select: { id: true, name: true, isActive: true } } }
          }
        }
      });

      if (!user || !user.isActive) {
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}
