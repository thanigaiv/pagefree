import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin, requireTeamRole } from '../middleware/auth.js';
import { teamService } from '../services/team.service.js';
import { ORGANIZATIONAL_TAGS, TECHNICAL_TAGS } from '../types/team.js';

export const teamRouter = Router();

// All team routes require authentication
teamRouter.use(requireAuth);

// GET /api/teams - List all teams (full visibility per user decision)
const ListTeamsSchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
  tagType: z.enum(['ORGANIZATIONAL', 'TECHNICAL']).optional(),
  tagValue: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0)
});

teamRouter.get('/', async (req, res) => {
  try {
    const params = ListTeamsSchema.parse(req.query);
    const result = await teamService.list(params);
    return res.json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    return res.status(500).json({ error: 'Failed to list teams' });
  }
});

// GET /api/teams/tags - Get available tag values
teamRouter.get('/tags', (_req, res) => {
  return res.json({
    organizational: ORGANIZATIONAL_TAGS,
    technical: TECHNICAL_TAGS
  });
});

// GET /api/teams/:teamId - Get team details
teamRouter.get('/:teamId', async (req, res) => {
  try {
    const team = await teamService.get(req.params.teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.json(team);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get team' });
  }
});

// GET /api/teams/:teamId/health - Get team health metrics
teamRouter.get('/:teamId/health', async (req, res) => {
  try {
    const health = await teamService.getHealthMetrics(req.params.teamId);
    if (!health) {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.json(health);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get team health' });
  }
});

// POST /api/teams - Create team (platform admin only)
const CreateTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  slackChannel: z.string().max(100).optional(),
  tags: z.array(z.object({
    type: z.enum(['ORGANIZATIONAL', 'TECHNICAL']),
    value: z.string()
  })).optional()
});

teamRouter.post('/', requirePlatformAdmin, async (req, res) => {
  try {
    const input = CreateTeamSchema.parse(req.body);
    const team = await teamService.create(input, (req.user as any).id);
    return res.status(201).json(team);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid team data' });
    }
    return res.status(500).json({ error: 'Failed to create team' });
  }
});

// PATCH /api/teams/:teamId - Update team (team admin or platform admin)
const UpdateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  slackChannel: z.string().max(100).optional(),
  maintenanceMode: z.boolean().optional(),
  notificationDefaults: z.record(z.string(), z.any()).optional(),
  escalationDefaults: z.record(z.string(), z.any()).optional()
});

teamRouter.patch('/:teamId', requireTeamRole('TEAM_ADMIN'), async (req, res) => {
  try {
    const input = UpdateTeamSchema.parse(req.body);
    const team = await teamService.update(
      req.params.teamId,
      input,
      (req.user as any).id
    );
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }
    return res.json(team);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid team data' });
    }
    return res.status(500).json({ error: 'Failed to update team' });
  }
});

// PUT /api/teams/:teamId/tags - Update team tags (team admin)
const UpdateTagsSchema = z.object({
  tags: z.array(z.object({
    type: z.enum(['ORGANIZATIONAL', 'TECHNICAL']),
    value: z.string()
  }))
});

teamRouter.put('/:teamId/tags', requireTeamRole('TEAM_ADMIN'), async (req, res) => {
  try {
    const { tags } = UpdateTagsSchema.parse(req.body);
    await teamService.updateTags(
      req.params.teamId,
      tags,
      (req.user as any).id
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update tags' });
  }
});

// DELETE /api/teams/:teamId - Archive team (platform admin only)
teamRouter.delete('/:teamId', requirePlatformAdmin, async (req, res) => {
  try {
    await teamService.archive(req.params.teamId, (req.user as any).id);
    return res.json({ success: true, archived: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to archive team' });
  }
});

// ============ MEMBERSHIP ============

// POST /api/teams/:teamId/members - Add member (team admin)
const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(['TEAM_ADMIN', 'RESPONDER', 'OBSERVER'])
});

teamRouter.post('/:teamId/members', requireTeamRole('TEAM_ADMIN'), async (req, res) => {
  try {
    const input = AddMemberSchema.parse(req.body);
    const member = await teamService.addMember(
      req.params.teamId,
      input,
      (req.user as any).id
    );
    return res.status(201).json(member);
  } catch (error: any) {
    if (error.message?.includes('already a member')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add member' });
  }
});

// PATCH /api/teams/:teamId/members/:userId - Update member role (team admin)
const UpdateMemberSchema = z.object({
  role: z.enum(['TEAM_ADMIN', 'RESPONDER', 'OBSERVER'])
});

teamRouter.patch('/:teamId/members/:userId', requireTeamRole('TEAM_ADMIN'), async (req, res) => {
  try {
    const { role } = UpdateMemberSchema.parse(req.body);
    const member = await teamService.updateMemberRole(
      req.params.teamId,
      req.params.userId,
      role,
      (req.user as any).id
    );
    return res.json(member);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update member role' });
  }
});

// DELETE /api/teams/:teamId/members/:userId - Remove member (team admin or self)
teamRouter.delete('/:teamId/members/:userId', async (req, res) => {
  const currentUser = req.user as any;
  const targetUserId = req.params.userId;
  const teamId = req.params.teamId;

  // Self-removal allowed per user decision
  const isSelf = currentUser.id === targetUserId;

  if (!isSelf) {
    // Check if user is team admin for non-self removal
    const membership = currentUser.teamMembers?.find((m: any) => m.teamId === teamId);
    const isTeamAdmin = membership?.role === 'TEAM_ADMIN';
    const isPlatformAdmin = currentUser.platformRole === 'PLATFORM_ADMIN';

    if (!isTeamAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Cannot remove other members' });
    }
  }

  try {
    await teamService.removeMember(
      teamId,
      targetUserId,
      currentUser.id,
      isSelf
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});
