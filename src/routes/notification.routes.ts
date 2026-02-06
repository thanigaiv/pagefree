import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { contactService } from '../services/contact.service.js';
import { auditService } from '../services/audit.service.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

// GET /api/notifications/preferences - Get current user's preferences
notificationRouter.get('/preferences', async (req, res) => {
  try {
    const userId = (req.user as any).id;

    const preferences = await prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { priority: 'asc' }
    });

    return res.json({
      preferences: preferences.map(p => ({
        id: p.id,
        channel: p.channel,
        enabled: p.enabled,
        priority: p.priority
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// PUT /api/notifications/preferences - Update preferences
const UpdatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'SLACK', 'VOICE']),
    enabled: z.boolean(),
    priority: z.number().min(1).max(10)
  }))
});

notificationRouter.put('/preferences', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { preferences } = UpdatePreferencesSchema.parse(req.body);

    // Delete existing and recreate (simplest approach)
    await prisma.notificationPreference.deleteMany({
      where: { userId }
    });

    await prisma.notificationPreference.createMany({
      data: preferences.map(p => ({
        userId,
        channel: p.channel,
        enabled: p.enabled,
        priority: p.priority
      }))
    });

    await auditService.log({
      action: 'user.preferences.updated',
      userId,
      metadata: {
        channels: preferences.map(p => p.channel)
      }
    });

    // Fetch and return the created preferences
    const updated = await prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { priority: 'asc' }
    });

    return res.json({ preferences: updated });
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid preferences data' });
    }
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// GET /api/notifications/verification/status - Get verification status
notificationRouter.get('/verification/status', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const status = await contactService.getVerificationStatus(userId);

    if (!status) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get verification status' });
  }
});

// POST /api/notifications/verification/send - Send verification code
const SendVerificationSchema = z.object({
  method: z.enum(['email', 'sms', 'push']),
  value: z.string().optional() // Required for email/sms, not for push
});

notificationRouter.post('/verification/send', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { method, value } = SendVerificationSchema.parse(req.body);

    // For email/sms, get value from user profile if not provided
    let targetValue = value;
    if (!targetValue && (method === 'email' || method === 'sms')) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true }
      });

      if (method === 'email') targetValue = user?.email || undefined;
      if (method === 'sms') targetValue = user?.phone || undefined;
    }

    if (!targetValue && method !== 'push') {
      return res.status(400).json({
        error: `No ${method === 'email' ? 'email' : 'phone'} address available`
      });
    }

    const result = await contactService.sendVerification(
      userId,
      method,
      targetValue || ''
    );

    return res.json(result);
  } catch (error) {
    if ((error as any).message?.includes('already sent')) {
      return res.status(429).json({ error: (error as any).message });
    }
    return res.status(500).json({ error: 'Failed to send verification' });
  }
});

// POST /api/notifications/verification/verify - Verify code
const VerifyCodeSchema = z.object({
  method: z.enum(['email', 'sms', 'push']),
  code: z.string().length(6)
});

notificationRouter.post('/verification/verify', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { method, code } = VerifyCodeSchema.parse(req.body);

    const result = await contactService.verifyCode(userId, method, code);
    return res.json(result);
  } catch (error) {
    if ((error as any).message?.includes('Invalid or expired')) {
      return res.status(400).json({ error: (error as any).message });
    }
    return res.status(500).json({ error: 'Failed to verify code' });
  }
});

// POST /api/notifications/devices - Register device for push
const RegisterDeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  deviceToken: z.string(),
  deviceName: z.string().optional()
});

notificationRouter.post('/devices', async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const { platform, deviceToken, deviceName } = RegisterDeviceSchema.parse(req.body);

    const device = await prisma.userDevice.upsert({
      where: {
        userId_deviceToken: { userId, deviceToken }
      },
      create: {
        userId,
        platform,
        deviceToken,
        deviceName,
        lastSeenAt: new Date()
      },
      update: {
        platform,
        deviceName,
        lastSeenAt: new Date()
      }
    });

    await auditService.log({
      action: 'device.registered',
      userId,
      metadata: { platform, deviceId: device.id }
    });

    return res.json({
      id: device.id,
      platform: device.platform,
      deviceName: device.deviceName
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to register device' });
  }
});

// DELETE /api/notifications/devices/:id - Unregister device
notificationRouter.delete('/devices/:id', async (req, res) => {
  try {
    const userId = (req.user as any).id;

    await prisma.userDevice.deleteMany({
      where: {
        id: req.params.id,
        userId // Ensure user owns the device
      }
    });

    await auditService.log({
      action: 'device.unregistered',
      userId,
      metadata: { deviceId: req.params.id }
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to unregister device' });
  }
});
