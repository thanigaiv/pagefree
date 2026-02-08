/**
 * Status Subscription Integration Tests
 *
 * Tests the subscription flow through the statusSubscriberService:
 * - subscribe() - Create subscriptions with email/webhook/Slack
 * - verify() - Verify email subscriptions
 * - unsubscribeByDestination() - Unsubscribe via destination lookup
 *
 * These tests verify the service layer that powers the public endpoints:
 * - POST /status/:slug/subscribe
 * - GET /status/subscribe/verify
 * - GET /status/unsubscribe
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../config/database.js';
import { statusSubscriberService } from '../services/statusSubscriber.service.js';
import { statusPageService } from '../services/statusPage.service.js';

// Mock Redis for tests
vi.mock('../config/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  })),
  getRedisConnectionOptions: vi.fn(() => ({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

// Mock status notification queue for subscriber tests
vi.mock('../queues/statusNotification.queue.js', () => ({
  statusNotificationQueue: {
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
  },
}));

describe('Status Subscription Service - Endpoint Integration', () => {
  let statusPageId: string;
  let statusPageSlug: string;
  let teamId: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `sub-endpoint-test-${Date.now()}@example.com`,
        firstName: 'Sub',
        lastName: 'Test',
        platformRole: 'USER',
      },
    });
    userId = user.id;

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: `Subscription Test Team ${Date.now()}`,
      },
    });
    teamId = team.id;

    // Create test status page using service
    const statusPage = await statusPageService.create({
      teamId,
      name: 'Test Status Page',
      createdById: userId,
      isPublic: true,
    });
    statusPageId = statusPage.id;
    statusPageSlug = statusPage.slug;
  });

  afterAll(async () => {
    // Clean up in correct order for foreign keys
    await prisma.statusSubscriber.deleteMany({ where: { statusPageId } });
    await prisma.statusPage.deleteMany({ where: { id: statusPageId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  beforeEach(async () => {
    // Clean up subscribers between tests
    await prisma.statusSubscriber.deleteMany({ where: { statusPageId } });
  });

  // ============================================================================
  // SUBSCRIBE TESTS (POST /status/:slug/subscribe)
  // ============================================================================

  describe('subscribe() - POST /status/:slug/subscribe equivalent', () => {
    it('should create webhook subscription (auto-verified)', async () => {
      const result = await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://example.com/webhook'
      );

      expect(result.subscriber.id).toBeDefined();
      expect(result.subscriber.channel).toBe('WEBHOOK');
      expect(result.subscriber.destination).toBe('https://example.com/webhook');
      expect(result.subscriber.isVerified).toBe(true);
      expect(result.subscriber.isActive).toBe(true);
      expect(result.requiresVerification).toBe(false);

      // Verify in database
      const subscriber = await prisma.statusSubscriber.findFirst({
        where: { statusPageId, destination: 'https://example.com/webhook' },
      });
      expect(subscriber).toBeDefined();
      expect(subscriber?.isVerified).toBe(true);
      expect(subscriber?.isActive).toBe(true);
    });

    it('should create email subscription requiring verification', async () => {
      const result = await statusSubscriberService.subscribe(
        statusPageId,
        'EMAIL',
        'test@example.com'
      );

      expect(result.subscriber.id).toBeDefined();
      expect(result.subscriber.channel).toBe('EMAIL');
      expect(result.subscriber.isVerified).toBe(false);
      expect(result.subscriber.verifyToken).toBeDefined();
      expect(result.requiresVerification).toBe(true);

      // Verify in database
      const subscriber = await prisma.statusSubscriber.findFirst({
        where: { statusPageId, destination: 'test@example.com' },
      });
      expect(subscriber).toBeDefined();
      expect(subscriber?.isVerified).toBe(false);
      expect(subscriber?.verifyToken).not.toBeNull();
    });

    it('should throw error for duplicate active subscription', async () => {
      // Create first subscription
      await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://example.com/duplicate'
      );

      // Try duplicate - should throw
      await expect(
        statusSubscriberService.subscribe(
          statusPageId,
          'WEBHOOK',
          'https://example.com/duplicate'
        )
      ).rejects.toThrow('Already subscribed');
    });

    it('should reactivate inactive subscription', async () => {
      // Create and then deactivate subscription
      const initial = await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://example.com/reactivate'
      );
      await statusSubscriberService.unsubscribe(initial.subscriber.id);

      // Verify it's inactive
      const deactivated = await prisma.statusSubscriber.findUnique({
        where: { id: initial.subscriber.id },
      });
      expect(deactivated?.isActive).toBe(false);

      // Re-subscribe should reactivate
      const reactivated = await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://example.com/reactivate'
      );

      expect(reactivated.subscriber.isActive).toBe(true);
      expect(reactivated.requiresVerification).toBe(false);
    });

    it('should create Slack subscription (auto-verified)', async () => {
      const result = await statusSubscriberService.subscribe(
        statusPageId,
        'SLACK',
        '#status-updates'
      );

      expect(result.subscriber.id).toBeDefined();
      expect(result.subscriber.channel).toBe('SLACK');
      expect(result.subscriber.isVerified).toBe(true);
      expect(result.requiresVerification).toBe(false);
    });

    it('should accept optional componentIds and notifyOn', async () => {
      const result = await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://example.com/with-options',
        {
          componentIds: ['comp-1', 'comp-2'],
          notifyOn: ['outage', 'resolved'],
        }
      );

      expect(result.subscriber.componentIds).toEqual(['comp-1', 'comp-2']);
      expect(result.subscriber.notifyOn).toEqual(['outage', 'resolved']);
    });
  });

  // ============================================================================
  // VERIFY TESTS (GET /status/subscribe/verify)
  // ============================================================================

  describe('verify() - GET /status/subscribe/verify equivalent', () => {
    it('should verify valid token', async () => {
      // Create subscription with verification token
      const subscriber = await prisma.statusSubscriber.create({
        data: {
          statusPageId,
          channel: 'EMAIL',
          destination: 'verify-test@example.com',
          isVerified: false,
          verifyToken: 'test-verify-token-123',
        },
      });

      const result = await statusSubscriberService.verify('test-verify-token-123');

      expect(result).toBe(true);

      // Verify in database
      const updated = await prisma.statusSubscriber.findUnique({
        where: { id: subscriber.id },
      });
      expect(updated?.isVerified).toBe(true);
      expect(updated?.verifyToken).toBeNull();
    });

    it('should return false for invalid token', async () => {
      const result = await statusSubscriberService.verify('invalid-token');
      expect(result).toBe(false);
    });

    it('should return false for already-used token', async () => {
      // Create verified subscriber (no token)
      await prisma.statusSubscriber.create({
        data: {
          statusPageId,
          channel: 'EMAIL',
          destination: 'already-verified@example.com',
          isVerified: true,
          verifyToken: null,
        },
      });

      // Try to verify with any token - should fail
      const result = await statusSubscriberService.verify('any-token');
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // UNSUBSCRIBE TESTS (GET /status/unsubscribe)
  // ============================================================================

  describe('unsubscribeByDestination() - GET /status/unsubscribe equivalent', () => {
    it('should unsubscribe active subscriber', async () => {
      // Create active subscription
      await prisma.statusSubscriber.create({
        data: {
          statusPageId,
          channel: 'WEBHOOK',
          destination: 'https://example.com/unsub-test',
          isVerified: true,
          isActive: true,
        },
      });

      const result = await statusSubscriberService.unsubscribeByDestination(
        statusPageId,
        'https://example.com/unsub-test'
      );

      expect(result).toBe(true);

      // Verify in database
      const subscriber = await prisma.statusSubscriber.findFirst({
        where: { statusPageId, destination: 'https://example.com/unsub-test' },
      });
      expect(subscriber?.isActive).toBe(false);
    });

    it('should return false for non-existent subscription', async () => {
      const result = await statusSubscriberService.unsubscribeByDestination(
        statusPageId,
        'nonexistent@example.com'
      );

      expect(result).toBe(false);
    });

    it('should return false for already unsubscribed', async () => {
      // Create inactive subscription
      await prisma.statusSubscriber.create({
        data: {
          statusPageId,
          channel: 'WEBHOOK',
          destination: 'https://example.com/already-unsub',
          isVerified: true,
          isActive: false,
        },
      });

      const result = await statusSubscriberService.unsubscribeByDestination(
        statusPageId,
        'https://example.com/already-unsub'
      );

      expect(result).toBe(false);
    });

    it('should handle email unsubscription', async () => {
      // Create active email subscription
      await prisma.statusSubscriber.create({
        data: {
          statusPageId,
          channel: 'EMAIL',
          destination: 'email-unsub@example.com',
          isVerified: true,
          isActive: true,
        },
      });

      const result = await statusSubscriberService.unsubscribeByDestination(
        statusPageId,
        'email-unsub@example.com'
      );

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // STATUS PAGE ACCESS TESTS
  // ============================================================================

  describe('Status page access for subscription', () => {
    it('should allow subscription to public status page', async () => {
      // The test status page is public - subscription should work
      const result = await statusSubscriberService.subscribe(
        statusPageId,
        'WEBHOOK',
        'https://public-test.com/webhook'
      );

      expect(result.subscriber.id).toBeDefined();
    });

    it('should use getBySlug for public page access', async () => {
      // Verify the status page can be accessed by slug
      const page = await statusPageService.getBySlug(statusPageSlug);

      expect(page).not.toBeNull();
      expect(page?.id).toBe(statusPageId);
    });
  });
});
