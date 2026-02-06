import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { userService } from '../services/user.service.js';

export const userRouter = Router();

// All user routes require authentication
userRouter.use(requireAuth);

// GET /api/users/me - Get current user's profile
userRouter.get('/me', async (req, res) => {
  try {
    const profile = await userService.getProfile((req.user as any).id);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(profile);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users/:id - Get specific user's profile (admin or self)
userRouter.get('/:id', async (req, res) => {
  const currentUser = req.user as any;
  const targetId = req.params.id;

  // Can view self or if platform admin
  if (targetId !== currentUser.id && currentUser.platformRole !== 'PLATFORM_ADMIN') {
    return res.status(403).json({ error: 'Cannot view other users' });
  }

  try {
    const profile = await userService.getProfile(targetId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(profile);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

// GET /api/users - List users (admin only)
const ListUsersSchema = z.object({
  teamId: z.string().optional(),
  role: z.enum(['PLATFORM_ADMIN', 'USER']).optional(),
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

userRouter.get('/', requirePlatformAdmin, async (req, res) => {
  try {
    const params = ListUsersSchema.parse(req.query);
    const result = await userService.listUsers(params);
    return res.json(result);
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// PATCH /api/users/:id/role - Update user's platform role (admin only)
const UpdateRoleSchema = z.object({
  role: z.enum(['PLATFORM_ADMIN', 'USER'])
});

userRouter.patch('/:id/role', requirePlatformAdmin, async (req, res) => {
  try {
    const { role } = UpdateRoleSchema.parse(req.body);
    const user = await userService.updateRole(
      req.params.id,
      role,
      (req.user as any).id
    );
    return res.json({
      id: user.id,
      email: user.email,
      platformRole: user.platformRole
    });
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid role' });
    }
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// Note: Profile data (name, email, phone) is read-only - synced from Okta via SCIM
// No PUT/PATCH for profile fields - redirect users to update in Okta
