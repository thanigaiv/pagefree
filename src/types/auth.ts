import type { User, TeamMember } from '@prisma/client';

// User with their team memberships loaded
export interface AuthenticatedUser extends User {
  teamMembers: (TeamMember & { team: { id: string; name: string; isActive: boolean } })[];
}

// Extend Express Request
declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

// Permission check result
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}
