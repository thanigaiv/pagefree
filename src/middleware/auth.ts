import { Request, Response, NextFunction } from 'express';
import { TeamRole } from '@prisma/client';
import { permissionService } from '../services/permission.service.js';
import { AuthenticatedUser } from '../types/auth.js';

/**
 * Require authentication middleware
 * Checks if req.user exists (set by Passport after authentication)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Check if user account is active (soft delete check)
  const user = req.user as AuthenticatedUser;
  if (!user.isActive) {
    res.status(403).json({ error: 'Account is deactivated' });
    return;
  }

  next();
}

/**
 * Require platform admin role
 * Must be used after requireAuth
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as AuthenticatedUser;

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!permissionService.isPlatformAdmin(user)) {
    res.status(403).json({ error: 'Platform admin access required' });
    return;
  }

  next();
}

/**
 * Require minimum team role
 * Returns middleware function that checks user has at least minRole on the team from req.params.teamId
 *
 * Example usage:
 *   router.put('/teams/:teamId/settings', requireAuth, requireTeamRole('TEAM_ADMIN'), updateTeamSettings);
 */
export function requireTeamRole(minRole: TeamRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as AuthenticatedUser;
    const { teamId } = req.params;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!teamId) {
      res.status(400).json({ error: 'Team ID required' });
      return;
    }

    if (!permissionService.hasMinimumTeamRole(user, teamId, minRole)) {
      res.status(403).json({ error: 'Insufficient team permissions' });
      return;
    }

    next();
  };
}

/**
 * Require team membership (any role)
 * Shorthand for requireTeamRole('OBSERVER')
 */
export function requireTeamMember(req: Request, res: Response, next: NextFunction): void {
  return requireTeamRole('OBSERVER')(req, res, next);
}

/**
 * Require team admin role
 * Shorthand for requireTeamRole('TEAM_ADMIN')
 */
export function requireTeamAdmin(req: Request, res: Response, next: NextFunction): void {
  return requireTeamRole('TEAM_ADMIN')(req, res, next);
}

/**
 * Require responder role (can acknowledge and resolve incidents)
 * Shorthand for requireTeamRole('RESPONDER')
 */
export function requireResponder(req: Request, res: Response, next: NextFunction): void {
  return requireTeamRole('RESPONDER')(req, res, next);
}

/**
 * Optional authentication middleware
 * Sets req.user if authenticated, but doesn't fail if not authenticated
 * Useful for public endpoints that change behavior based on authentication status
 */
export function optionalAuth(_req: Request, _res: Response, next: NextFunction): void {
  // If user is not authenticated, just continue
  // req.user will be undefined, routes can check for it
  next();
}

/**
 * Example usage patterns (for documentation):
 *
 * // Protect route - only platform admins
 * router.post('/users', requirePlatformAdmin, createUser);
 *
 * // Protect route - team admins only
 * router.put('/teams/:teamId/settings', requireAuth, requireTeamRole('TEAM_ADMIN'), updateTeamSettings);
 *
 * // Protect route - responders can acknowledge
 * router.post('/teams/:teamId/incidents/:id/ack', requireAuth, requireTeamRole('RESPONDER'), ackIncident);
 *
 * // Optional auth - public endpoint with different behavior for authenticated users
 * router.get('/status', optionalAuth, getStatus);
 */
