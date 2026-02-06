import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { auditService } from '../services/audit.service.js';

export const mobileRouter = Router();

// POST /api/mobile/token - Issue refresh token after Okta auth
// Per user decision: "Long-lived refresh tokens after initial Okta auth (for 24/7 on-call scenarios)"
const IssueTokenSchema = z.object({
  deviceInfo: z.string().optional()
});

mobileRouter.post('/token', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { deviceInfo } = IssueTokenSchema.parse(req.body);

    // Generate secure random token
    const token = randomBytes(32).toString('hex');

    // Hash token before storing (don't store plaintext)
    const hashedToken = createHash('sha256').update(token).digest('hex');

    // Create refresh token with 90-day expiry
    const refreshToken = await prisma.refreshToken.create({
      data: {
        userId,
        token: hashedToken,
        deviceInfo: deviceInfo || req.get('user-agent') || 'unknown',
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        lastUsedAt: new Date()
      }
    });

    await auditService.log({
      action: 'mobile.token.issued',
      userId,
      metadata: {
        tokenId: refreshToken.id,
        deviceInfo: refreshToken.deviceInfo
      }
    });

    // Return plaintext token to client (only time it's visible)
    return res.json({
      refreshToken: token,
      expiresAt: refreshToken.expiresAt
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to issue refresh token' });
  }
});

// POST /api/mobile/refresh - Refresh session using refresh token
const RefreshSessionSchema = z.object({
  refreshToken: z.string()
});

mobileRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = RefreshSessionSchema.parse(req.body);

    // Hash provided token to compare with stored hash
    const hashedToken = createHash('sha256').update(refreshToken).digest('hex');

    // Find valid refresh token
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            platformRole: true,
            isActive: true,
            teamMembers: {
              where: { team: { isActive: true } },
              include: {
                team: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    });

    if (!tokenRecord) {
      await auditService.log({
        action: 'mobile.refresh.failed',
        severity: 'WARN',
        metadata: { reason: 'invalid_or_expired_token' }
      });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check if user is still active
    if (!tokenRecord.user.isActive) {
      await auditService.log({
        action: 'mobile.refresh.failed',
        userId: tokenRecord.user.id,
        severity: 'WARN',
        metadata: { reason: 'user_deactivated' }
      });
      return res.status(401).json({ error: 'User account is deactivated' });
    }

    // Update last used timestamp
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: new Date() }
    });

    await auditService.log({
      action: 'mobile.refresh.success',
      userId: tokenRecord.user.id,
      metadata: { tokenId: tokenRecord.id }
    });

    // Return user session data
    return res.json({
      user: {
        id: tokenRecord.user.id,
        email: tokenRecord.user.email,
        firstName: tokenRecord.user.firstName,
        lastName: tokenRecord.user.lastName,
        platformRole: tokenRecord.user.platformRole,
        teams: tokenRecord.user.teamMembers.map(m => ({
          id: m.team.id,
          name: m.team.name,
          role: m.role
        }))
      }
    });
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request' });
    }
    return res.status(500).json({ error: 'Failed to refresh session' });
  }
});

// DELETE /api/mobile/token - Revoke refresh token (logout)
const RevokeTokenSchema = z.object({
  refreshToken: z.string()
});

mobileRouter.delete('/token', async (req, res) => {
  try {
    const { refreshToken } = RevokeTokenSchema.parse(req.body);
    const hashedToken = createHash('sha256').update(refreshToken).digest('hex');

    const tokenRecord = await prisma.refreshToken.findFirst({
      where: { token: hashedToken }
    });

    if (tokenRecord) {
      await prisma.refreshToken.delete({
        where: { id: tokenRecord.id }
      });

      await auditService.log({
        action: 'mobile.token.revoked',
        userId: tokenRecord.userId,
        metadata: { tokenId: tokenRecord.id }
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// GET /api/mobile/tokens - List user's active refresh tokens
mobileRouter.get('/tokens', requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;

    const tokens = await prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        deviceInfo: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true
      },
      orderBy: { lastUsedAt: 'desc' }
    });

    return res.json({ tokens });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list tokens' });
  }
});
