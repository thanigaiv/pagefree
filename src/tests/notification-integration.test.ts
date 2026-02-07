import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../config/database.js';

// Mock all external services
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ MessageId: 'ses-int-123' })
  })),
  SendEmailCommand: vi.fn()
}));

vi.mock('twilio', () => ({
  default: vi.fn().mockReturnValue({
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'twilio-int-123' })
    },
    calls: {
      create: vi.fn().mockResolvedValue({ sid: 'twilio-call-int-123' })
    },
    api: {
      accounts: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue({})
      })
    },
    validateRequest: vi.fn().mockReturnValue(true)
  })
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456', ok: true }),
      update: vi.fn().mockResolvedValue({ ok: true })
    },
    auth: {
      test: vi.fn().mockResolvedValue({ ok: true })
    }
  }))
}));

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ MessageId: 'sns-int-123', EndpointArn: 'arn:aws:sns:us-east-1:123:endpoint' })
  })),
  PublishCommand: vi.fn(),
  CreatePlatformEndpointCommand: vi.fn()
}));

// Mock Redis for queue tests
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    quit: vi.fn()
  }))
}));

describe('Notification Integration', () => {
  let testTeam: any;
  let testUser: any;
  let testPolicy: any;
  let testIncident: any;

  beforeEach(async () => {
    // Create test fixtures
    testTeam = await prisma.team.upsert({
      where: { name: 'Integration Test Team' },
      create: {
        id: 'team-int-test',
        name: 'Integration Test Team',
        slackChannel: '#test-alerts'
      },
      update: {}
    });

    testUser = await prisma.user.upsert({
      where: { email: 'int-test@example.com' },
      create: {
        id: 'user-int-test',
        email: 'int-test@example.com',
        firstName: 'Integration',
        lastName: 'Test',
        phone: '+15551234567',
        phoneVerified: true,
        emailVerified: true
      },
      update: {}
    });

    // Create notification preferences
    await prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: testUser.id, channel: 'EMAIL' } },
      create: { userId: testUser.id, channel: 'EMAIL', enabled: true, priority: 1 },
      update: {}
    });

    await prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: testUser.id, channel: 'SMS' } },
      create: { userId: testUser.id, channel: 'SMS', enabled: true, priority: 2 },
      update: {}
    });

    testPolicy = await prisma.escalationPolicy.upsert({
      where: { id: 'policy-int-test' },
      create: {
        id: 'policy-int-test',
        name: 'Integration Test Policy',
        teamId: testTeam.id
      },
      update: {}
    });

    testIncident = await prisma.incident.create({
      data: {
        id: 'incident-int-' + Date.now(),
        fingerprint: 'int-test-fp-' + Date.now(),
        teamId: testTeam.id,
        escalationPolicyId: testPolicy.id,
        status: 'OPEN',
        priority: 'HIGH',
        alertCount: 1,
        assignedUserId: testUser.id
      }
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();

    // Cleanup in correct order (respecting foreign keys)
    if (testIncident) {
      await prisma.notificationLog.deleteMany({ where: { incidentId: testIncident.id } });
      await prisma.magicLinkToken.deleteMany({ where: { incidentId: testIncident.id } });
      await prisma.incident.delete({ where: { id: testIncident.id } }).catch(() => {});
    }
  });

  describe('Notification Dispatch', () => {
    it('should create notification logs for enabled channels', async () => {
      // Import after mocks are set up
      const { deliveryTracker } = await import('../services/notification/delivery-tracker.js');

      // Track notifications for user's enabled channels
      const emailLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'email');
      const smsLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'sms');

      // Verify logs created
      const logs = await prisma.notificationLog.findMany({
        where: { incidentId: testIncident.id }
      });

      expect(logs).toHaveLength(2);
      expect(logs.map(l => l.channel)).toContain('EMAIL');
      expect(logs.map(l => l.channel)).toContain('SMS');
    });

    it('should track delivery status through lifecycle', async () => {
      const { deliveryTracker } = await import('../services/notification/delivery-tracker.js');

      const logId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'email');

      // Simulate delivery lifecycle
      await deliveryTracker.trackSending(logId);
      let log = await prisma.notificationLog.findUnique({ where: { id: logId } });
      expect(log?.status).toBe('SENDING');
      expect(log?.attemptCount).toBe(1);

      await deliveryTracker.trackSent(logId, 'ses-123');
      log = await prisma.notificationLog.findUnique({ where: { id: logId } });
      expect(log?.status).toBe('SENT');
      expect(log?.providerId).toBe('ses-123');

      await deliveryTracker.trackDelivered(logId);
      log = await prisma.notificationLog.findUnique({ where: { id: logId } });
      expect(log?.status).toBe('DELIVERED');
      expect(log?.deliveredAt).toBeDefined();
    });
  });

  describe('Magic Links', () => {
    it('should create and validate magic link tokens', async () => {
      const crypto = await import('crypto');

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Create token
      await prisma.magicLinkToken.create({
        data: {
          tokenHash,
          incidentId: testIncident.id,
          action: 'acknowledge',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      // Verify token exists and is valid
      const foundToken = await prisma.magicLinkToken.findUnique({
        where: { tokenHash }
      });

      expect(foundToken).toBeDefined();
      expect(foundToken?.used).toBe(false);
      expect(foundToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark token as used after consumption', async () => {
      const crypto = await import('crypto');

      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const magicToken = await prisma.magicLinkToken.create({
        data: {
          tokenHash,
          incidentId: testIncident.id,
          action: 'acknowledge',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
      });

      // Mark as used
      await prisma.magicLinkToken.update({
        where: { id: magicToken.id },
        data: { used: true, usedAt: new Date() }
      });

      const updatedToken = await prisma.magicLinkToken.findUnique({
        where: { id: magicToken.id }
      });

      expect(updatedToken?.used).toBe(true);
      expect(updatedToken?.usedAt).toBeDefined();
    });
  });

  describe('Channel Escalation', () => {
    it('should detect when critical channels fail', async () => {
      const { deliveryTracker } = await import('../services/notification/delivery-tracker.js');

      // Track both email and SMS as failed
      const emailLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'email');
      const smsLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'sms');

      await deliveryTracker.trackFailed(emailLogId, 'Email delivery failed');
      await deliveryTracker.trackFailed(smsLogId, 'SMS delivery failed');

      // Check if critical channels failed
      const criticalFailed = await deliveryTracker.checkCriticalChannelsFailed(
        testIncident.id,
        testUser.id
      );

      expect(criticalFailed).toBe(true);
    });

    it('should not flag critical failure if only one channel fails', async () => {
      const { deliveryTracker } = await import('../services/notification/delivery-tracker.js');

      // Only email fails
      const emailLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'email');
      const smsLogId = await deliveryTracker.trackQueued(testIncident.id, testUser.id, 'sms');

      await deliveryTracker.trackFailed(emailLogId, 'Email delivery failed');
      await deliveryTracker.trackSent(smsLogId, 'sms-123');

      const criticalFailed = await deliveryTracker.checkCriticalChannelsFailed(
        testIncident.id,
        testUser.id
      );

      expect(criticalFailed).toBe(false);
    });
  });
});
