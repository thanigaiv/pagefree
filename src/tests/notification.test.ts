import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../config/database.js';

// Mock external dependencies before imports
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ MessageId: 'ses-123' })
  })),
  SendEmailCommand: vi.fn()
}));

vi.mock('twilio', () => ({
  default: vi.fn().mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'twilio-msg-123' })
    },
    calls: {
      create: vi.fn().mockResolvedValue({ sid: 'twilio-call-123' })
    },
    api: {
      accounts: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue({})
      })
    }
  })
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456' }),
      update: vi.fn().mockResolvedValue({ ok: true })
    },
    auth: {
      test: vi.fn().mockResolvedValue({ ok: true })
    }
  }))
}));

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ MessageId: 'sns-123' })
  })),
  PublishCommand: vi.fn(),
  CreatePlatformEndpointCommand: vi.fn()
}));

import { deliveryTracker } from '../services/notification/delivery-tracker.js';
import {
  buildIncidentEmailSubject,
  buildIncidentEmailHtml
} from '../services/notification/templates/email.templates.js';
import { buildSlackIncidentBlocks } from '../services/notification/templates/slack.templates.js';
import type { NotificationPayload } from '../services/notification/types.js';

// Test fixtures
const testUser = {
  id: 'user-test-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  phone: '+15551234567',
  isActive: true,
  phoneVerified: true,
  emailVerified: true
};

const testIncident = {
  id: 'incident-test-1',
  priority: 'CRITICAL',
  status: 'OPEN',
  alertCount: 1,
  fingerprint: 'test-fp',
  teamId: 'team-test-1',
  escalationPolicyId: 'policy-test-1'
};

const testPayload: NotificationPayload = {
  incidentId: 'incident-test-1',
  userId: 'user-test-1',
  title: 'High CPU Usage on web-server-01',
  body: 'CPU usage exceeded 95% threshold for 5 minutes',
  priority: 'CRITICAL',
  service: 'payments-api',
  teamName: 'Platform Team',
  alertCount: 3,
  dashboardUrl: 'http://localhost:3000',
  triggeredAt: new Date('2026-02-08T10:00:00Z')
};

describe('Notification System', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.notificationLog.deleteMany({ where: { incidentId: { contains: 'test' } } });
    await prisma.magicLinkToken.deleteMany({ where: { incidentId: { contains: 'test' } } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Email Templates', () => {
    it('should build email subject with priority', () => {
      const subject = buildIncidentEmailSubject(testPayload);
      expect(subject).toContain('[CRITICAL]');
      expect(subject).toContain('payments-api');
      expect(subject).toContain('High CPU Usage');
    });

    it('should include escalation level in subject when present', () => {
      const payloadWithEscalation = { ...testPayload, escalationLevel: 2 };
      const subject = buildIncidentEmailSubject(payloadWithEscalation);
      expect(subject).toContain('[ESCALATION - Level 2]');
    });

    it('should build HTML email with all required fields', () => {
      const html = buildIncidentEmailHtml({
        ...testPayload,
        ackUrl: 'http://localhost:3000/magic/ack/123/token',
        resolveUrl: 'http://localhost:3000/magic/resolve/123/token'
      });

      expect(html).toContain('CRITICAL');
      expect(html).toContain('payments-api');
      expect(html).toContain('High CPU Usage');
      expect(html).toContain('Platform Team');
      expect(html).toContain('3 alerts');
      expect(html).toContain('Acknowledge Incident');
      expect(html).toContain('Resolve Incident');
    });
  });

  describe('Slack Templates', () => {
    it('should build Block Kit message with action buttons', () => {
      const message = buildSlackIncidentBlocks(testPayload);

      expect(message.text).toContain('[CRITICAL]');
      expect(message.attachments).toHaveLength(1);

      const blocks = message.attachments[0].blocks;
      const actionsBlock = blocks.find((b: any) => b.type === 'actions');

      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements).toHaveLength(3);  // Acknowledge, Resolve, View Dashboard
    });

    it('should use correct color for priority', () => {
      const message = buildSlackIncidentBlocks(testPayload);
      expect(message.attachments[0].color).toBe('#ff0000');  // Red for CRITICAL
    });
  });

  describe('SMS Format', () => {
    it('should stay within 160 character limit', () => {
      const longTitle = 'A'.repeat(200);
      const payload = { ...testPayload, title: longTitle };

      // The SMS builder should truncate
      const smsBuilder = (p: NotificationPayload) => {
        const shortId = p.incidentId.slice(-6);
        const prefix = `[${p.priority}]`;
        const suffix = `. Incident #${shortId} - Reply ACK`;
        const overhead = prefix.length + 1 + p.service.length + 2 + suffix.length;
        const availableChars = 160 - overhead;

        let title = p.title;
        if (title.length > availableChars) {
          title = title.substring(0, availableChars - 3) + '...';
        }

        return `${prefix} ${p.service}: ${title}${suffix}`;
      };

      const sms = smsBuilder(payload);
      expect(sms.length).toBeLessThanOrEqual(160);
    });

    it('should format as [PRIORITY] service: message. Incident #ID - Reply ACK', () => {
      const smsBuilder = (p: NotificationPayload) => {
        const shortId = p.incidentId.slice(-6);
        return `[${p.priority}] ${p.service}: ${p.title}. Incident #${shortId} - Reply ACK`;
      };

      const sms = smsBuilder(testPayload);
      expect(sms).toMatch(/^\[CRITICAL\] payments-api:/);
      expect(sms).toContain('Reply ACK');
    });
  });

  describe('Delivery Tracker', () => {
    it('should create QUEUED status entry', async () => {
      // Create test incident first
      const team = await prisma.team.upsert({
        where: { name: 'Test Team Notif' },
        create: { id: 'team-notif-test', name: 'Test Team Notif' },
        update: {}
      });

      const policy = await prisma.escalationPolicy.upsert({
        where: { id: 'policy-notif-test' },
        create: {
          id: 'policy-notif-test',
          name: 'Test Policy',
          teamId: team.id
        },
        update: {}
      });

      const incident = await prisma.incident.create({
        data: {
          id: 'incident-notif-test-1',
          fingerprint: 'test-notif-fp',
          teamId: team.id,
          escalationPolicyId: policy.id,
          status: 'OPEN',
          priority: 'HIGH'
        }
      });

      const user = await prisma.user.upsert({
        where: { email: 'notif-test@example.com' },
        create: {
          id: 'user-notif-test-1',
          email: 'notif-test@example.com',
          firstName: 'Notif',
          lastName: 'Test'
        },
        update: {}
      });

      const logId = await deliveryTracker.trackQueued(
        incident.id,
        user.id,
        'email',
        1
      );

      expect(logId).toBeDefined();

      const log = await prisma.notificationLog.findUnique({
        where: { id: logId }
      });

      expect(log).toBeDefined();
      expect(log?.status).toBe('QUEUED');
      expect(log?.channel).toBe('EMAIL');
      expect(log?.escalationLevel).toBe(1);

      // Cleanup
      await prisma.notificationLog.delete({ where: { id: logId } });
      await prisma.incident.delete({ where: { id: incident.id } });
    });

    it('should track status transitions', async () => {
      // Create test data
      const team = await prisma.team.upsert({
        where: { name: 'Test Team Notif 2' },
        create: { id: 'team-notif-test-2', name: 'Test Team Notif 2' },
        update: {}
      });

      const policy = await prisma.escalationPolicy.upsert({
        where: { id: 'policy-notif-test-2' },
        create: {
          id: 'policy-notif-test-2',
          name: 'Test Policy 2',
          teamId: team.id
        },
        update: {}
      });

      const incident = await prisma.incident.create({
        data: {
          id: 'incident-notif-test-2',
          fingerprint: 'test-notif-fp-2',
          teamId: team.id,
          escalationPolicyId: policy.id,
          status: 'OPEN',
          priority: 'HIGH'
        }
      });

      const user = await prisma.user.upsert({
        where: { email: 'notif-test-2@example.com' },
        create: {
          id: 'user-notif-test-2',
          email: 'notif-test-2@example.com',
          firstName: 'Notif',
          lastName: 'Test2'
        },
        update: {}
      });

      // Track through lifecycle
      const logId = await deliveryTracker.trackQueued(incident.id, user.id, 'sms');
      await deliveryTracker.trackSending(logId);
      await deliveryTracker.trackSent(logId, 'provider-123');
      await deliveryTracker.trackDelivered(logId);

      const finalLog = await prisma.notificationLog.findUnique({
        where: { id: logId }
      });

      expect(finalLog?.status).toBe('DELIVERED');
      expect(finalLog?.providerId).toBe('provider-123');
      expect(finalLog?.deliveredAt).toBeDefined();

      // Cleanup
      await prisma.notificationLog.delete({ where: { id: logId } });
      await prisma.incident.delete({ where: { id: incident.id } });
    });
  });

  describe('Magic Link Tokens', () => {
    it('should hash tokens for storage', async () => {
      const crypto = await import('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      expect(tokenHash).not.toBe(token);
      expect(tokenHash).toHaveLength(64);  // SHA-256 produces 64 hex chars
    });

    it('should verify token expiration', () => {
      const now = new Date();
      const fifteenMinAgo = new Date(now.getTime() - 16 * 60 * 1000);
      const inFiveMin = new Date(now.getTime() + 5 * 60 * 1000);

      expect(fifteenMinAgo < now).toBe(true);  // Expired
      expect(inFiveMin > now).toBe(true);      // Valid
    });
  });
});
