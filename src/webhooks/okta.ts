import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { auditService } from '../services/audit.service.js';
import { env } from '../config/env.js';

export const oktaWebhookRouter = Router();

// Verify Okta webhook signature
function verifyOktaSignature(req: any): boolean {
  // Handle one-time verification challenge
  if (req.headers['x-okta-verification-challenge']) {
    return true;
  }

  const oktaSignature = req.headers['x-okta-signature'] as string;
  if (!oktaSignature || !env.OKTA_WEBHOOK_SECRET) {
    return false;
  }

  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', env.OKTA_WEBHOOK_SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(oktaSignature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// Event hook endpoint
oktaWebhookRouter.post('/events', async (req, res): Promise<void> => {
  // Handle one-time verification challenge
  if (req.headers['x-okta-verification-challenge']) {
    res.json({
      verification: req.headers['x-okta-verification-challenge']
    });
    return;
  }

  // Verify signature
  if (!verifyOktaSignature(req)) {
    await auditService.log({
      action: 'webhook.okta.signature_invalid',
      severity: 'HIGH',
      metadata: { headers: req.headers }
    });
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const { data } = req.body;

  try {
    for (const event of data?.events || []) {
      await handleOktaEvent(event);
    }
    res.json({ success: true });
  } catch (error) {
    await auditService.log({
      action: 'webhook.okta.error',
      severity: 'HIGH',
      metadata: { error: String(error) }
    });
    res.status(500).json({ error: 'Event processing failed' });
  }
});

async function handleOktaEvent(event: any) {
  const eventType = event.eventType;

  switch (eventType) {
    case 'user.session.end':
      await handleSessionEnd(event);
      break;

    case 'user.lifecycle.deactivate':
      await handleUserDeactivation(event);
      break;

    case 'user.lifecycle.activate':
      await handleUserActivation(event);
      break;

    case 'user.lifecycle.suspend':
      // Treat suspend same as deactivate
      await handleUserDeactivation(event);
      break;

    default:
      // Log unhandled event types for future implementation
      await auditService.log({
        action: 'webhook.okta.unhandled',
        metadata: { eventType, eventId: event.eventId }
      });
  }
}

async function handleSessionEnd(event: any) {
  const oktaUserId = event.actor?.id;
  if (!oktaUserId) return;

  const user = await prisma.user.findUnique({
    where: { oktaId: oktaUserId }
  });

  if (!user) return;

  // Delete all sessions for this user
  // connect-pg-simple stores JSON with user ID in sess column
  await prisma.session.deleteMany({
    where: {
      sess: {
        path: ['passport', 'user'],
        equals: user.id
      }
    }
  });

  await auditService.log({
    action: 'auth.session.okta_expired',
    userId: user.id,
    severity: 'INFO',
    metadata: { oktaEventId: event.eventId }
  });
}

async function handleUserDeactivation(event: any) {
  // Target is the user being deactivated
  const oktaUserId = event.target?.[0]?.id;
  if (!oktaUserId) return;

  const user = await prisma.user.findUnique({
    where: { oktaId: oktaUserId }
  });

  if (!user) return;

  // Soft delete the user (per user decision)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: false,
      deactivatedAt: new Date()
    }
  });

  // Delete all sessions
  await prisma.session.deleteMany({
    where: {
      sess: {
        path: ['passport', 'user'],
        equals: user.id
      }
    }
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id }
  });

  await auditService.log({
    action: 'user.deactivated',
    userId: user.id,
    severity: 'HIGH',
    metadata: {
      source: 'okta_webhook',
      oktaEventId: event.eventId,
      eventType: event.eventType
    }
  });
}

async function handleUserActivation(event: any) {
  const oktaUserId = event.target?.[0]?.id;
  if (!oktaUserId) return;

  const user = await prisma.user.findUnique({
    where: { oktaId: oktaUserId }
  });

  if (!user) return;

  // Reactivate the user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: true,
      deactivatedAt: null
    }
  });

  await auditService.log({
    action: 'user.reactivated',
    userId: user.id,
    severity: 'INFO',
    metadata: {
      source: 'okta_webhook',
      oktaEventId: event.eventId
    }
  });
}
